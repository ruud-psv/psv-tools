import { put, del, get, list } from "@vercel/blob";

/** Periode per inzicht. `from`/`to` alleen bij preset "custom"; relatieve presets
 *  worden op weergavemoment opgelost (meebewegend). */
export interface PeriodConfig {
  preset: string;
  from?: string; // YYYY-MM-DD, alleen bij "custom"
  to?: string; // YYYY-MM-DD, alleen bij "custom"
}

export interface ReportSources {
  dm?: { enabled: true; period: PeriodConfig; queries?: string[] };
  web?: { enabled: true; period: PeriodConfig; site: string; paths?: string[] };
  fanstore?: { enabled: true; period: PeriodConfig; products?: string[] };
  ticketing?: {
    enabled: true;
    mode: "current" | "period";
    period?: PeriodConfig; // alleen bij mode "period"
    queries?: string[];
    category?: string;
  };
}

export interface ReportRecord {
  id: string;
  title: string;
  intro?: string;
  // Legacy top-level periode — behouden voor backward-compat met oude blobs.
  preset?: string;
  from?: string;
  to?: string;
  sources: ReportSources;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportInput {
  title: string;
  intro?: string;
  sources: ReportSources;
}

const PREFIX = "rapportages/";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

function pathFor(id: string): string {
  return `${PREFIX}${id}.json`;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Valideer en normaliseer een PeriodConfig uit de request body. Retourneert
 *  null bij een ongeldige periode (zodat de aanroeper kan afwijzen). */
function parsePeriod(v: unknown): PeriodConfig | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (typeof p.preset !== "string" || !p.preset) return null;
  if (p.preset === "custom") {
    if (typeof p.from !== "string" || !DATE_RE.test(p.from)) return null;
    if (typeof p.to !== "string" || !DATE_RE.test(p.to)) return null;
    return { preset: "custom", from: p.from, to: p.to };
  }
  return { preset: p.preset };
}

/** Valideer en normaliseer een rapport payload uit de request body. */
export function parseReportInput(body: unknown): ReportInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim()) return null;
  if (!b.sources || typeof b.sources !== "object") return null;

  const s = b.sources as Record<string, unknown>;
  const sources: ReportSources = {};

  if (s.dm && typeof s.dm === "object") {
    const dm = s.dm as Record<string, unknown>;
    const period = parsePeriod(dm.period);
    if (!period) return null;
    sources.dm = {
      enabled: true,
      period,
      ...(isStringArray(dm.queries) && dm.queries.length > 0 && { queries: dm.queries }),
    };
  }
  if (s.web && typeof s.web === "object") {
    const w = s.web as Record<string, unknown>;
    if (typeof w.site !== "string" || !w.site) return null;
    const period = parsePeriod(w.period);
    if (!period) return null;
    sources.web = {
      enabled: true,
      period,
      site: w.site,
      ...(isStringArray(w.paths) && w.paths.length > 0 && { paths: w.paths }),
    };
  }
  if (s.fanstore && typeof s.fanstore === "object") {
    const f = s.fanstore as Record<string, unknown>;
    const period = parsePeriod(f.period);
    if (!period) return null;
    sources.fanstore = {
      enabled: true,
      period,
      ...(isStringArray(f.products) && f.products.length > 0 && { products: f.products }),
    };
  }
  if (s.ticketing && typeof s.ticketing === "object") {
    const t = s.ticketing as Record<string, unknown>;
    const mode = t.mode === "period" ? "period" : "current";
    let period: PeriodConfig | undefined;
    if (mode === "period") {
      const parsed = parsePeriod(t.period);
      if (!parsed) return null;
      period = parsed;
    }
    sources.ticketing = {
      enabled: true,
      mode,
      ...(period && { period }),
      ...(isStringArray(t.queries) && t.queries.length > 0 && { queries: t.queries }),
      ...(typeof t.category === "string" && t.category && { category: t.category }),
    };
  }

  if (!sources.dm && !sources.ticketing && !sources.web && !sources.fanstore) return null;

  return {
    title: b.title.trim(),
    ...(typeof b.intro === "string" && b.intro.trim() && { intro: b.intro.trim() }),
    sources,
  };
}

/** Oude rapporten hadden één top-level periode i.p.v. per bron. Injecteer die
 *  bij het lezen zodat bestaande links blijven werken. */
function normalizeReport(record: ReportRecord): ReportRecord {
  const legacyPeriod: PeriodConfig | null =
    record.from && record.to
      ? { preset: record.preset ?? "custom", ...(record.preset === "custom" || !record.preset ? { from: record.from, to: record.to } : {}) }
      : record.preset
        ? { preset: record.preset }
        : null;

  if (!legacyPeriod) return record;

  const sources: ReportSources = { ...record.sources };
  if (sources.dm && !sources.dm.period) sources.dm = { ...sources.dm, period: legacyPeriod };
  if (sources.web && !sources.web.period) sources.web = { ...sources.web, period: legacyPeriod };
  if (sources.fanstore && !sources.fanstore.period) sources.fanstore = { ...sources.fanstore, period: legacyPeriod };
  if (sources.ticketing && !sources.ticketing.mode) {
    // Oud ticketing kende geen periode/mode → actuele status.
    sources.ticketing = { ...sources.ticketing, mode: "current" };
  }
  return { ...record, sources };
}

export async function saveReport(record: ReportRecord): Promise<void> {
  await put(pathFor(record.id), JSON.stringify(record), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function getReport(id: string): Promise<ReportRecord | null> {
  if (!ID_RE.test(id)) return null;
  try {
    const result = await get(pathFor(id), { access: "private", useCache: false });
    if (!result || !result.stream) return null;
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text) as ReportRecord;
    if (!parsed || typeof parsed !== "object" || parsed.id !== id) return null;
    return normalizeReport(parsed);
  } catch {
    return null;
  }
}

export async function listReports(): Promise<ReportRecord[]> {
  const { blobs } = await list({ prefix: PREFIX });
  const results = await Promise.all(
    blobs.map(async (b) => {
      const id = b.pathname.slice(PREFIX.length).replace(/\.json$/, "");
      return getReport(id);
    })
  );
  return results
    .filter((r): r is ReportRecord => r !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteReport(id: string): Promise<boolean> {
  if (!ID_RE.test(id)) return false;
  await del(pathFor(id));
  return true;
}
