/**
 * FileFlow, de beeldbank van PSV. Alleen lezen: zoeken in de foto's, de
 * categorieën ophalen en één foto ophalen om in een stuk te zetten.
 *
 * API: https://docs.fileflow.com (OpenAPI op /api/v1/swagger.json).
 * - Per account een eigen subdomein: https://{subdomein}.fileflow.com/api/v1/...
 *   (`FILEFLOW_SUBDOMAIN`, standaard "psv").
 * - Authenticatie met een API-token (`FILEFLOW_SECRET`, begint met ffpat_):
 *   `Authorization: Token token=<token>`.
 * - De URL's van foto's en thumbnails zijn presigned: ze verlopen. Daarom
 *   tonen we ze alleen tijdens het zoeken, en kopiëren we een gekozen foto
 *   naar onze eigen Bunny-map (zie lib/stukken/afbeelding.ts).
 */

export class FileflowFout extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

function config() {
  const token = process.env.FILEFLOW_SECRET?.trim();
  const subdomein = (process.env.FILEFLOW_SUBDOMAIN?.trim() || "psv").toLowerCase();
  if (!token) throw new FileflowFout("FileFlow is niet ingesteld (FILEFLOW_SECRET ontbreekt).", 500);
  if (!/^[a-z0-9-]+$/.test(subdomein)) throw new FileflowFout("FILEFLOW_SUBDOMAIN is ongeldig.", 500);
  return { token, basis: `https://${subdomein}.fileflow.com/api/v1` };
}

async function vraag<T>(pad: string, params?: URLSearchParams): Promise<T> {
  const { token, basis } = config();
  const url = `${basis}${pad}${params && [...params].length ? `?${params}` : ""}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Token token=${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new FileflowFout("FileFlow is niet bereikbaar. Probeer het zo opnieuw.");
  }
  if (res.status === 401 || res.status === 403) throw new FileflowFout("FileFlow weigert de toegang: controleer FILEFLOW_SECRET.", 502);
  if (res.status === 404) throw new FileflowFout("Niet gevonden in FileFlow.", 404);
  if (res.status === 429) throw new FileflowFout("Even te veel zoekopdrachten naar FileFlow. Probeer het over een minuut opnieuw.", 429);
  if (!res.ok) throw new FileflowFout(`FileFlow gaf een fout (${res.status}).`);
  return (await res.json()) as T;
}

/* ---------- Wat FileFlow teruggeeft (alleen de velden die we gebruiken) ---------- */

export interface FileflowItem {
  id: number;
  name?: string | null;
  filename?: string | null;
  content_type?: string | null;
  media_kind?: string | null;
  filesize?: number | null;
  category_id?: number | null;
  category_name?: string | null;
  original_created_at?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  tags?: string[] | null;
  image_width?: number | null;
  image_height?: number | null;
  processed?: boolean | null;
  url?: string | null;
  thumbs?: { small?: string | null; medium?: string | null; large?: string | null } | null;
  download_dimensions?: { large?: { width?: number; height?: number } | null } | null;
}

/** Een foto zoals de kiezer hem toont. */
export interface Beeld {
  id: number;
  naam: string;
  /** Presigned, verloopt: alleen om te tonen tijdens het zoeken. */
  thumb: string;
  voorbeeld: string;
  breedte?: number;
  hoogte?: number;
  categorie?: string;
  /** Datum van de foto (EXIF), anders de uploaddatum; JJJJ-MM-DD. */
  datum?: string;
  /** Tot wanneer we de foto mogen gebruiken, als FileFlow dat weet; JJJJ-MM-DD. */
  verlooptOp?: string;
  tags: string[];
}

export interface Categorie {
  id: number;
  naam: string;
  aantal: number;
  diepte: number;
  ouder: number | null;
}

/** Van een FileFlow-item naar wat de kiezer nodig heeft; null als er (nog) geen thumbnail is. */
export function naarBeeld(item: FileflowItem): Beeld | null {
  const thumb = item.thumbs?.medium || item.thumbs?.small || item.thumbs?.large;
  if (!thumb || item.processed === false) return null;
  const dag = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : undefined);
  const breedte = item.image_width ?? undefined;
  const hoogte = item.image_height ?? undefined;
  return {
    id: item.id,
    naam: (item.name || item.filename || `Foto ${item.id}`).trim(),
    thumb,
    voorbeeld: item.thumbs?.large || thumb,
    ...(breedte && { breedte }),
    ...(hoogte && { hoogte }),
    ...(item.category_name && { categorie: item.category_name }),
    ...((dag(item.original_created_at) ?? dag(item.created_at)) && { datum: dag(item.original_created_at) ?? dag(item.created_at) }),
    ...(dag(item.expires_at) && { verlooptOp: dag(item.expires_at) }),
    tags: (item.tags ?? []).filter((t): t is string => typeof t === "string").slice(0, 12),
  };
}

export const PAGINA = 40;

/**
 * Zoeken in de foto's. `q` gaat ongewijzigd naar de volledige-tekstzoekfunctie
 * van FileFlow (naam, bestandsnaam, categorie, tags, eigen velden), met de
 * syntaxis van FileFlow: woorden samen (EN), `a | b` (OF), "exacte zin",
 * -uitsluiten. Alleen afbeeldingen, niet gearchiveerd.
 */
/** De volgorde van de resultaten: de zoekfunctie, of op de datum waarop de foto is gemaakt. */
export type Volgorde = "relevant" | "nieuw" | "oud";

export async function zoekBeelden({
  q,
  offset = 0,
  categorie,
  volgorde = "relevant",
}: {
  q?: string;
  offset?: number;
  categorie?: number;
  volgorde?: Volgorde;
}): Promise<{ beelden: Beeld[]; totaal: number; volgende: number | null }> {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim().slice(0, 200));
  params.append("media_type[]", "images");
  params.set("archived", "false");
  params.set("offset", String(Math.max(0, Math.floor(offset))));
  params.set("size", String(PAGINA));
  if (categorie !== undefined && Number.isInteger(categorie) && categorie > 0) params.set("category_id", String(categorie));
  // Op datum: "created" is in FileFlow de datum waarop de foto is gemaakt (niet geüpload).
  // Anders met een zoekterm de volgorde van de zoekfunctie, zonder de nieuwste uploads eerst.
  if (volgorde === "nieuw") params.set("sort", "created+desc");
  else if (volgorde === "oud") params.set("sort", "created+asc");
  else if (!q?.trim()) params.set("sort", "uploaded+desc");
  const data = await vraag<{ items?: FileflowItem[]; meta?: { total?: number } }>("/items", params);
  const items = Array.isArray(data.items) ? data.items : [];
  const totaal = typeof data.meta?.total === "number" ? data.meta.total : items.length;
  const volgende = offset + items.length < totaal && items.length > 0 ? offset + items.length : null;
  return { beelden: items.map(naarBeeld).filter((b): b is Beeld => b !== null), totaal, volgende };
}

/** De categorieën (mappen) van de beeldbank, om op te filteren. */
export async function categorieen(): Promise<Categorie[]> {
  const data = await vraag<{ categories?: { id: number; name: string; items_count?: number; depth?: number; parent_id?: number | null }[] } | { id: number; name: string }[]>("/categories");
  const lijst = Array.isArray(data) ? data : (data.categories ?? []);
  return lijst
    .filter((c) => typeof c?.id === "number" && typeof c?.name === "string")
    .map((c) => {
      const x = c as { id: number; name: string; items_count?: number; depth?: number; parent_id?: number | null };
      return { id: x.id, naam: x.name, aantal: x.items_count ?? 0, diepte: x.depth ?? 0, ouder: x.parent_id ?? null };
    });
}

/** Tot deze grootte halen we het origineel op; daarboven de grote versie. */
export const MAX_ORIGINEEL_BYTES = 60 * 1024 * 1024;

/**
 * Het adres om een gekozen foto op te halen: het origineel, zodat de foto
 * scherp blijft (de server verkleint hem daarna zelf tot 2560 px, zie
 * lib/stukken/verkleinen.ts). Alleen bij een heel groot origineel, of als er
 * geen is, de grote versie van FileFlow.
 */
export function bronVanItem(item: FileflowItem): string | null {
  if (item.media_kind && item.media_kind !== "image") return null;
  const origineelKan = item.url && (!item.filesize || item.filesize <= MAX_ORIGINEEL_BYTES);
  return (origineelKan ? item.url : item.thumbs?.large || item.url) || null;
}

/** Haalt één foto op als bytes, voor de kopie in onze eigen Bunny-map. */
export async function haalBeeldOp(id: number): Promise<{ bytes: Uint8Array; item: FileflowItem }> {
  if (!Number.isInteger(id) || id <= 0) throw new FileflowFout("Ongeldige foto.", 400);
  const data = await vraag<FileflowItem | { item?: FileflowItem }>(`/items/${id}`);
  const item = "item" in data && data.item ? data.item : (data as FileflowItem);
  if (item.expires_at && new Date(item.expires_at).getTime() < Date.now()) {
    throw new FileflowFout("De gebruiksrechten van deze foto zijn verlopen.", 400);
  }
  const bron = bronVanItem(item);
  if (!bron) throw new FileflowFout("Dit is geen foto.", 400);
  if (!bron.startsWith("https://")) throw new FileflowFout("FileFlow gaf een onverwacht adres voor de foto.");
  let res: Response;
  try {
    res = await fetch(bron, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new FileflowFout("De foto kon niet uit FileFlow worden opgehaald.");
  }
  if (!res.ok) throw new FileflowFout(`De foto kon niet uit FileFlow worden opgehaald (${res.status}).`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), item };
}
