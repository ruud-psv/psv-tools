import { put, del, get, list } from "@vercel/blob";

export interface ReportSources {
  dm?: { enabled: true; queries?: string[] };
  ticketing?: { enabled: true; queries?: string[]; category?: string };
  web?: { enabled: true; site: string; paths?: string[] };
  fanstore?: { enabled: true; products?: string[] };
}

export interface ReportRecord {
  id: string;
  title: string;
  intro?: string;
  preset?: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  sources: ReportSources;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportInput {
  title: string;
  intro?: string;
  preset?: string;
  from: string;
  to: string;
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

/** Valideer en normaliseer een rapport payload uit de request body. */
export function parseReportInput(body: unknown): ReportInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim()) return null;
  if (typeof b.from !== "string" || !DATE_RE.test(b.from)) return null;
  if (typeof b.to !== "string" || !DATE_RE.test(b.to)) return null;
  if (!b.sources || typeof b.sources !== "object") return null;

  const s = b.sources as Record<string, unknown>;
  const sources: ReportSources = {};

  if (s.dm && typeof s.dm === "object") {
    const dm = s.dm as Record<string, unknown>;
    sources.dm = { enabled: true, ...(isStringArray(dm.queries) && dm.queries.length > 0 && { queries: dm.queries }) };
  }
  if (s.ticketing && typeof s.ticketing === "object") {
    const t = s.ticketing as Record<string, unknown>;
    sources.ticketing = {
      enabled: true,
      ...(isStringArray(t.queries) && t.queries.length > 0 && { queries: t.queries }),
      ...(typeof t.category === "string" && t.category && { category: t.category }),
    };
  }
  if (s.web && typeof s.web === "object") {
    const w = s.web as Record<string, unknown>;
    if (typeof w.site !== "string" || !w.site) return null;
    sources.web = {
      enabled: true,
      site: w.site,
      ...(isStringArray(w.paths) && w.paths.length > 0 && { paths: w.paths }),
    };
  }
  if (s.fanstore && typeof s.fanstore === "object") {
    const f = s.fanstore as Record<string, unknown>;
    sources.fanstore = {
      enabled: true,
      ...(isStringArray(f.products) && f.products.length > 0 && { products: f.products }),
    };
  }

  if (!sources.dm && !sources.ticketing && !sources.web && !sources.fanstore) return null;

  return {
    title: b.title.trim(),
    ...(typeof b.intro === "string" && b.intro.trim() && { intro: b.intro.trim() }),
    ...(typeof b.preset === "string" && b.preset && { preset: b.preset }),
    from: b.from,
    to: b.to,
    sources,
  };
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
    return parsed;
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
