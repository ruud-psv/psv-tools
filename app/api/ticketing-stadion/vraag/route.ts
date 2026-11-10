import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireEmail } from "@/lib/api-session";
import { readMatchSales } from "@/lib/ringside/store";
import { matchContext, overviewContext } from "@/lib/ticketing-stadion/context";
import { EVENT_ID, loadStadionMatch, loadStadionOverview, pickSalesSeries } from "@/lib/ticketing-stadion/load";

/**
 * De chat van Ticketing Stadion: vragen over de data die op de pagina staat.
 *
 * De browser stuurt alleen de vragen en welke pagina hij toont (het overzicht,
 * of een wedstrijd met de wedstrijden in de grafiek). De data zelf rekent de
 * server opnieuw uit met dezelfde functies als de pagina, zodat het antwoord
 * over precies die cijfers gaat en niemand er andere data in kan stoppen.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-opus-5-5";
const MAX_MESSAGES = 20;
const MAX_LENGTH = 2000;

const INSTRUCTIONS = `Je bent de data-assistent van Ticketing Stadion, een interne tool van PSV. Je beantwoordt vragen van medewerkers van PSV over de ticketverkoop van thuiswedstrijden van PSV in het Philips Stadion.

Gebruik alleen de data hieronder: dat is wat de gebruiker op dit moment op de pagina ziet. Reken waar nodig zelf (optellen, vergelijken, percentages), en noem de getallen waarop je antwoord rust. Staat iets niet in de data, zeg dan dat je het niet kunt zien in plaats van te gokken.

Begrippen:
- Verkocht: afgenomen tickets, zonder openstaande reserveringen. Bezetting = verkocht / capaciteit.
- Vrij: nog te koop. In de resale: verkocht, maar door de houder aangeboden; zo'n stoel telt ook als vrij in de groepjes.
- Groepjes vrije stoelen: vrije stoelen met opeenvolgende nummers in dezelfde rij van een vak. Een "tweetje" is een groepje van precies 2. Vraagt iemand hoeveel plekken er zijn voor 2 mensen naast elkaar, noem dan ook dat grotere groepjes op te splitsen zijn. Rijen worden genoteerd als r12:5-8 (rij 12, stoel 5 tot en met 8).
- Dagen voor de aftrap: 0 is de wedstrijddag.

Antwoord in het Nederlands, kort en direct, als een collega. Gebruik **vet** voor de kerngetallen en een lijstje met "- " als dat helpt; geen tabellen en geen kopjes.`;

interface Question {
  eventId?: unknown;
  compareIds?: unknown;
  messages?: unknown;
}

function cleanMessages(value: unknown): Anthropic.Beta.BetaMessageParam[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return null;
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const [i, item] of value.entries()) {
    const { role, content } = (item ?? {}) as { role?: unknown; content?: unknown };
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (role !== expected || typeof content !== "string" || !content.trim()) return null;
    messages.push({ role: expected, content: content.slice(0, MAX_LENGTH) });
  }
  return messages[messages.length - 1].role === "user" ? messages : null;
}

export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const body = (await req.json().catch(() => ({}))) as Question;
  const messages = cleanMessages(body.messages);
  if (!messages) return NextResponse.json({ error: "Stel een vraag." }, { status: 400 });

  const eventId = typeof body.eventId === "string" ? body.eventId.trim().toLowerCase() : "";
  if (eventId && !EVENT_ID.test(eventId)) return NextResponse.json({ error: "Onbekende wedstrijd." }, { status: 400 });
  const compareIds = Array.isArray(body.compareIds)
    ? body.compareIds.filter((id): id is string => typeof id === "string").map((id) => id.trim().toLowerCase())
    : [];

  let context: string;
  try {
    if (eventId) {
      const [data, sales] = await Promise.all([loadStadionMatch(eventId), readMatchSales()]);
      if (!data) return NextResponse.json({ error: "Voor deze wedstrijd is geen data gevonden." }, { status: 404 });
      context = matchContext(data, pickSalesSeries(sales, compareIds));
    } else {
      context = overviewContext(await loadStadionOverview());
    }
  } catch (error) {
    console.error("[ticketing-stadion/vraag] data laden mislukt:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "De data kon niet worden geladen." }, { status: 500 });
  }

  // `fallbacks` staat nog niet in de types van deze SDK-versie; de API kent hem
  // wel. Bij een onterechte weigering beantwoordt een ander model de vraag.
  const params: Anthropic.Beta.MessageCreateParamsNonStreaming & { fallbacks: "default" } = {
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [
      { type: "text", text: INSTRUCTIONS },
      // De data blijft gelijk zolang de pagina openstaat: gecachet, zodat
      // vervolgvragen hem niet opnieuw hoeven te verwerken.
      { type: "text", text: `DATA OP DE PAGINA\n\n${context}`, cache_control: { type: "ephemeral" } },
    ],
    messages,
  };

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create(params);
    if ((response.stop_reason as string) === "refusal") {
      return NextResponse.json({ answer: "Op deze vraag kan ik geen antwoord geven. Probeer het anders te formuleren." });
    }
    const answer = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return NextResponse.json({ answer: answer || "Ik heb hier geen antwoord op kunnen vinden." });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Het is even te druk. Probeer het over een minuut opnieuw." }, { status: 429 });
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("[ticketing-stadion/vraag] API-sleutel ongeldig of ontbreekt.");
      return NextResponse.json({ error: "De chat is niet goed ingesteld (API-sleutel)." }, { status: 500 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error("[ticketing-stadion/vraag]", error.status, error.message);
      return NextResponse.json({ error: "De vraag kon niet worden beantwoord." }, { status: 502 });
    }
    console.error("[ticketing-stadion/vraag]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "De vraag kon niet worden beantwoord." }, { status: 500 });
  }
}
