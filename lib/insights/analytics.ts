import { runInsightAnalysis } from "./runner";

export interface AnalyticsSiteData {
  label: string;
  totals: {
    sessions: number;
    users: number;
    pageviews: number;
    newUsers: number;
    bounceRate: number;
    engagementRate: number;
  };
  topSources: { source: string; sessions: number }[];
  topPages: { path: string; pageviews: number }[];
  devices: { device: string; sessions: number; percentage: number }[];
}

export interface AnalyticsInsightInput {
  sites: Record<string, AnalyticsSiteData>;
  combined: { totals: { sessions: number; users: number; pageviews: number } };
  period: string;
}

export interface AnalyticsInsightResult {
  summary: string;
  highlights: { type: string; text: string }[];
  recommendations: string[];
  bestPerformer: { site: string; metric: string; why: string } | null;
  attentionNeeded: { site: string; metric: string; action: string } | null;
}

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

function buildContext(input: AnalyticsInsightInput): string {
  const lines: string[] = [];
  const periodLabels: Record<string, string> = {
    "7d": "laatste 7 dagen",
    "30d": "laatste 30 dagen",
    "90d": "laatste 90 dagen",
  };

  lines.push(`PERIODE: ${periodLabels[input.period] ?? input.period}`);
  lines.push("");
  lines.push("GECOMBINEERD:");
  lines.push(`  Sessies: ${input.combined.totals.sessions.toLocaleString("nl-NL")}`);
  lines.push(`  Gebruikers: ${input.combined.totals.users.toLocaleString("nl-NL")}`);
  lines.push(`  Pageviews: ${input.combined.totals.pageviews.toLocaleString("nl-NL")}`);
  lines.push("");

  for (const [key, site] of Object.entries(input.sites)) {
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

export async function analyzeAnalytics(input: AnalyticsInsightInput): Promise<AnalyticsInsightResult> {
  const context = buildContext(input);
  return runInsightAnalysis<AnalyticsInsightResult>({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `Analyseer de volgende web analytics data en retourneer je inzichten als JSON:\n\n${context}`,
  });
}
