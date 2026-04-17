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

interface SiteTotals {
  sessions: number;
  users: number;
  pageviews: number;
  newUsers: number;
  bounceRate: number;
  engagementRate: number;
}

interface SiteData {
  label: string;
  totals: SiteTotals;
  topSources: { source: string; sessions: number }[];
  topPages: { path: string; pageviews: number }[];
  devices: { device: string; sessions: number; percentage: number }[];
}

interface RequestBody {
  sites: Record<string, SiteData>;
  combined: { totals: { sessions: number; users: number; pageviews: number } };
  period: string;
}

/* ---------- System Prompt ---------- */

const SYSTEM_PROMPT = `Je bent een senior digital analytics strateeg voor PSV Eindhoven. Je analyseert Google Analytics data van de PSV websites en geeft bruikbare inzichten.

CONTEXT: PSV beheert meerdere websites:
- psv.nl: hoofdwebsite (nieuws, wedstrijdinformatie)
- ticketshop.psv.nl: ticketverkoop
- psvfanstore.nl: merchandise webshop
- acties.psv.nl: commerciële acties en campagnes

BELANGRIJK — VOEG WAARDE TOE:
- Herhaal NOOIT simpelweg de cijfers. De gebruiker ziet die al in het dashboard.
- Focus op VERHOUDINGEN: hoe verhouden de sites zich tot elkaar? Welke site trekt relatief meer/minder verkeer?
- Focus op VERKEERSBRONNEN: welke bronnen domineren? Is er afhankelijkheid van één kanaal?
- Focus op ENGAGEMENT: bounce rate en engagement rate vertellen een verhaal over content-kwaliteit
- Focus op KANSEN: welke sites of pagina's verdienen meer aandacht?
- Vergelijk device-verdeling: is mobile-optimalisatie een prioriteit?

BENCHMARKS (sport/entertainment websites):
- Bounce rate <40% = uitstekend, 40-55% = goed, 55-70% = gemiddeld, >70% = aandachtspunt
- Engagement rate >65% = sterk, 50-65% = normaal, <50% = verbeterpunt
- Mobile traffic >60% is normaal voor sport-websites

RESPONSE FORMAT (retourneer ALLEEN geldige JSON, geen markdown):
{
  "summary": "2-3 zinnen met het belangrijkste inzicht over het totale webverkeer",
  "highlights": [
    { "type": "trend|anomaly|achievement|warning|opportunity", "text": "Concreet inzicht met sitenamen en cijfers" }
  ],
  "recommendations": ["Concrete aanbeveling met onderbouwing"],
  "bestPerformer": { "site": "Sitenaam", "metric": "bijv. hoogste engagement rate 72%", "why": "Verklaring" },
  "attentionNeeded": { "site": "Sitenaam", "metric": "bijv. bounce rate 68%", "action": "Wat te doen" }
}

REGELS:
- Maximaal 5 highlights, minimaal 2
- Maximaal 4 recommendations, minimaal 1
- bestPerformer/attentionNeeded: alleen als er minstens 2 sites zijn, anders null
- Schrijf altijd in het Nederlands
- Wees specifiek met sitenamen, percentages en verkeersbronnen`;

/* ---------- Context Builder ---------- */

function buildContext(body: RequestBody): string {
  const lines: string[] = [];
  const periodLabels: Record<string, string> = { "7d": "laatste 7 dagen", "30d": "laatste 30 dagen", "90d": "laatste 90 dagen" };

  lines.push(`PERIODE: ${periodLabels[body.period] ?? body.period}`);
  lines.push("");
  lines.push("GECOMBINEERD:");
  lines.push(`  Sessies: ${body.combined.totals.sessions.toLocaleString("nl-NL")}`);
  lines.push(`  Gebruikers: ${body.combined.totals.users.toLocaleString("nl-NL")}`);
  lines.push(`  Pageviews: ${body.combined.totals.pageviews.toLocaleString("nl-NL")}`);
  lines.push("");

  for (const [key, site] of Object.entries(body.sites)) {
    const t = site.totals;
    lines.push(`SITE: ${site.label} (${key})`);
    lines.push(`  Sessies: ${t.sessions.toLocaleString("nl-NL")} | Gebruikers: ${t.users.toLocaleString("nl-NL")} | Pageviews: ${t.pageviews.toLocaleString("nl-NL")}`);
    lines.push(`  Nieuwe gebruikers: ${t.newUsers.toLocaleString("nl-NL")} | Bounce rate: ${t.bounceRate}% | Engagement rate: ${t.engagementRate}%`);

    if (site.topSources?.length > 0) {
      lines.push(`  Top verkeersbronnen: ${site.topSources.slice(0, 5).map((s) => `${s.source} (${s.sessions})`).join(", ")}`);
    }
    if (site.topPages?.length > 0) {
      lines.push(`  Top pagina's: ${site.topPages.slice(0, 5).map((p) => `${p.path} (${p.pageviews})`).join(", ")}`);
    }
    if (site.devices?.length > 0) {
      lines.push(`  Devices: ${site.devices.map((d) => `${d.device} ${d.percentage}%`).join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/* ---------- POST Handler ---------- */

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY ontbreekt." }, { status: 500 });

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  if (!body.sites || Object.keys(body.sites).length === 0) {
    return NextResponse.json({ error: "Geen site data om te analyseren." }, { status: 400 });
  }

  const context = buildContext(body);
  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Analyseer de volgende web analytics data en retourneer je inzichten als JSON:\n\n${context}` }],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || responseText.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) return NextResponse.json({ error: "Analyse retourneerde geen geldige JSON." }, { status: 500 });

    const result = JSON.parse(jsonMatch[1].trim());

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
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Analyse retourneerde geen geldige JSON." }, { status: 500 });
    return NextResponse.json({ error: "Analyse mislukt.", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
