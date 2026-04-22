import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildAnalysisContext } from "@/lib/dm-analysis";
import type { MailingSummary, Totals } from "@/lib/dm-analysis";

/* ---------- Auth (same pattern as analyze-report) ---------- */

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

interface RequestBody {
  mailings: MailingSummary[];
  totals: Totals;
  dateRange: { preset: string; from: string; to: string };
}

/* ---------- System Prompt ---------- */

const SYSTEM_PROMPT = `Je bent een senior e-mail marketing strateeg voor PSV Eindhoven. Je analyseert Maileon mailing-prestaties en geeft bruikbare inzichten.

CONTEXT: PSV is een profvoetbalclub. Mailings gaan over wedstrijden, merchandise, seizoenskaarten, acties, en clubnieuws. Mailingnamen beginnen vaak met een datum (bijv. "2026.04.10 Wedstrijddag PSV-Ajax") — gebruik de naam om het type mailing af te leiden.

BELANGRIJK — VOEG WAARDE TOE:
- Herhaal NOOIT simpelweg de cijfers ("de open rate is 25%"). De gebruiker ziet die al in het dashboard.
- Focus op PATRONEN: welke types mailings presteren beter? Is er een trend over tijd?
- Focus op ANOMALIEEN: welke mailing wijkt sterk af van het gemiddelde en waarom zou dat kunnen zijn?
- Focus op ACTIEPUNTEN: wat kan het team concreet anders doen?
- Gebruik de mailingnamen om context af te leiden (bijv. "wedstrijd" mailings vs "merchandise" mailings)

BENCHMARK REFERENTIES (sport/entertainment sector):
- Open rate: <20% = onder gemiddeld, 20-30% = normaal, >30% = sterk, >40% = uitzonderlijk
- Click rate: <2% = onder gemiddeld, 2-5% = normaal, >5% = sterk
- CTOR: <10% = laag, 10-20% = normaal, >20% = sterk
- Bounce rate: >2% = aandachtspunt
- Unsubscribe rate: >0.5% = aandachtspunt

RESPONSE FORMAT (retourneer ALLEEN geldige JSON, geen markdown):
{
  "summary": "2-3 zinnen met de belangrijkste bevinding en overall beoordeling",
  "highlights": [
    { "type": "trend|anomaly|achievement|warning", "text": "Concreet inzicht met specifieke cijfers en mailingnamen" }
  ],
  "recommendations": ["Concrete aanbeveling met onderbouwing vanuit de data"],
  "topPerformer": { "name": "Mailingnaam zonder datum-prefix", "metric": "bijv. 42,3% open rate", "why": "Korte verklaring waarom deze goed presteerde" },
  "bottomPerformer": { "name": "Mailingnaam zonder datum-prefix", "metric": "bijv. 8,1% open rate", "suggestion": "Wat anders zou kunnen" }
}

REGELS:
- Maximaal 5 highlights, minimaal 2
- Maximaal 4 recommendations, minimaal 1
- topPerformer/bottomPerformer: alleen invullen als er minstens 3 mailings zijn, anders null
- Schrijf altijd in het Nederlands
- Wees specifiek: noem mailingnamen, datums, en percentages waar relevant
- Geen vage algemeenheden zoals "probeer A/B testen" tenzij de data daar specifiek aanleiding toe geeft
- Strip de datum-prefix (bijv. "2026.04.10 ") uit mailingnamen in je output`;

/* ---------- POST Handler ---------- */

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY ontbreekt in de server omgeving." },
      { status: 500 }
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  if (!body.mailings?.length) {
    return NextResponse.json({ error: "Geen mailings om te analyseren." }, { status: 400 });
  }

  const context = buildAnalysisContext(body.mailings, body.totals, body.dateRange);
  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyseer de volgende DM performance data en retourneer je inzichten als JSON:\n\n${context}`,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    const jsonMatch =
      responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
      responseText.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Analyse retourneerde geen geldige JSON." },
        { status: 500 }
      );
    }

    const result = JSON.parse(jsonMatch[1].trim());

    // Normalise: ensure arrays contain plain strings/objects regardless of how
    // the model formatted them (e.g. recommendations as [{text:"..."}, ...]).
    function toStr(v: unknown): string {
      if (typeof v === "string") return v;
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        return String(o.text ?? o.value ?? o.content ?? JSON.stringify(v));
      }
      return String(v ?? "");
    }

    if (Array.isArray(result.recommendations)) {
      result.recommendations = result.recommendations.map(toStr);
    }
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
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Analyse retourneerde geen geldige JSON." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      {
        error: "Analyse mislukt.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
