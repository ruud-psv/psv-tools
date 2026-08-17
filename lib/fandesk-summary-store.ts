import { put, get } from "@vercel/blob";
import type { FandeskInsightResult } from "@/lib/insights/fandesk";

/**
 * Opslag voor de FANdesk-samenvattingen op Vercel Blob. Zelfde patroon als
 * `lib/report-analysis.ts`: een deterministisch pad maakt het bestand een keyed
 * cache, en de `sig` erin vertelt of de onderliggende data sinds de analyse is
 * veranderd. Zo hoeft een uurlijkse ingest zonder nieuwe tickets geen nieuwe
 * (kostbare) AI-call te doen.
 */

const PREFIX = "fandesk/summaries/";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface StoredFandeskSummary {
  result: FandeskInsightResult;
  /** Data-signatuur op moment van analyse, voor "nieuwe data"-detectie. */
  sig: string;
  generatedAt: string;
}

function dayPath(day: string): string {
  return `${PREFIX}day-${day}.json`;
}

function periodPath(from: string, to: string): string {
  return `${PREFIX}period-${from}_${to}.json`;
}

function isStored(value: unknown): value is StoredFandeskSummary {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    !!v.result &&
    typeof v.result === "object" &&
    typeof (v.result as Record<string, unknown>).summary === "string" &&
    typeof v.sig === "string"
  );
}

async function read(pathname: string): Promise<StoredFandeskSummary | null> {
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || !result.stream) return null;
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text) as unknown;
    if (!isStored(parsed)) return null;
    return normalize(parsed);
  } catch {
    return null;
  }
}

async function write(pathname: string, data: StoredFandeskSummary): Promise<void> {
  await put(pathname, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/**
 * Vult ontbrekende arrays aan. Het model kan een veld weglaten, en de UI mag niet
 * op een undefined array stuklopen.
 */
function normalize(stored: StoredFandeskSummary): StoredFandeskSummary {
  const r = stored.result;
  return {
    ...stored,
    result: {
      summary: typeof r.summary === "string" ? r.summary : "",
      themes: Array.isArray(r.themes) ? r.themes : [],
      highlights: Array.isArray(r.highlights) ? r.highlights : [],
      alerts: Array.isArray(r.alerts) ? r.alerts : [],
      recommendations: Array.isArray(r.recommendations) ? r.recommendations : [],
    },
  };
}

export async function getDaySummary(day: string): Promise<StoredFandeskSummary | null> {
  if (!DAY_RE.test(day)) return null;
  return read(dayPath(day));
}

export async function saveDaySummary(
  day: string,
  data: StoredFandeskSummary
): Promise<void> {
  if (!DAY_RE.test(day)) return;
  await write(dayPath(day), data);
}

export async function getPeriodSummary(
  from: string,
  to: string
): Promise<StoredFandeskSummary | null> {
  if (!DAY_RE.test(from) || !DAY_RE.test(to)) return null;
  return read(periodPath(from, to));
}

export async function savePeriodSummary(
  from: string,
  to: string,
  data: StoredFandeskSummary
): Promise<void> {
  if (!DAY_RE.test(from) || !DAY_RE.test(to)) return;
  await write(periodPath(from, to), data);
}

/** Meerdere dagen tegelijk, voor de leesroute. Ontbrekende dagen worden null. */
export async function getDaySummaries(
  days: string[]
): Promise<Array<{ day: string; stored: StoredFandeskSummary | null }>> {
  return Promise.all(
    days.map(async (day) => ({ day, stored: await getDaySummary(day) }))
  );
}
