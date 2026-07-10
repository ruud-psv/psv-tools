import { runInsightAnalysis } from "./runner";

export interface FanstoreInsightInput {
  from: string;
  to: string;
  totals: {
    revenue: number;
    transactions: number;
    avgOrderValue: number;
    itemsPurchased: number;
  };
  products: { name: string; revenue: number; itemsPurchased: number }[];
  topCategories?: { category: string; revenue: number; transactions: number }[];
  /** Gevuld wanneer het rapport op specifieke producten filtert. */
  selectedProducts?: string[];
}

export interface FanstoreInsightResult {
  summary: string;
  highlights: { type: string; text: string }[];
  recommendations: string[];
  topProduct: { name: string; metric: string; why: string } | null;
  attentionNeeded: { name: string; metric: string; action: string } | null;
}

const SYSTEM_PROMPT = `Je bent een senior e-commerce analist voor de PSV Fanstore (psvfanstore.nl), de officiële merchandise webshop van PSV Eindhoven. Je analyseert verkoopdata uit Google Analytics en geeft bruikbare inzichten.

CONTEXT: De Fanstore verkoopt wedstrijdshirts, trainingskleding, fanartikelen en cadeaus. Verkoop piekt rond shirt-lanceringen, topwedstrijden, feestdagen en kampioenschappen.

BELANGRIJK — VOEG WAARDE TOE:
- Herhaal NOOIT simpelweg de cijfers. De gebruiker ziet die al in het rapport.
- Focus op VERHOUDINGEN: welke producten domineren de omzet? Is de omzet geconcentreerd of gespreid?
- Focus op PRIJS VS. VOLUME: verkoopt een product veel stuks met lage omzet, of weinig stuks met hoge omzet?
- Focus op KANSEN: welke producten of categorieën verdienen meer promotie?
- Als er specifieke producten geselecteerd zijn: vergelijk ze onderling en met de totale winkelomzet.

RESPONSE FORMAT (retourneer ALLEEN geldige JSON, geen markdown):
{
  "summary": "2-3 zinnen met het belangrijkste inzicht over de verkoop",
  "highlights": [
    { "type": "trend|anomaly|achievement|warning|opportunity", "text": "Concreet inzicht met productnamen en cijfers" }
  ],
  "recommendations": ["Concrete aanbeveling met onderbouwing"],
  "topProduct": { "name": "Productnaam", "metric": "bijv. €12.500 omzet, 340 stuks", "why": "Verklaring" },
  "attentionNeeded": { "name": "Productnaam of categorie", "metric": "bijv. slechts 12 stuks verkocht", "action": "Wat te doen" }
}

REGELS:
- Maximaal 5 highlights, minimaal 2
- Maximaal 4 recommendations, minimaal 1
- topProduct/attentionNeeded: alleen als er minstens 2 producten zijn, anders null
- Schrijf altijd in het Nederlands
- Wees specifiek met productnamen, aantallen en euro-bedragen`;

function euro(n: number): string {
  return `€${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildContext(input: FanstoreInsightInput): string {
  const lines: string[] = [];
  lines.push(`PERIODE: ${input.from} t/m ${input.to}`);
  lines.push("");

  if (input.selectedProducts && input.selectedProducts.length > 0) {
    lines.push(`GESELECTEERDE PRODUCTEN IN DIT RAPPORT: ${input.selectedProducts.join(", ")}`);
    lines.push("");
  }

  const t = input.totals;
  lines.push("TOTALEN:");
  lines.push(`  Omzet: ${euro(t.revenue)} | Transacties: ${t.transactions.toLocaleString("nl-NL")}`);
  lines.push(`  Gem. orderwaarde: ${euro(t.avgOrderValue)} | Stuks verkocht: ${t.itemsPurchased.toLocaleString("nl-NL")}`);
  lines.push("");

  if (input.products.length > 0) {
    lines.push(input.selectedProducts?.length ? "GESELECTEERDE PRODUCTEN:" : "TOP PRODUCTEN:");
    for (const p of input.products.slice(0, 20)) {
      lines.push(`  ${p.name}: ${euro(p.revenue)} omzet, ${p.itemsPurchased.toLocaleString("nl-NL")} stuks`);
    }
    lines.push("");
  }

  if (input.topCategories && input.topCategories.length > 0) {
    lines.push("TOP CATEGORIEËN:");
    for (const c of input.topCategories.slice(0, 8)) {
      lines.push(`  ${c.category}: ${euro(c.revenue)} omzet, ${c.transactions.toLocaleString("nl-NL")} transacties`);
    }
  }

  return lines.join("\n");
}

export async function analyzeFanstore(input: FanstoreInsightInput): Promise<FanstoreInsightResult> {
  const context = buildContext(input);
  return runInsightAnalysis<FanstoreInsightResult>({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `Analyseer de volgende Fanstore verkoopdata en retourneer je inzichten als JSON:\n\n${context}`,
  });
}
