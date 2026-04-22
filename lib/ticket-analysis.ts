export interface TicketEvent {
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
