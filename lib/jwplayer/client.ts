import { createHash } from "node:crypto";
import { JW_API } from "./sites";

/**
 * Leest de JW Player-API (v2) voor PSV Play, met `JWPLAYER_SECRET`. Alleen
 * lezen: analytics-queries (POST, maar zonder bijwerking) en GET op media.
 * Schrijven naar JW doet deze client nooit.
 *
 * - **Rate limit**: JW staat 60 verzoeken per minuut per token toe. De client
 *   houdt per token een venster van een minuut bij (met marge: 50) en wacht als het vol is.
 *   Bij een 429 wacht hij (`Retry-After`, anders 2, 4, 8, 16, 32, 60 s) en probeert
 *   hij het opnieuw.
 * - **Paginering**: alle pagina's worden opgehaald (analytics met
 *   `page_length` 100, het maximum; media met 500 per pagina).
 * - **Cache**: optioneel, zie `cache.ts`. Vandaag en gisteren kort, afgesloten
 *   dagen lang.
 *
 * Het secret staat alleen in de Authorization-header; het komt nooit in een
 * foutmelding, log of cache-sleutel (die gebruikt een hash).
 */

/** JW staat 60 per minuut toe; met wat marge, omdat de pagina, de tools en de cron dezelfde sleutel delen. */
export const MAX_PER_MINUUT = 50;
export const ANALYTICS_PAGINA = 100;
const MEDIA_PAGINA = 500;
const MAX_PAGINAS = 200;
const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 32_000, 60_000];

export type Bron = "default" | "ott";

export interface Metric {
  operation: string;
  field: string;
}

export interface Filter {
  field: string;
  operator: "=" | "!=";
  value: (string | number)[];
}

export interface AnalyticsQuery {
  start_date: string;
  end_date: string;
  dimensions?: string[];
  metrics: Metric[];
  filter?: Filter[];
  sort?: { field: string; order: string }[];
  include_metadata?: 1;
}

/** Eén rij, met de veldnamen van de dimensies en metrics als sleutel. */
export type Rij = Record<string, string | number | null>;

export interface JwMedia {
  id: string;
  titel: string;
  tags: string[];
  /** Publicatiedatum (ISO), of `null`. */
  gepubliceerd: string | null;
  /** Duur in seconden, of `null`. */
  duur: number | null;
  status: string | null;
  customParams: Record<string, string>;
}

export interface JwApi {
  /** Alle rijen van een analytics-query, over alle pagina's. */
  queryAnalytics(siteId: string, q: AnalyticsQuery, opties?: { bron?: Bron }): Promise<Rij[]>;
  /** Alle media van de property. */
  listMedia(siteId: string): Promise<JwMedia[]>;
  /** Eén video, of `null` als hij niet (meer) bestaat. */
  getMedia(siteId: string, mediaId: string): Promise<JwMedia | null>;
}

/** JW gaf een fout terug. */
export class JwFout extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Waar de client query-resultaten bewaart; zie `cache.ts`. */
export interface QueryCache {
  haal(sleutel: string, eindDatum: string, laad: () => Promise<Rij[]>): Promise<Rij[]>;
}

export interface ClientDeps {
  fetch?: typeof fetch;
  slaap?: (ms: number) => Promise<void>;
  nu?: () => number;
  cache?: QueryCache;
  signal?: AbortSignal;
}

/* ---------- Throttle ---------- */

const vensters = new Map<string, number[]>();

/** Wacht tot er in het venster van een minuut plek is voor nog een verzoek, en boekt dat verzoek. */
export async function wachtOpPlek(
  sleutel: string,
  nu: () => number,
  slaap: (ms: number) => Promise<void>,
  max = MAX_PER_MINUUT
): Promise<void> {
  for (;;) {
    const t = nu();
    const venster = (vensters.get(sleutel) ?? []).filter((v) => t - v < 60_000);
    if (venster.length < max) {
      venster.push(t);
      vensters.set(sleutel, venster);
      return;
    }
    vensters.set(sleutel, venster);
    await slaap(60_000 - (t - venster[0]) + 5);
  }
}

/** Alleen voor tests. */
export function resetThrottle(): void {
  vensters.clear();
}

/* ---------- Antwoorden lezen ---------- */

function foutTekst(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as { errors?: { code?: string; description?: string }[]; message?: string };
    if (b.errors?.length) return b.errors.map((e) => [e.code, e.description].filter(Boolean).join(": ")).join("; ").slice(0, 300);
    if (typeof b.message === "string") return b.message.slice(0, 300);
  }
  return typeof body === "string" && body ? body.slice(0, 300) : fallback;
}

/**
 * De rijen uit een analytics-antwoord als objecten. De kolommen komen uit
 * `metadata.column_headers` als JW die geeft, anders in de volgorde van de
 * vraag (eerst de dimensies, dan de metrics).
 */
export function leesRijen(body: unknown, q: AnalyticsQuery): Rij[] {
  const b = body as {
    data?: { rows?: unknown[] };
    rows?: unknown[];
    metadata?: { column_headers?: { dimensions?: { field?: string }[]; metrics?: { field?: string }[] } };
  } | null;
  const rows = b?.data?.rows ?? b?.rows ?? [];
  const koppen = b?.metadata?.column_headers;
  const kolommen =
    koppen?.dimensions || koppen?.metrics
      ? [...(koppen.dimensions ?? []), ...(koppen.metrics ?? [])].map((k) => String(k.field ?? ""))
      : [...(q.dimensions ?? []), ...q.metrics.map((m) => m.field)];
  return rows.map((row) => {
    if (row && typeof row === "object" && !Array.isArray(row)) return row as Rij;
    const rij: Rij = {};
    (row as unknown[]).forEach((waarde, i) => {
      const k = kolommen[i] ?? `kolom_${i}`;
      rij[k] = typeof waarde === "number" || typeof waarde === "string" || waarde === null ? waarde : String(waarde);
    });
    return rij;
  });
}

function tekst(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Een media-item van de Management API naar de velden die PSV Tools gebruikt. */
export function normaliseerMedia(raw: Record<string, unknown>): JwMedia {
  const md = (raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {}) as Record<string, unknown>;
  const cp = (md.custom_params && typeof md.custom_params === "object" ? md.custom_params : {}) as Record<string, unknown>;
  const tags = Array.isArray(md.tags) ? md.tags : typeof md.tags === "string" ? md.tags.split(",") : [];
  const duur = Number(raw.duration ?? md.duration);
  return {
    id: String(raw.id ?? ""),
    titel: tekst(md.title) ?? tekst(raw.title) ?? "",
    tags: tags.map((t) => String(t).trim()).filter(Boolean),
    gepubliceerd: tekst(md.publish_start_date) ?? tekst(raw.publish_start_date) ?? tekst(raw.created) ?? null,
    duur: Number.isFinite(duur) && duur > 0 ? duur : null,
    status: tekst(raw.status),
    customParams: Object.fromEntries(Object.entries(cp).map(([k, v]) => [k, String(v)])),
  };
}

/* ---------- Client ---------- */

export interface RuwAntwoord {
  status: number;
  body: unknown;
}

/**
 * Eén verzoek aan de API, met throttle en backoff, zonder te gooien bij een
 * foutstatus. Voor de capability probe, die juist wil zien wat er misgaat.
 */
export function jwRuw(config: { secret: string }, deps: ClientDeps = {}) {
  const doeFetch = deps.fetch ?? fetch;
  const slaap = deps.slaap ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const nu = deps.nu ?? Date.now;
  const tokenSleutel = createHash("sha256").update(config.secret).digest("hex").slice(0, 16);

  async function ruw(method: "GET" | "POST", pad: string, body?: unknown): Promise<RuwAntwoord> {
    for (let poging = 0; ; poging++) {
      await wachtOpPlek(tokenSleutel, nu, slaap);
      const res = await doeFetch(`${JW_API}${pad}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.secret}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: deps.signal,
      });
      const herhaalbaar = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
      if (herhaalbaar && poging < BACKOFF_MS.length) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const wacht = res.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : BACKOFF_MS[poging];
        console.warn(`[jwplayer] ${res.status} op ${pad.split("?")[0]}; nieuwe poging over ${wacht} ms`);
        await slaap(wacht);
        continue;
      }
      const tekst = await res.text();
      let json: unknown = tekst;
      try {
        json = tekst ? JSON.parse(tekst) : null;
      } catch {
        // Geen JSON; dan de tekst.
      }
      return { status: res.status, body: json };
    }
  }

  return { ruw, tokenSleutel };
}

export function jwApi(config: { secret: string }, deps: ClientDeps = {}): JwApi {
  const { ruw, tokenSleutel } = jwRuw(config, deps);

  async function verzoek(method: "GET" | "POST", pad: string, body?: unknown): Promise<unknown> {
    const { status, body: json } = await ruw(method, pad, body);
    if (status < 200 || status >= 300) throw new JwFout(foutTekst(json, `status ${status}`), status);
    return json;
  }

  async function alleRijen(siteId: string, q: AnalyticsQuery, bron: Bron): Promise<Rij[]> {
    const rijen: Rij[] = [];
    for (let page = 0; page < MAX_PAGINAS; page++) {
      const body = await verzoek("POST", `/sites/${siteId}/analytics/queries/?source=${bron}`, {
        ...q,
        page,
        page_length: ANALYTICS_PAGINA,
      });
      const deel = leesRijen(body, q);
      rijen.push(...deel);
      if (deel.length < ANALYTICS_PAGINA) break;
    }
    return rijen;
  }

  return {
    async queryAnalytics(siteId, q, opties = {}) {
      const bron = opties.bron ?? "default";
      if (!deps.cache) return alleRijen(siteId, q, bron);
      const sleutel = createHash("sha256").update(JSON.stringify([tokenSleutel, siteId, bron, q])).digest("hex").slice(0, 32);
      return deps.cache.haal(sleutel, q.end_date, () => alleRijen(siteId, q, bron));
    },

    async listMedia(siteId) {
      const media: JwMedia[] = [];
      for (let page = 1; page <= MAX_PAGINAS; page++) {
        const body = (await verzoek("GET", `/sites/${siteId}/media/?page=${page}&page_length=${MEDIA_PAGINA}`)) as {
          media?: Record<string, unknown>[];
          total?: number;
        } | null;
        const deel = body?.media ?? [];
        media.push(...deel.map(normaliseerMedia));
        if (deel.length < MEDIA_PAGINA || (typeof body?.total === "number" && media.length >= body.total)) break;
      }
      return media;
    },

    async getMedia(siteId, mediaId) {
      if (!/^[A-Za-z0-9]{8}$/.test(mediaId)) return null;
      try {
        return normaliseerMedia((await verzoek("GET", `/sites/${siteId}/media/${mediaId}/`)) as Record<string, unknown>);
      } catch (err) {
        if (err instanceof JwFout && err.status === 404) return null;
        throw err;
      }
    },
  };
}
