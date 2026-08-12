import { runInsightAnalysis } from "./runner";

/* Compacte samenvattingen per bron — de deelpagina stuurt deze mee zodat één
 * gecombineerde analyse over alle inzichten tegelijk gemaakt kan worden. */

export interface CombinedDm {
  from: string; to: string;
  mailings: number; recipients: number;
  avgOpenRate: number; avgClickRate: number; avgCtor: number;
  bounces: number; unsubscriptions: number;
  top: { name: string; openRate: number; clickRate: number; recipients: number }[];
}

export interface CombinedTicket {
  mode: "current" | "period";
  from?: string; to?: string;
  events: number; sold: number; available: number; capacity: number; occupancy: number;
  soldOut: number; nearlyFull: number; periodSold?: number;
  top: { name: string; category: string; occupancy: number; soldInPeriod?: number | null }[];
}

export interface CombinedWebSite {
  site: string;
  totals: { sessions: number; users: number; pageviews: number; newUsers: number; bounceRate: number; engagementRate: number };
  topSources: { source: string; sessions: number }[];
  topPages: { path: string; pageviews: number }[];
}

export interface CombinedWeb {
  from: string; to: string;
  sites: CombinedWebSite[];
}

export interface CombinedFanstore {
  from: string; to: string; selected: boolean;
  totals: { revenue: number; transactions: number; avgOrderValue: number; itemsPurchased: number };
  products: { name: string; revenue: number; itemsPurchased: number }[];
}

export interface CombinedInsightInput {
  title?: string;
  intro?: string;
  dm?: CombinedDm;
  ticket?: CombinedTicket;
  web?: CombinedWeb;
  fanstore?: CombinedFanstore;
}

export interface CombinedInsightResult {
  summary: string;
  highlights: { type: string; text: string }[];
  recommendations: string[];
}

const SYSTEM_PROMPT = `Je bent een senior marketing- en data-analist voor PSV Eindhoven. Je krijgt de gecombineerde data van één rapportage die meerdere inzichten kan bevatten: e-mail/DM (Maileon), ticketverkoop, webverkeer (Google Analytics) en de Fanstore webshop.

JOUW TAAK: schrijf één samenhangende analyse die de bronnen in verband met elkaar brengt — niet vier losse stukjes. Zoek naar het overkoepelende verhaal van deze campagne/periode.

BELANGRIJK — VOEG WAARDE TOE:
- Herhaal NOOIT simpelweg de cijfers; de lezer ziet die al in het rapport.
- Leg VERBANDEN tussen bronnen: bv. een mailing die piek in webverkeer of ticketverkoop verklaart, of webverkeer dat niet omzet in verkoop.
- Focus op wat opvalt, wat goed gaat en waar kansen of aandachtspunten liggen.
- Wees concreet met namen, percentages en aantallen.

RESPONSE FORMAT (retourneer ALLEEN geldige JSON, geen markdown):
{
  "summary": "3-4 zinnen met het overkoepelende inzicht over deze rapportage",
  "highlights": [
    { "type": "trend|anomaly|achievement|warning|opportunity", "text": "Concreet inzicht, waar mogelijk met verband tussen bronnen" }
  ],
  "recommendations": ["Concrete, uitvoerbare aanbeveling met onderbouwing"]
}

REGELS:
- Maximaal 6 highlights, minimaal 3
- Maximaal 5 recommendations, minimaal 2
- Schrijf altijd in het Nederlands
- Baseer je uitsluitend op de aangeleverde data`;

function euro(n: number): string {
  return `€${n.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function num(n: number): string {
  return n.toLocaleString("nl-NL");
}

function buildContext(input: CombinedInsightInput): string {
  const lines: string[] = [];
  if (input.title) lines.push(`RAPPORT: ${input.title}`);
  if (input.intro) lines.push(`CONTEXT: ${input.intro}`);
  lines.push("");

  if (input.dm) {
    const d = input.dm;
    lines.push(`— DM / E-MAIL (${d.from} t/m ${d.to})`);
    lines.push(`  ${num(d.mailings)} mailings · ${num(d.recipients)} ontvangers · open ${d.avgOpenRate.toFixed(1)}% · click ${d.avgClickRate.toFixed(1)}% · CTOR ${d.avgCtor.toFixed(1)}%`);
    lines.push(`  ${num(d.bounces)} bounces · ${num(d.unsubscriptions)} uitschrijvingen`);
    if (d.top.length) {
      lines.push(`  Beste mailings (op open rate):`);
      for (const m of d.top) lines.push(`    • ${m.name} — open ${m.openRate.toFixed(1)}%, click ${m.clickRate.toFixed(1)}%, ${num(m.recipients)} ontvangers`);
    }
    lines.push("");
  }

  if (input.ticket) {
    const t = input.ticket;
    const scope = t.mode === "period" ? `verkoop ${t.from} t/m ${t.to}` : "actuele status";
    lines.push(`— TICKETING (${scope})`);
    lines.push(`  ${num(t.events)} events · ${num(t.sold)} verkocht · ${num(t.available)} beschikbaar · bezetting ${t.occupancy}%`);
    if (t.periodSold != null) lines.push(`  Verkocht in periode: ${num(t.periodSold)}`);
    lines.push(`  ${num(t.soldOut)} uitverkocht · ${num(t.nearlyFull)} bijna vol (>85%)`);
    if (t.top.length) {
      lines.push(`  Top events:`);
      for (const e of t.top) {
        const extra = e.soldInPeriod != null ? `, +${num(e.soldInPeriod)} in periode` : "";
        lines.push(`    • ${e.name} (${e.category}) — bezetting ${e.occupancy}%${extra}`);
      }
    }
    lines.push("");
  }

  if (input.web) {
    const w = input.web;
    const sites = w.sites ?? [];
    lines.push(`— WEBVERKEER (${w.from} t/m ${w.to}${sites.length > 1 ? `, ${sites.length} sites` : ""})`);
    for (const s of sites) {
      lines.push(`  ${s.site}:`);
      lines.push(`    ${num(s.totals.sessions)} sessies · ${num(s.totals.users)} gebruikers · ${num(s.totals.pageviews)} pageviews · bounce ${s.totals.bounceRate}% · engagement ${s.totals.engagementRate}%`);
      if (s.topSources.length) lines.push(`    Top bronnen: ${s.topSources.slice(0, 5).map((x) => `${x.source} (${num(x.sessions)})`).join(", ")}`);
      if (s.topPages.length) lines.push(`    Top pagina's: ${s.topPages.slice(0, 5).map((p) => `${p.path} (${num(p.pageviews)})`).join(", ")}`);
    }
    if (sites.length > 1) {
      lines.push(`  (Vergelijk de sites onderling waar dat iets toevoegt.)`);
    }
    lines.push("");
  }

  if (input.fanstore) {
    const f = input.fanstore;
    lines.push(`— FANSTORE (${f.from} t/m ${f.to}${f.selected ? ", geselecteerde producten" : ""})`);
    lines.push(`  Omzet ${euro(f.totals.revenue)} · ${num(f.totals.transactions)} transacties · gem. order ${euro(f.totals.avgOrderValue)} · ${num(f.totals.itemsPurchased)} stuks`);
    if (f.products.length) {
      lines.push(`  Top producten:`);
      for (const p of f.products.slice(0, 8)) lines.push(`    • ${p.name} — ${euro(p.revenue)}, ${num(p.itemsPurchased)} stuks`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function analyzeCombined(input: CombinedInsightInput): Promise<CombinedInsightResult> {
  const context = buildContext(input);
  return runInsightAnalysis<CombinedInsightResult>({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `Analyseer de volgende gecombineerde rapportagedata en retourneer je inzichten als JSON:\n\n${context}`,
  });
}
