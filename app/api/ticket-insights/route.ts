import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildAnalysisContext } from "@/lib/ticket-analysis";
import type { TicketEvent } from "@/lib/ticket-analysis";
import { authorize } from "@/lib/auth";


/* ---------- Types ---------- */

interface RequestBody {
  events: TicketEvent[];
}

/* ---------- System Prompt ---------- */

const SYSTEM_PROMPT = `Je bent een senior ticket sales strateeg voor PSV Eindhoven. Je analyseert de actuele ticketbeschikbaarheid en -verkoop en geeft bruikbare inzichten.

CONTEXT: PSV is een profvoetbalclub. De ticketdata is een momentopname van de huidige beschikbaarheid over alle events: wedstrijden (PSV, Jong PSV, PSV Vrouwen), stadiontours, museumbezoeken, jeugdactiviteiten en evenementen.

BELANGRIJK — VOEG WAARDE TOE:
- Herhaal NOOIT simpelweg de cijfers. De gebruiker ziet die al in het dashboard.
- Focus op URGENTIE: welke events dreigen uitverkocht te raken en verdienen aandacht?
- Focus op PATRONEN: zijn er categorieën die structureel beter of slechter verkopen?
- Focus op KANSEN: welke events hebben nog veel ruimte en verdienen promotie?
- Gebruik eventnames en datums om concrete context te geven.

BENCHMARKS:
- Bezetting >95%: bijna uitverkocht — actie of communicatie gewenst
- Bezetting 75-95%: goed op weg
- Bezetting <50%: mogelijk extra promotie nodig
- Meerdere uitverkochte wedstrijden: signaal van hoge vraag, wachtlijst overwegen

RESPONSE FORMAT (retourneer ALLEEN geldige JSON, geen markdown):
{
  "summary": "2-3 zinnen met de belangrijkste bevinding en overall beeld",
  "highlights": [
    { "type": "trend|anomaly|achievement|warning|opportunity", "text": "Concreet inzicht met eventnamen en percentages" }
  ],
  "recommendations": ["Concrete aanbeveling vanuit de data"],
  "highestDemand": { "name": "Eventnaam", "metric": "bijv. 98% bezet, 45 tickets over", "action": "Wat te doen" },
  "mostAvailable": { "name": "Eventnaam", "metric": "bijv. 23% bezet, 1.200 tickets beschikbaar", "action": "Promotietip" }
}

REGELS:
- Maximaal 5 highlights, minimaal 2
- Maximaal 4 recommendations, minimaal 1
- highestDemand/mostAvailable: kies het meest relevante event (alleen echte events, geen packages/fietsenstalling)
- Schrijf altijd in het Nederlands
- Noem concrete eventnamen, datums en percentages
- Strip datum-prefixen uit eventnamen indien aanwezig`;

/* ---------- POST Handler ---------- */

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[ticket-insights] ANTHROPIC_API_KEY ontbreekt.");
    return NextResponse.json({ error: "Server configuratie fout" }, { status: 500 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  if (!body.events?.length)
    return NextResponse.json({ error: "Geen events om te analyseren." }, { status: 400 });

  const context = buildAnalysisContext(body.events);
  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyseer de volgende ticket data en retourneer je inzichten als JSON:\n\n${context}`,
        },
      ],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch =
      responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
      responseText.match(/(\{[\s\S]*\})/);

    if (!jsonMatch)
      return NextResponse.json({ error: "Analyse retourneerde geen geldige JSON." }, { status: 500 });

    const result = JSON.parse(jsonMatch[1].trim());

    // Normalise
    function toStr(v: unknown): string {
      if (typeof v === "string") return v;
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        return String(o.text ?? o.value ?? o.content ?? JSON.stringify(v));
      }
      return String(v ?? "");
    }
    if (Array.isArray(result.recommendations)) result.recommendations = result.recommendations.map(toStr);
    if (Array.isArray(result.highlights)) {
      result.highlights = result.highlights.map((h: unknown) => {
        if (h && typeof h === "object") {
          const o = h as Record<string, unknown>;
          return { type: String(o.type ?? "trend"), text: toStr(o.text ?? h) };
        }
        return { type: "trend", text: toStr(h) };
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "Analyse retourneerde geen geldige JSON." }, { status: 500 });
    return NextResponse.json(
      { error: "Analyse mislukt.", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
