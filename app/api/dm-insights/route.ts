import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

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

interface MailingSummary {
  id: number;
  name: string;
  scheduleTime: string;
  recipients: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  bounces: number;
  unsubscriptions: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  clickToOpenRate: number;
}

interface Totals {
  mailings: number;
  recipients: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  bounces: number;
  unsubscriptions: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgBounceRate: number;
  avgUnsubRate: number;
  avgCtor: number;
}

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

/* ---------- Context Builder ---------- */

function buildAnalysisContext(mailings: MailingSummary[], totals: Totals, dateRange: RequestBody["dateRange"]): string {
  const lines: string[] = [];

  const presetLabels: Record<string, string> = {
    "7d": "laatste 7 dagen",
    "30d": "laatste 30 dagen",
    "90d": "laatste 90 dagen",
    "6m": "laatste 6 maanden",
    "1y": "laatste jaar",
  };

  lines.push(`PERIODE: ${presetLabels[dateRange.preset] || dateRange.preset} (${dateRange.from} t/m ${dateRange.to})`);
  lines.push("");

  lines.push("TOTALEN:");
  lines.push(`  Aantal mailings: ${totals.mailings}`);
  lines.push(`  Totaal ontvangers: ${totals.recipients}`);
  lines.push(`  Gem. open rate: ${totals.avgOpenRate.toFixed(1)}%`);
  lines.push(`  Gem. click rate: ${totals.avgClickRate.toFixed(1)}%`);
  lines.push(`  Gem. CTOR: ${totals.avgCtor.toFixed(1)}%`);
  lines.push(`  Gem. bounce rate: ${totals.avgBounceRate.toFixed(1)}%`);
  lines.push(`  Gem. unsub rate: ${totals.avgUnsubRate.toFixed(1)}%`);
  lines.push(`  Totaal unieke opens: ${totals.uniqueOpens}`);
  lines.push(`  Totaal unieke clicks: ${totals.uniqueClicks}`);
  lines.push(`  Totaal bounces: ${totals.bounces}`);
  lines.push(`  Totaal uitschrijvingen: ${totals.unsubscriptions}`);
  lines.push("");

  const sorted = [...mailings].sort(
    (a, b) => new Date(a.scheduleTime).getTime() - new Date(b.scheduleTime).getTime()
  );
  const capped = sorted.slice(0, 50);

  lines.push(`MAILINGS (${capped.length}${mailings.length > 50 ? ` van ${mailings.length}` : ""}):`);
  lines.push("Naam | Datum | Ontvangers | Open% | Click% | Bounce% | Unsub% | CTOR%");
  lines.push("-".repeat(90));
  for (const m of capped) {
    const date = m.scheduleTime ? m.scheduleTime.slice(0, 10) : "—";
    lines.push(
      `${m.name} | ${date} | ${m.recipients} | ${m.openRate.toFixed(1)} | ${m.clickRate.toFixed(1)} | ${m.bounceRate.toFixed(1)} | ${m.unsubscribeRate.toFixed(1)} | ${m.clickToOpenRate.toFixed(1)}`
    );
  }
  lines.push("");

  // Derived stats
  if (mailings.length >= 3) {
    const byOpen = [...mailings].sort((a, b) => b.openRate - a.openRate);
    lines.push("TOP 3 (open rate):");
    for (const m of byOpen.slice(0, 3)) {
      lines.push(`  ${m.name} — ${m.openRate.toFixed(1)}% open, ${m.clickRate.toFixed(1)}% click`);
    }
    lines.push("BOTTOM 3 (open rate):");
    for (const m of byOpen.slice(-3).reverse()) {
      lines.push(`  ${m.name} — ${m.openRate.toFixed(1)}% open, ${m.clickRate.toFixed(1)}% click`);
    }
    lines.push("");
  }

  if (sorted.length >= 4) {
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);
    const avgFirst = firstHalf.reduce((s, m) => s + m.openRate, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, m) => s + m.openRate, 0) / secondHalf.length;
    const diff = avgSecond - avgFirst;
    lines.push(`TREND: Open rate eerste helft periode: ${avgFirst.toFixed(1)}%, tweede helft: ${avgSecond.toFixed(1)}% (${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp)`);

    const avgFirstClick = firstHalf.reduce((s, m) => s + m.clickRate, 0) / firstHalf.length;
    const avgSecondClick = secondHalf.reduce((s, m) => s + m.clickRate, 0) / secondHalf.length;
    const diffClick = avgSecondClick - avgFirstClick;
    lines.push(`TREND: Click rate eerste helft: ${avgFirstClick.toFixed(1)}%, tweede helft: ${avgSecondClick.toFixed(1)}% (${diffClick >= 0 ? "+" : ""}${diffClick.toFixed(1)}pp)`);
    lines.push("");
  }

  if (mailings.length >= 3) {
    const meanOpen = totals.avgOpenRate;
    const variance = mailings.reduce((s, m) => s + Math.pow(m.openRate - meanOpen, 2), 0) / mailings.length;
    lines.push(`SPREIDING: Standaarddeviatie open rate: ${Math.sqrt(variance).toFixed(1)}pp`);
  }

  return lines.join("\n");
}

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
