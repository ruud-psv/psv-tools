import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireEmail } from "@/lib/api-session";
import { buildPaidAdsContext } from "@/lib/paid-ads/analysis";
import { METHODE_TEKST } from "@/lib/paid-ads/methode";
import type { PaidAdsResponse } from "@/lib/paid-ads/types";

/**
 * Vragen stellen over het Paid Ads dashboard, voor wie er niet dagelijks in
 * werkt. Het model krijgt de cijfers die het dashboard op dat moment toont
 * (met de gekozen filters) en de afgesproken aanpak, en beantwoordt de vraag
 * in gewone taal. Een gesprek: vervolgvragen gaan over hetzelfde.
 *
 * Het antwoord komt binnen als regels JSON terwijl het model schrijft:
 * `{t:"tekst",d}` voor een stuk tekst en `{t:"fout",d}` als het misgaat.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODEL = "claude-opus-5-5";
/** Genoeg voor een gesprek; oudere beurten vallen eraf. */
const MAX_BERICHTEN = 20;
const MAX_VRAAG = 2000;

const INSTRUCTIES = `Je beantwoordt vragen over het Paid Ads dashboard van PSV Eindhoven: de betaalde campagnes op Meta, Google Ads, TikTok en LinkedIn. De vragen komen van collega's die niet dagelijks met advertenties werken, bijvoorbeeld van ticketing, merchandise of de directie.

Zo antwoord je:
- Begin met het antwoord op de vraag, in één of twee zinnen. Daarna pas de onderbouwing.
- Schrijf kort en in gewone taal. Leg een vakterm de eerste keer uit tussen haakjes, bijvoorbeeld "CPA (wat één aankoop of aanmelding kost)" of "ROAS (omzet per bestede euro)".
- Gebruik alleen de cijfers hieronder. Noem campagnes, koopredenen, bedragen en percentages waar ze het antwoord dragen. Bedragen als "€ 1.250", percentages als "12,4%". Reken niet anders af dan de data.
- Vergelijk eerlijk: zet een advertentie of campagne alleen naast andere uit dezelfde exploitatie en fase.
- Toets aan de afgesproken aanpak waar dat helpt: de koopredenen, de verdeling bewezen en testen, de drempel van € 150 voor een test, het CPA-doel.
- Staat het antwoord niet in de data, zeg dat dan, en zeg waar het wel te vinden is (bijvoorbeeld in Ads Manager).
- Opmaak: alinea's, opsommingen met "- " en **vet**. Geen tabellen of kopjes. Geen em-dash.
- Schrijf in het Nederlands.

${METHODE_TEKST}`;

const WEIGERING = "Op deze vraag kan ik geen antwoord geven. Stel hem gerust anders.";

interface Body {
  berichten?: { role?: unknown; content?: unknown }[];
  data?: PaidAdsResponse;
  /** Welke filters er in het dashboard aan staan, in woorden. */
  filters?: unknown;
  periode?: unknown;
}

export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag." }, { status: 400 });
  }

  const berichten: Anthropic.MessageParam[] = (body.berichten ?? [])
    .filter(
      (b): b is { role: "user" | "assistant"; content: string } =>
        (b.role === "user" || b.role === "assistant") && typeof b.content === "string" && b.content.trim() !== ""
    )
    .slice(-MAX_BERICHTEN)
    .map((b) => ({ role: b.role, content: b.content.slice(0, MAX_VRAAG * 4) }));
  // Een gesprek begint bij een vraag en eindigt op een vraag.
  while (berichten.length && berichten[0].role !== "user") berichten.shift();
  if (!berichten.length || berichten[berichten.length - 1].role !== "user") {
    return NextResponse.json({ error: "Geen vraag opgegeven." }, { status: 400 });
  }
  if ((berichten[berichten.length - 1].content as string).length > MAX_VRAAG) {
    return NextResponse.json({ error: "De vraag is te lang." }, { status: 400 });
  }
  if (!body.data?.campaigns?.length) {
    return NextResponse.json({ error: "Er is nog geen campagnedata om de vraag over te beantwoorden." }, { status: 400 });
  }

  const filters = typeof body.filters === "string" && body.filters ? body.filters.slice(0, 500) : "geen";
  const periode = typeof body.periode === "string" ? body.periode.slice(0, 100) : "";
  let context: string;
  try {
    context = buildPaidAdsContext(body.data);
  } catch (error) {
    console.error("[paid-ads/vraag] context bouwen mislukt:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "De dashboarddata is onvolledig." }, { status: 400 });
  }

  const client = new Anthropic();
  const encoder = new TextEncoder();
  const afgebroken = new AbortController();
  req.signal.addEventListener("abort", () => afgebroken.abort());

  const stroom = new ReadableStream<Uint8Array>({
    async start(controller) {
      const stuur = (regel: Record<string, string>) => controller.enqueue(encoder.encode(`${JSON.stringify(regel)}\n`));
      let antwoord = "";
      try {
        // `fallbacks` staat nog niet in de types van deze SDK-versie; de API
        // kent hem wel. Bij een onterechte weigering beantwoordt een ander
        // model de vraag.
        const params: Anthropic.Beta.MessageCreateParamsStreaming & { fallbacks: "default" } = {
          model: MODEL,
          max_tokens: 8000,
          stream: true,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium" },
          system: [
            { type: "text", text: INSTRUCTIES, cache_control: { type: "ephemeral" } },
            // De data blijft gelijk zolang het gesprek over dezelfde selectie gaat.
            {
              type: "text",
              text: `GEKOZEN IN HET DASHBOARD: periode ${periode || "onbekend"} · filters: ${filters}\n\nDATA:\n${context}`,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: berichten,
        };
        const stream = client.beta.messages.stream(params, { signal: afgebroken.signal });
        stream.on("text", (delta) => {
          antwoord += delta;
          stuur({ t: "tekst", d: delta });
        });
        const message = await stream.finalMessage();
        if ((message.stop_reason as string) === "refusal" && !antwoord.trim()) {
          stuur({ t: "tekst", d: WEIGERING });
        } else if (!antwoord.trim()) {
          throw new Error("leeg antwoord");
        }
      } catch (error) {
        if (afgebroken.signal.aborted) return;
        if (error instanceof Anthropic.APIError) console.error("[paid-ads/vraag]", error.status, error.message);
        else console.error("[paid-ads/vraag]", error instanceof Error ? error.message : error);
        stuur({
          t: "fout",
          d:
            error instanceof Anthropic.RateLimitError
              ? "Het is even druk. Probeer het over een minuut opnieuw."
              : "Het antwoord kon niet worden gemaakt. Probeer het opnieuw.",
        });
      }
      controller.close();
    },
    cancel() {
      afgebroken.abort();
    },
  });

  return new Response(stroom, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
