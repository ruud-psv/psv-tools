import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildKennisbankContext } from "@/lib/kennisbank";
import { requireEmail } from "@/lib/api-session";
import {
  getGesprek,
  isGesprekId,
  nieuwGesprekId,
  parseBerichten,
  saveGesprek,
  titelVan,
} from "@/lib/kennisbank-gesprekken";

export const dynamic = "force-dynamic";

/* ---------- System Prompt ---------- */

const ROLE_INSTRUCTIONS = `Je bent de kennisbank-assistent van PSV Tools. Je helpt collega's van het Digital Marketing-team van PSV met vragen over de tools en processen waarmee ze werken, zoals Maileon, TwoCircles, Playable, Azerion en Typeform.

Je antwoordt alleen op basis van de KENNISBANK hieronder. Die beschrijft hoe PSV met deze tools werkt; algemene kennis over een tool kan daarvan afwijken, dus die gebruik je niet. Staat het antwoord er niet of maar half in, zeg dat dan eerlijk: geef wat er wél staat en benoem wat ontbreekt, zonder stappen te verzinnen. De chat toont zelf een knop om het gat te melden, dus daar hoef je niet naar te verwijzen.

Schrijf in het Nederlands, kort en concreet, zoals een collega die het weet. Begin direct met het antwoord. Gebruik **vet** voor nadruk, "- " voor opsommingen en "1. " voor stappen die op volgorde moeten. Geen kopjes, geen tabellen en geen em-dash. Bij regels en selecties, zoals waardes die je altijd meeneemt, die afhangen van de briefing of die je altijd uitsluit, neem je de indeling exact over en verwissel je niets.

Elk onderdeel van de kennisbank heeft een bronlabel, bijvoorbeeld [bron: twocircles#audience-builder-seizoenkaarten-26-27]. Zet geen bronlabels in je lopende tekst. Sluit elk antwoord af met één laatste regel met de labels die je echt hebt gebruikt, zonder haken:
BRONNEN: twocircles#audience-builder-seizoenkaarten-26-27, maileon#accountstructuur
Heb je niets uit de kennisbank gebruikt, schrijf dan als laatste regel:
BRONNEN: geen`;

/** Wat de chat toont als het model een vraag weigert en er geen tekst kwam. */
const WEIGERING = "Deze vraag kan ik niet beantwoorden.\nBRONNEN: geen";

/* ---------- POST Handler ---------- */

/**
 * Beantwoordt een vraag uit de kennisbank-chat. Het antwoord komt als platte
 * tekst binnen terwijl het model schrijft; het id van het gesprek staat in de
 * header `X-Gesprek-Id`. Na het antwoord wordt het gesprek bewaard bij de
 * collega die de vraag stelde.
 */
export async function POST(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[kennisbank/question] ANTHROPIC_API_KEY ontbreekt.");
    return NextResponse.json({ error: "Server configuratie fout" }, { status: 500 });
  }

  let body: { gesprekId?: unknown; messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  const berichten = parseBerichten(body.messages);
  if (!berichten)
    return NextResponse.json({ error: "Geen vraag opgegeven." }, { status: 400 });

  const gesprekId = isGesprekId(body.gesprekId) ? body.gesprekId : nieuwGesprekId();
  const client = new Anthropic();

  const stream = client.messages.stream({
    model: "claude-haiku-5-5",
    max_tokens: 16000,
    output_config: { effort: "low" },
    system: [
      {
        type: "text",
        text: `${ROLE_INSTRUCTIONS}\n\nKENNISBANK:\n${buildKennisbankContext()}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: berichten,
  });

  const encoder = new TextEncoder();
  const tekststroom = new ReadableStream<Uint8Array>({
    async start(controller) {
      let antwoord = "";
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            antwoord += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal" && !antwoord.trim()) {
          antwoord = WEIGERING;
          controller.enqueue(encoder.encode(WEIGERING));
        }
      } catch (error) {
        console.error(
          "[kennisbank/question] Beantwoorden mislukt:",
          error instanceof Error ? error.message : String(error)
        );
        controller.error(error);
        return;
      }

      // Opslaan vóór het sluiten van de stroom: daarna kan de serverless
      // functie al bevroren zijn. Mislukt het, dan heeft de collega het
      // antwoord toch en ontbreekt alleen dit gesprek in de geschiedenis.
      try {
        const nu = new Date().toISOString();
        const bestaand = await getGesprek(auth.email, gesprekId);
        await saveGesprek(auth.email, {
          id: gesprekId,
          titel: bestaand?.titel ?? titelVan(berichten[0].content),
          berichten: [...berichten, { role: "assistant", content: antwoord.trim() }],
          createdAt: bestaand?.createdAt ?? nu,
          updatedAt: nu,
        });
      } catch (error) {
        console.error(
          "[kennisbank/question] Gesprek opslaan mislukt:",
          error instanceof Error ? error.message : String(error)
        );
      }
      controller.close();
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(tekststroom, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Gesprek-Id": gesprekId,
    },
  });
}
