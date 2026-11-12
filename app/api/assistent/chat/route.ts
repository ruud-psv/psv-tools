import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireEmail } from "@/lib/api-session";
import { getAccess } from "@/lib/access-store";
import { getGesprek, saveGesprek } from "@/lib/assistent/gesprekken";
import { invoerSchema, leesInvoer, toolsVoor, type AssistentTool } from "@/lib/assistent/toegang";
import { ASSISTENT_TOOLS } from "@/lib/assistent/tools";
import { isGesprekId, nieuwGesprekId, parseBerichten, titelVan } from "@/lib/kennisbank-gesprekken";
import { todayInAmsterdam } from "@/lib/ringside/seat-state";

/**
 * De assistent van PSV Tools: één chat over de databronnen heen.
 *
 * Het model krijgt de vraag en een lijst tools (`lib/assistent/tools.ts`) en
 * haalt zelf op wat het nodig heeft. Alleen de tools van pagina's die de
 * collega mag zien gaan mee, en de tools lezen alleen.
 *
 * Het antwoord komt binnen als regels JSON terwijl het model schrijft:
 * `{t:"tekst",d}` voor een stuk tekst, `{t:"bron",naam,label,href}` zodra een
 * tool is gebruikt en `{t:"fout",d}` als het misgaat. Het id van het gesprek
 * staat in de header `X-Gesprek-Id`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODEL = "claude-opus-5-5";
/** Zo vaak mag het model tools aanroepen voor één vraag. */
const MAX_RONDES = 8;

const INSTRUCTIES = `Je bent de assistent van PSV Tools, de interne tool van het Digital Marketing-team van PSV. Je beantwoordt vragen van collega's over de data en de werkwijzen in PSV Tools.

Je weet niets uit jezelf over de cijfers of de werkwijzen van PSV: haal alles op met de tools. Elke tool hoort bij een pagina in PSV Tools en geeft dezelfde data als die pagina. Een vraag kan meerdere bronnen nodig hebben; roep dan de tools tegelijk aan. Staat het antwoord niet in wat de tools teruggeven, of heb je voor de vraag geen tool, zeg dat dan in plaats van te gokken. Je kunt alleen lezen: iets aanmaken of wijzigen doet de collega zelf op de pagina.

Reken waar nodig zelf (optellen, vergelijken, percentages) en noem de getallen waarop je antwoord rust.

Begrippen bij ticketing:
- Verkocht: afgenomen tickets, zonder openstaande reserveringen. Bezetting = verkocht / capaciteit.
- Vrij: nog te koop. In de resale: verkocht, maar door de houder aangeboden; zo'n stoel telt ook als vrij in de groepjes.
- Groepjes vrije stoelen: vrije stoelen met opeenvolgende nummers in dezelfde rij van een vak. Een "tweetje" is een groepje van precies 2. Vraagt iemand hoeveel plekken er zijn voor 2 mensen naast elkaar, noem dan ook dat grotere groepjes op te splitsen zijn. Rijen worden genoteerd als r12:5-8 (rij 12, stoel 5 tot en met 8).
- Dagen voor de aftrap: 0 is de wedstrijddag.

De kennisbank beschrijft hoe PSV met een tool werkt; algemene kennis over die tool kan daarvan afwijken, dus die gebruik je niet. Neem bij regels en selecties de indeling exact over.

Antwoord in het Nederlands, kort en direct, als een collega. Begin met het antwoord. Gebruik **vet** voor de kerngetallen, "- " voor opsommingen en "1. " voor stappen op volgorde; geen tabellen, geen kopjes en geen em-dash. De chat toont zelf welke bronnen je hebt gebruikt, dus die hoef je niet op te sommen.`;

const WEIGERING = "Op deze vraag kan ik geen antwoord geven. Probeer het anders te formuleren.";

type Bericht = Anthropic.Beta.BetaMessageParam;

function toolParams(tools: AssistentTool[]): Anthropic.Beta.BetaTool[] {
  return tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: invoerSchema(tool) }));
}

async function voerUit(
  tools: AssistentTool[],
  aanroep: Anthropic.Beta.BetaToolUseBlock
): Promise<{ resultaat: Anthropic.Beta.BetaToolResultBlockParam; tool: AssistentTool | null }> {
  // Een mislukte aanroep telt niet als bron: `tool` blijft dan leeg.
  const fout = (tekst: string) => ({
    resultaat: { type: "tool_result" as const, tool_use_id: aanroep.id, is_error: true, content: tekst },
    tool: null,
  });
  // Opnieuw tegen de lijst van deze collega: een naam buiten die lijst wordt nooit uitgevoerd.
  const tool = tools.find((t) => t.name === aanroep.name);
  if (!tool) return fout("Deze tool bestaat niet of is voor deze collega niet beschikbaar.");
  const gelezen = leesInvoer(tool, aanroep.input);
  if ("fout" in gelezen) return fout(gelezen.fout);
  try {
    return { resultaat: { type: "tool_result", tool_use_id: aanroep.id, content: await tool.run(gelezen.invoer) }, tool };
  } catch (error) {
    console.error(`[assistent] tool ${tool.name} mislukt:`, error instanceof Error ? error.message : error);
    return fout("De data kon niet worden geladen. Probeer het niet opnieuw; meld dat deze bron nu niet bereikbaar is.");
  }
}

function foutmelding(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return "Het is even te druk. Probeer het over een minuut opnieuw.";
  if (error instanceof Anthropic.AuthenticationError) return "De assistent is niet goed ingesteld (API-sleutel).";
  return "De vraag kon niet worden beantwoord.";
}

export async function POST(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[assistent] ANTHROPIC_API_KEY ontbreekt.");
    return NextResponse.json({ error: "Server configuratie fout" }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as { gesprekId?: unknown; messages?: unknown };
  const berichten = parseBerichten(body.messages);
  if (!berichten) return NextResponse.json({ error: "Geen vraag opgegeven." }, { status: 400 });

  const access = await getAccess(auth.email);
  const tools = toolsVoor(access.pages, ASSISTENT_TOOLS);
  if (tools.length === 0) {
    return NextResponse.json({ error: "Je hebt geen toegang tot de pagina's waar de assistent uit put." }, { status: 403 });
  }

  const gesprekId = isGesprekId(body.gesprekId) ? body.gesprekId : nieuwGesprekId();
  const client = new Anthropic();
  const messages: Bericht[] = berichten.map(({ role, content }) => ({ role, content }));
  const encoder = new TextEncoder();
  const afgebroken = new AbortController();

  const stroom = new ReadableStream<Uint8Array>({
    async start(controller) {
      const stuur = (regel: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(regel)}\n`));
      let antwoord = "";
      const bronnen: string[] = [];

      try {
        for (let ronde = 0; ; ronde++) {
          // `fallbacks` staat nog niet in de types van deze SDK-versie; de API
          // kent hem wel. Bij een onterechte weigering beantwoordt een ander
          // model de vraag.
          const params: Anthropic.Beta.MessageCreateParamsStreaming & { fallbacks: "default" } = {
            model: MODEL,
            max_tokens: 16000,
            stream: true,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: { effort: "low" },
            system: [
              // Vast deel eerst en gecachet (samen met de tools); de datum erna.
              { type: "text", text: INSTRUCTIES, cache_control: { type: "ephemeral" } },
              { type: "text", text: `Vandaag is het ${todayInAmsterdam()}.` },
            ],
            tools: toolParams(tools),
            messages,
          };
          const stream = client.beta.messages.stream(params, { signal: afgebroken.signal });
          stream.on("text", (delta) => {
            antwoord += delta;
            stuur({ t: "tekst", d: delta });
          });
          const message = await stream.finalMessage();

          if ((message.stop_reason as string) === "refusal") {
            if (!antwoord.trim()) {
              antwoord = WEIGERING;
              stuur({ t: "tekst", d: WEIGERING });
            }
            break;
          }
          const aanroepen = message.content.filter(
            (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use"
          );
          if (aanroepen.length === 0) break;
          // Afgekapt midden in een aanroep: die invoer is niet te vertrouwen.
          if (message.stop_reason === "max_tokens") throw new Error("antwoord afgekapt tijdens een tool-aanroep");
          if (ronde >= MAX_RONDES) throw new Error("te veel tool-rondes voor één vraag");

          // Tekst vóór een aanroep is geen antwoord; het antwoord komt na de data.
          if (antwoord) {
            antwoord = "";
            stuur({ t: "wis" });
          }
          messages.push({ role: "assistant", content: message.content });
          const uitkomsten = await Promise.all(aanroepen.map((aanroep) => voerUit(tools, aanroep)));
          for (const { tool } of uitkomsten) {
            if (!tool || bronnen.includes(tool.name)) continue;
            bronnen.push(tool.name);
            stuur({ t: "bron", naam: tool.name, label: tool.label, href: tool.page });
          }
          messages.push({ role: "user", content: uitkomsten.map((u) => u.resultaat) });
        }
        if (!antwoord.trim()) throw new Error("leeg antwoord");
      } catch (error) {
        if (afgebroken.signal.aborted) return;
        if (error instanceof Anthropic.APIError) console.error("[assistent]", error.status, error.message);
        else console.error("[assistent]", error instanceof Error ? error.message : error);
        stuur({ t: "fout", d: foutmelding(error) });
        controller.close();
        return;
      }

      // Opslaan vóór het sluiten van de stroom: daarna kan de serverless
      // functie al bevroren zijn. Mislukt het, dan heeft de collega het
      // antwoord toch en ontbreekt alleen dit gesprek in de geschiedenis.
      try {
        const nu = new Date().toISOString();
        const bestaand = await getGesprek(auth.email, gesprekId);
        // De bronnen van eerdere antwoorden komen niet mee terug van de browser; neem ze over.
        const eerder = bestaand?.berichten ?? [];
        await saveGesprek(auth.email, {
          id: gesprekId,
          titel: bestaand?.titel ?? titelVan(berichten[0].content),
          berichten: [
            ...berichten.map((b, i) =>
              b.role === "assistant" && eerder[i]?.role === "assistant" && eerder[i].content === b.content
                ? eerder[i]
                : b
            ),
            { role: "assistant", content: antwoord.trim(), ...(bronnen.length > 0 && { bronnen }) },
          ],
          createdAt: bestaand?.createdAt ?? nu,
          updatedAt: nu,
        });
      } catch (error) {
        console.error("[assistent] gesprek opslaan mislukt:", error instanceof Error ? error.message : String(error));
      }
      controller.close();
    },
    cancel() {
      afgebroken.abort();
    },
  });

  return new Response(stroom, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Gesprek-Id": gesprekId,
    },
  });
}
