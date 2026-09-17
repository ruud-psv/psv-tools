import { createHash } from "crypto";
import { put, del, get, list } from "@vercel/blob";

/**
 * Opslag voor de UTM Builder op Vercel Blob. Twee dingen worden bewaard:
 *
 * 1. De aangemaakte links (`utm-links/<id>.json`, één blob per link — zelfde
 *    patroon als `lib/reports.ts`, zodat twee mensen die tegelijk een link
 *    maken elkaar niet overschrijven).
 * 2. De taxonomie (`utm-taxonomy.json`): de eigen bronnen en media die
 *    gebruikers aan de dropdowns hebben toegevoegd. De standaardlijsten uit
 *    `lib/utm.ts` worden er bij het lezen doorheen gemengd, zodat ze altijd
 *    beschikbaar zijn — ook als er nog nooit iets is toegevoegd.
 */

import {
  DEFAULT_MEDIUMS,
  DEFAULT_SOURCES,
  UTM_VALUE_RE,
  normalizeTaxonomyValue,
  type UtmLinkInput,
  type UtmLinkRecord,
  type UtmTaxonomy,
} from "@/lib/utm";

export type { UtmLinkInput, UtmLinkRecord, UtmTaxonomy };

const PREFIX = "utm-links/";
// Bewust buiten PREFIX: anders zou de taxonomie in de lijst met links opduiken.
const TAXONOMY_PATH = "utm-taxonomy.json";
const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;
const MAX_FIELD = 300;

function pathFor(id: string): string {
  return `${PREFIX}${id}.json`;
}

/**
 * Het id van een link is een hash van de volledige URL. Dezelfde link twee keer
 * kopiëren levert zo hetzelfde blob-pad op — geen dubbele rijen in het
 * overzicht, en geen dure lijst-scan om dat te controleren.
 */
export function utmLinkId(generatedUrl: string): string {
  return createHash("sha256").update(generatedUrl).digest("hex").slice(0, 32);
}

/** Sorteer op Nederlandse collatie, hoofdletterongevoelig. */
function sortValues(values: string[]): string[] {
  return [...values].sort((a, b) =>
    a.localeCompare(b, "nl", { sensitivity: "base", numeric: true })
  );
}

/** Voeg lijsten samen en ontdubbel hoofdletterongevoelig (eerste wint). */
function mergeValues(...lists: readonly (readonly string[])[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const listItems of lists) {
    for (const value of listItems) {
      if (typeof value !== "string") continue;
      const normalized = normalizeTaxonomyValue(value);
      if (!normalized || !UTM_VALUE_RE.test(normalized)) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(normalized);
    }
  }
  return sortValues(out);
}

async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeJson(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/* ---------- Taxonomie ---------- */

/** Alleen de zelf toegevoegde waarden, zonder de standaardlijsten. */
async function getCustomTaxonomy(): Promise<UtmTaxonomy> {
  const stored = await readJson<Partial<UtmTaxonomy>>(TAXONOMY_PATH);
  return {
    sources: Array.isArray(stored?.sources) ? stored.sources : [],
    mediums: Array.isArray(stored?.mediums) ? stored.mediums : [],
  };
}

/** De volledige lijsten voor de dropdowns: standaard + zelf toegevoegd. */
export async function getTaxonomy(): Promise<UtmTaxonomy> {
  const custom = await getCustomTaxonomy();
  return {
    sources: mergeValues(DEFAULT_SOURCES, custom.sources),
    mediums: mergeValues(DEFAULT_MEDIUMS, custom.mediums),
  };
}

/**
 * Voeg een bron of medium toe. Retourneert de bijgewerkte lijsten, of null bij
 * een ongeldige waarde. Bestaat de waarde al (ook als standaardwaarde), dan
 * verandert er niets en komen de huidige lijsten terug.
 */
export async function addTaxonomyValue(
  kind: "source" | "medium",
  rawValue: string
): Promise<UtmTaxonomy | null> {
  const value = normalizeTaxonomyValue(rawValue);
  if (!value || !UTM_VALUE_RE.test(value)) return null;

  const defaults: readonly string[] = kind === "source" ? DEFAULT_SOURCES : DEFAULT_MEDIUMS;
  const custom = await getCustomTaxonomy();
  const existing = kind === "source" ? custom.sources : custom.mediums;
  const known = mergeValues(defaults, existing);

  if (!known.some((v) => v.toLowerCase() === value.toLowerCase())) {
    const updated: UtmTaxonomy = {
      sources: kind === "source" ? mergeValues(existing, [value]) : mergeValues(custom.sources),
      mediums: kind === "medium" ? mergeValues(existing, [value]) : mergeValues(custom.mediums),
    };
    await writeJson(TAXONOMY_PATH, updated);
    return {
      sources: mergeValues(DEFAULT_SOURCES, updated.sources),
      mediums: mergeValues(DEFAULT_MEDIUMS, updated.mediums),
    };
  }

  return {
    sources: mergeValues(DEFAULT_SOURCES, custom.sources),
    mediums: mergeValues(DEFAULT_MEDIUMS, custom.mediums),
  };
}

/* ---------- Links ---------- */

function trimmedField(v: unknown, max = MAX_FIELD): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Valideer en normaliseer een link-payload uit de request body. */
export function parseUtmLinkInput(body: unknown): UtmLinkInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  const url = trimmedField(b.url, 2000);
  const generatedUrl = trimmedField(b.generatedUrl, 2000);
  const source = normalizeTaxonomyValue(trimmedField(b.source));
  const medium = normalizeTaxonomyValue(trimmedField(b.medium));
  const campaign = trimmedField(b.campaign);

  if (!url || !generatedUrl || !source || !medium || !campaign) return null;
  if (!UTM_VALUE_RE.test(source) || !UTM_VALUE_RE.test(medium)) return null;

  // De opgeslagen link moet een echte http(s)-URL zijn.
  try {
    const parsed = new URL(generatedUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }

  const term = trimmedField(b.term);
  const content = trimmedField(b.content);

  return {
    url,
    source,
    medium,
    campaign,
    ...(term && { term }),
    ...(content && { content }),
    generatedUrl,
  };
}

export async function saveUtmLink(record: UtmLinkRecord): Promise<void> {
  await writeJson(pathFor(record.id), record);
}

export async function getUtmLink(id: string): Promise<UtmLinkRecord | null> {
  if (!ID_RE.test(id)) return null;
  const parsed = await readJson<UtmLinkRecord>(pathFor(id));
  if (!parsed || typeof parsed !== "object" || parsed.id !== id) return null;
  return parsed;
}

/** Alle aangemaakte links, nieuwste eerst. */
export async function listUtmLinks(): Promise<UtmLinkRecord[]> {
  const { blobs } = await list({ prefix: PREFIX });
  const ids = blobs
    .map((b) => b.pathname.slice(PREFIX.length).replace(/\.json$/, ""))
    .filter((id) => ID_RE.test(id));

  const results = await Promise.all(ids.map((id) => getUtmLink(id)));
  return results
    .filter((r): r is UtmLinkRecord => r !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteUtmLink(id: string): Promise<boolean> {
  if (!ID_RE.test(id)) return false;
  await del(pathFor(id));
  return true;
}
