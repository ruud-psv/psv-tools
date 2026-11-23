/**
 * De capability probe: wat kan de JW Player-API voor deze property en deze
 * licentie? Elke dimensie en metric wordt los getest, zodat één premiumveld
 * niet de hele test laat mislukken. De uitkomst gaat naar
 * `config/jwplayer-capabilities.ts`; UI en MCP-tools tonen alleen wat daar
 * als beschikbaar staat.
 *
 * Draaien: `scripts/jwplayer-probe.ts`. Dit bestand doet zelf geen netwerk:
 * het krijgt een functie die één verzoek uitvoert.
 */

import type { SiteCapabilities } from "../../config/jwplayer-capabilities";

export interface ProbeVerzoek {
  method: "GET" | "POST";
  /** Pad onder `/v2`, met querystring. */
  pad: string;
  body?: unknown;
}

export interface ProbeAntwoord {
  status: number;
  body: unknown;
}

export type Verzoeker = (verzoek: ProbeVerzoek) => Promise<ProbeAntwoord>;

export interface Check {
  naam: string;
  ok: boolean;
  status: number;
  rijen: number;
  melding?: string;
}

export const BASIS_METRICS = ["plays", "time_watched", "unique_viewers", "completes", "complete_rate"] as const;
export const PREMIUM_DIMENSIES = ["tag", "platform_id", "video_duration", "browser", "city"] as const;
/** Niet als premium genoemd, maar wel nodig voor de pagina: ook los testen. */
export const EXTRA_DIMENSIES = ["media_id", "device_id", "country_code", "player_playback_mode", "page_domain"] as const;
export const PREMIUM_METRICS = ["play_rate", "plays_per_viewer", "content_score"] as const;
export const ENGAGEMENT_METRICS = ["25_percent_completes", "50_percent_completes", "75_percent_completes"] as const;
/** Bereiken (in dagen) om de grens per query te vinden. */
export const BEREIKEN = [31, 92, 184, 366, 731, 1096, 1827] as const;

/** De datum (JJJJ-MM-DD) in US Eastern, de tijdzone van JW. */
export function easternDatum(moment: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(moment);
}

export function plusDagen(datum: string, dagen: number): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dagen);
  return d.toISOString().slice(0, 10);
}

/** De rijen uit een analytics-antwoord, wat de precieze vorm ook is. */
export function rijenUit(body: unknown): unknown[] {
  const b = body as { data?: { rows?: unknown }; rows?: unknown } | null;
  const rows = b?.data?.rows ?? b?.rows;
  return Array.isArray(rows) ? rows : [];
}

function melding(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return typeof body === "string" ? body.slice(0, 300) : undefined;
  const b = body as { errors?: { code?: string; description?: string }[]; message?: string };
  if (b.errors?.length) return b.errors.map((e) => [e.code, e.description].filter(Boolean).join(": ")).join("; ").slice(0, 300);
  return b.message?.slice(0, 300);
}

interface Query {
  start_date: string;
  end_date: string;
  dimensions?: string[];
  metrics: { operation: string; field: string }[];
  filter?: unknown[];
  sort?: unknown[];
  include_metadata?: 1;
  page?: number;
  page_length?: number;
}

const som = (field: string) => ({ operation: "sum", field });

export interface ProbeUitkomst {
  capabilities: SiteCapabilities;
  checks: Check[];
  /** Voorbeelden van antwoorden, voor het rapport (geen persoonsgegevens: alleen aggregaten en media-metadata). */
  voorbeelden: Record<string, unknown>;
}

export async function probeSite(
  site: { id: string; label: string },
  verzoek: Verzoeker,
  vandaag: Date = new Date()
): Promise<ProbeUitkomst> {
  const checks: Check[] = [];
  const voorbeelden: Record<string, unknown> = {};
  const tot = plusDagen(easternDatum(vandaag), -1);
  const van30 = plusDagen(tot, -29);

  async function query(naam: string, q: Query, source = "default"): Promise<{ check: Check; body: unknown }> {
    const { status, body } = await verzoek({
      method: "POST",
      pad: `/sites/${site.id}/analytics/queries/?source=${source}`,
      body: { page: 0, page_length: 10, ...q },
    });
    const rijen = rijenUit(body).length;
    const check: Check = { naam, ok: status >= 200 && status < 300, status, rijen, melding: status >= 300 ? melding(body) : undefined };
    checks.push(check);
    return { check, body };
  }

  const basis = (metrics: string[], extra: Partial<Query> = {}): Query => ({
    start_date: van30,
    end_date: tot,
    dimensions: ["eastern_date"],
    metrics: metrics.map(som),
    ...extra,
  });

  // Basis: alles samen, en elke metric los.
  const samen = await query("basis: alle metrics per eastern_date", basis([...BASIS_METRICS], { page_length: 31 }));
  voorbeelden.basis = samen.body;
  const metrics: Record<string, boolean> = {};
  for (const m of [...BASIS_METRICS, ...PREMIUM_METRICS, ...ENGAGEMENT_METRICS]) {
    metrics[m] = (await query(`metric ${m}`, basis([m]))).check.ok;
  }

  const dimensies: Record<string, boolean> = { eastern_date: samen.check.ok || metrics.plays };
  for (const d of [...PREMIUM_DIMENSIES, ...EXTRA_DIMENSIES]) {
    const r = await query(`dimensie ${d}`, { start_date: van30, end_date: tot, dimensions: [d], metrics: [som("plays")] });
    dimensies[d] = r.check.ok;
    if (r.check.ok) voorbeelden[`dimensie_${d}`] = rijenUit(r.body).slice(0, 5);
  }

  const meta = await query("include_metadata=1 per media_id", {
    start_date: van30,
    end_date: tot,
    dimensions: ["media_id"],
    metrics: [som("plays")],
    include_metadata: 1,
    page_length: 3,
  });
  if (meta.check.ok) voorbeelden.include_metadata = meta.body;
  const includeMetadata = meta.check.ok;

  // OTT: is PSV Play (ook) een JW App?
  const ott = await query("source=ott: plays per eastern_date", basis(["plays"]), "ott");
  const ottLogin = ott.check.ok ? (await query("source=ott: logged_in_unique_viewers", basis(["logged_in_unique_viewers"]), "ott")).check : null;

  // Live: filter op playback mode.
  const live = await query(
    "live: filter player_playback_mode in LIVE, DVR",
    basis(["plays"], { filter: [{ field: "player_playback_mode", operator: "=", value: ["LIVE", "DVR"] }] })
  );
  const liveRijen = rijenUit(live.body).length;

  // Sorteren (nodig om de oudste dag met data te vinden).
  let sorteerVorm: SiteCapabilities["sort"] = null;
  for (const order of ["ascending", "ASCENDING"] as const) {
    const s = await query(`sort eastern_date ${order}`, basis(["plays"], { sort: [{ field: "eastern_date", order }], page_length: 1 }));
    if (s.check.ok) {
      sorteerVorm = order;
      break;
    }
  }

  // Datumbereik: het grootste bereik dat één query accepteert.
  let maxBereik: number | null = null;
  let maxBereikGeprobeerd = false;
  for (const dagen of BEREIKEN) {
    const r = await query(`bereik ${dagen} dagen`, {
      start_date: plusDagen(tot, -(dagen - 1)),
      end_date: tot,
      metrics: [som("plays")],
    });
    if (!r.check.ok) break;
    maxBereik = dagen;
    maxBereikGeprobeerd = dagen === BEREIKEN[BEREIKEN.length - 1];
  }

  // Oudste dag met data, binnen het grootste bereik.
  let vroegsteDatum: string | null = null;
  if (maxBereik && sorteerVorm) {
    const r = await query("oudste dag met data", {
      start_date: plusDagen(tot, -(maxBereik - 1)),
      end_date: tot,
      dimensions: ["eastern_date"],
      metrics: [som("plays")],
      sort: [{ field: "eastern_date", order: sorteerVorm }],
      page_length: 1,
    });
    const eerste = rijenUit(r.body)[0];
    if (Array.isArray(eerste) && typeof eerste[0] === "string") vroegsteDatum = eerste[0].slice(0, 10);
  }

  // Management API.
  const media = await verzoek({ method: "GET", pad: `/sites/${site.id}/media/?page_length=5` });
  const mediaLijst = (media.body as { media?: Record<string, unknown>[] } | null)?.media ?? [];
  const mediaOk = media.status >= 200 && media.status < 300;
  checks.push({ naam: "management: GET media", ok: mediaOk, status: media.status, rijen: mediaLijst.length, melding: mediaOk ? undefined : melding(media.body) });
  const velden = new Set<string>();
  for (const item of mediaLijst) {
    for (const k of Object.keys(item)) velden.add(k);
    const md = item.metadata as Record<string, unknown> | undefined;
    if (md && typeof md === "object") {
      for (const k of Object.keys(md)) velden.add(`metadata.${k}`);
      const cp = md.custom_params as Record<string, unknown> | undefined;
      if (cp && typeof cp === "object") for (const k of Object.keys(cp)) velden.add(`metadata.custom_params.${k}`);
    }
  }
  if (mediaOk) voorbeelden.media = mediaLijst.slice(0, 2);

  const capabilities: SiteCapabilities = {
    label: site.label,
    metrics,
    dimensions: dimensies,
    includeMetadata,
    ott: {
      available: ott.check.ok,
      hasData: ott.check.ok && ott.check.rijen > 0,
      loggedInUniqueViewers: Boolean(ottLogin?.ok),
    },
    live: { filter: live.check.ok, hasData: live.check.ok && liveRijen > 0 },
    sort: sorteerVorm,
    maxRangeDays: maxBereik,
    maxRangeIsLowerBound: maxBereikGeprobeerd,
    earliestDate: vroegsteDatum,
    management: { available: mediaOk, fields: [...velden].sort() },
  };
  return { capabilities, checks, voorbeelden };
}
