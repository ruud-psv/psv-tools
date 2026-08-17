import { FANDESK_CATEGORIES, FandeskCategory, FandeskTicket } from "@/lib/fandesk";

/**
 * Contextbouwers voor de FANdesk-analyse. Zelfde conventie als
 * `lib/ticket-analysis.ts` en `lib/dm-analysis.ts`: platte tekst die het model
 * leest, opgebouwd buiten `lib/insights/`.
 */

/** Eén thema zoals het model het teruggeeft en de store het bewaart. */
export interface FandeskTheme {
  label: string;
  count: number;
  example?: string;
}

/** Compacte historie per dag, als vergelijkingsmateriaal voor "wat opvalt". */
export interface DayHistoryEntry {
  day: string;
  total: number;
  themes: FandeskTheme[];
}

function categoryCounts(tickets: FandeskTicket[]): Record<FandeskCategory, number> {
  const counts = { Tickets: 0, FANstore: 0, Wedstrijdinformatie: 0, Overig: 0 };
  for (const t of tickets) counts[t.category]++;
  return counts;
}

function dutchDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  if (isNaN(date.getTime())) return day;
  return date.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Context voor de dagsamenvatting: de onderwerpregels van die dag per categorie,
 * plus de themalabels van de voorgaande dagen zodat het model kan zien of iets
 * afwijkt. Alleen labels uit de historie, geen ruwe tekst — dat houdt de prompt
 * compact en de vergelijking scherp.
 */
export function buildDayContext(args: {
  day: string;
  tickets: FandeskTicket[];
  history: DayHistoryEntry[];
}): string {
  const { day, tickets, history } = args;
  const counts = categoryCounts(tickets);
  const withTopic = tickets.filter((t) => t.topic);

  const lines: string[] = [];
  lines.push(`— DAG: ${dutchDay(day)} (${day})`);
  lines.push(`Totaal tickets: ${tickets.length}`);
  lines.push(
    `Per categorie: ${FANDESK_CATEGORIES.map((c) => `${c} ${counts[c]}`).join(", ")}`
  );
  lines.push(
    `Onderwerpregels beschikbaar: ${withTopic.length} van ${tickets.length}`
  );

  lines.push("");
  lines.push("— ONDERWERPREGELS VAN DEZE DAG (per categorie)");
  for (const category of FANDESK_CATEGORIES) {
    const inCategory = withTopic.filter((t) => t.category === category);
    if (!inCategory.length) continue;
    lines.push(`${category} (${inCategory.length}):`);
    for (const ticket of inCategory) lines.push(`  - ${ticket.topic}`);
  }
  if (!withTopic.length) {
    lines.push("(geen onderwerpregels aangeleverd voor deze dag)");
  }

  if (history.length) {
    lines.push("");
    lines.push("— HISTORIE VOORGAANDE DAGEN (ter vergelijking, nieuwste eerst)");
    for (const entry of history) {
      const themes = entry.themes.length
        ? entry.themes.map((t) => `${t.label} (${t.count})`).join(", ")
        : "geen thema's vastgelegd";
      lines.push(`${entry.day}: ${entry.total} tickets — ${themes}`);
    }
    const days = history.length;
    const avg = history.reduce((sum, e) => sum + e.total, 0) / days;
    lines.push("");
    lines.push(
      `Gemiddeld over deze ${days} voorgaande ${days === 1 ? "dag" : "dagen"}: ${avg.toFixed(1)} tickets per dag`
    );
  }

  return lines.join("\n");
}

/**
 * Context voor de periodesamenvatting: opgebouwd uit de al bestaande
 * dagsamenvattingen, niet uit de ruwe tickets. Zo is één AI-call genoeg en blijft
 * de periodetekst consistent met wat per dag is vastgesteld.
 */
export function buildPeriodContext(args: {
  from: string;
  to: string;
  total: number;
  byCategory: Record<FandeskCategory, number>;
  previousTotal: number;
  days: Array<{ day: string; total: number; summary: string; themes: FandeskTheme[] }>;
}): string {
  const { from, to, total, byCategory, previousTotal, days } = args;

  const lines: string[] = [];
  lines.push(`— PERIODE: ${from} t/m ${to} (${days.length} dagen met data)`);
  lines.push(`Totaal tickets: ${total}`);
  lines.push(
    `Per categorie: ${FANDESK_CATEGORIES.map((c) => `${c} ${byCategory[c]}`).join(", ")}`
  );
  lines.push(`Vorige, even lange periode: ${previousTotal} tickets`);

  lines.push("");
  lines.push("— OPGETELDE THEMA'S OVER DE HELE PERIODE");
  for (const theme of aggregateThemes(days.map((d) => d.themes))) {
    lines.push(`  - ${theme.label}: ${theme.count}`);
  }

  lines.push("");
  lines.push("— PER DAG (nieuwste eerst)");
  for (const day of [...days].sort((a, b) => b.day.localeCompare(a.day))) {
    lines.push(`${day.day} (${day.total} tickets): ${day.summary}`);
  }

  return lines.join("\n");
}

/**
 * Telt themalabels op over meerdere dagen. Matcht genormaliseerd op kleine
 * letters, zodat "Vervoer naar Ajax" en "vervoer naar ajax" één regel worden; het
 * label met het hoogste aantal wint als weergavevorm. Puur rekenwerk, geen
 * AI-call — daarom werkt dit voor elk datumbereik.
 */
export function aggregateThemes(perDay: FandeskTheme[][]): FandeskTheme[] {
  const merged = new Map<string, { label: string; count: number; best: number; example?: string }>();
  for (const themes of perDay) {
    for (const theme of themes) {
      if (!theme?.label || typeof theme.label !== "string") continue;
      const count = Number(theme.count) || 0;
      const key = theme.label.trim().toLowerCase();
      if (!key) continue;
      const existing = merged.get(key);
      if (existing) {
        existing.count += count;
        if (count > existing.best) {
          existing.best = count;
          existing.label = theme.label.trim();
        }
        if (!existing.example && theme.example) existing.example = theme.example;
      } else {
        merged.set(key, {
          label: theme.label.trim(),
          count,
          best: count,
          example: theme.example,
        });
      }
    }
  }
  return [...merged.values()]
    .map(({ label, count, example }) => ({ label, count, example }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Goedkope data-signatuur in de stijl van `app/share/rapportage/page.tsx`:
 * verandert zodra er tickets bijkomen, blijft gelijk als een run niets nieuws
 * opleverde. Dat maakt een uurlijkse ingest zonder nieuwe tickets gratis.
 */
export function ticketsSig(tickets: FandeskTicket[]): string {
  const withTopic = tickets.filter((t) => t.topic).length;
  const last = tickets.length ? tickets[tickets.length - 1].id : "-";
  return `fd:${tickets.length}:${withTopic}:${last}`;
}
