import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/* ---------- Auth ---------- */

function parseBasicAuth(header: string | null) {
  if (!header?.startsWith("Basic ")) return null;
  const encoded = header.slice(6).trim();
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep === -1) return null;
    return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

function authorize(sessionCookie: string | undefined): string | null {
  const expectedUser = process.env.PSV_AUTH_USER;
  const expectedPass = process.env.PSV_AUTH_PASS;
  if (!expectedUser || !expectedPass) return "Beveiliging is niet geconfigureerd.";
  if (!sessionCookie) return "Geen sessie gevonden. Log opnieuw in.";
  const credentials = parseBasicAuth(sessionCookie);
  if (!credentials) return "Ongeldige sessie.";
  if (credentials.user !== expectedUser || credentials.pass !== expectedPass) return "Ongeldige inloggegevens.";
  return null;
}

/* ---------- Types ---------- */

interface TicketEvent {
  eventId: string;
  eventName: string;
  eventDate: string;
  category: string;
  subCategory: string;
  soldTickets: number;
  availableCapacity: number;
  totalCapacity: number;
  saleStatus: string;
}

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

/* ---------- Context Builder ---------- */

export function buildAnalysisContext(events: TicketEvent[]): string {
  const lines: string[] = [];

  const mainEvents = events.filter(
    (e) =>
      !e.eventName.toLowerCase().startsWith("package") &&
      !e.eventName.toLowerCase().startsWith("fietsenstalling") &&
      !e.eventName.toLowerCase().startsWith("psv direct")
  );

  const totalSold = mainEvents.reduce((s, e) => s + e.soldTickets, 0);
  const totalAvailable = mainEvents.reduce((s, e) => s + e.availableCapacity, 0);
  const totalCapacity = mainEvents.reduce((s, e) => s + e.totalCapacity, 0);
  const soldOut = mainEvents.filter((e) => e.availableCapacity === 0).length;
  const nearlyFull = mainEvents.filter(
    (e) => e.availableCapacity > 0 && e.totalCapacity > 0 && e.soldTickets / e.totalCapacity >= 0.85
  ).length;

  lines.push("OVERZICHT (alle events, momentopname):");
  lines.push(`  Totaal events: ${mainEvents.length}`);
  lines.push(`  Totaal verkocht: ${totalSold.toLocaleString("nl-NL")}`);
  lines.push(`  Totaal beschikbaar: ${totalAvailable.toLocaleString("nl-NL")}`);
  lines.push(
    `  Totale capaciteit: ${totalCapacity.toLocaleString("nl-NL")} (${totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0}% bezet)`
  );
  lines.push(`  Uitverkocht: ${soldOut} events`);
  lines.push(`  Bijna vol (>85%): ${nearlyFull} events`);
  lines.push("");

  // Per category
  const catMap: Record<string, { sold: number; available: number; capacity: number; count: number; soldOut: number }> = {};
  for (const e of mainEvents) {
    const c = e.category || "Overig";
    if (!catMap[c]) catMap[c] = { sold: 0, available: 0, capacity: 0, count: 0, soldOut: 0 };
    catMap[c].sold += e.soldTickets;
    catMap[c].available += e.availableCapacity;
    catMap[c].capacity += e.totalCapacity;
    catMap[c].count++;
    if (e.availableCapacity === 0) catMap[c].soldOut++;
  }
  lines.push("PER CATEGORIE:");
  for (const [cat, v] of Object.entries(catMap)) {
    const pct = v.capacity > 0 ? Math.round((v.sold / v.capacity) * 100) : 0;
    lines.push(`  ${cat}: ${v.count} events, ${v.sold.toLocaleString("nl-NL")} verkocht, ${v.available.toLocaleString("nl-NL")} beschikbaar, ${pct}% bezet, ${v.soldOut} uitverkocht`);
  }
  lines.push("");

  // Sorted by occupancy
  const sorted = [...mainEvents]
    .filter((e) => e.totalCapacity > 0)
    .sort((a, b) => b.soldTickets / b.totalCapacity - a.soldTickets / a.totalCapacity)
    .slice(0, 30);

  lines.push("EVENTS (gesorteerd op bezetting, max 30):");
  lines.push("Naam | Datum | Categorie | Verkocht | Beschikbaar | Totaal | Bezetting%");
  lines.push("-".repeat(100));
  for (const e of sorted) {
    const pct = Math.round((e.soldTickets / e.totalCapacity) * 100);
    const date = e.eventDate ? e.eventDate.slice(0, 10) : "—";
    lines.push(
      `${e.eventName} | ${date} | ${e.category} | ${e.soldTickets} | ${e.availableCapacity} | ${e.totalCapacity} | ${pct}%`
    );
  }

  return lines.join("\n");
}

/* ---------- POST Handler ---------- */

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "ANTHROPIC_API_KEY ontbreekt in de server omgeving." }, { status: 500 });

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
