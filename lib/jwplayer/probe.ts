/**
 * De capability probe: wat kan de JW Player-API voor deze property en deze
 * licentie? Elke dimensie en metric wordt los getest, zodat één premiumveld
 * niet de hele test laat mislukken. De uitkomst (`SiteCapabilities`) staat in
 * Vercel Blob; UI en MCP-tools tonen alleen wat daar als beschikbaar staat.
 *
 * Dit bestand doet zelf geen netwerk: het krijgt een functie die één verzoek
 * uitvoert (met throttle en backoff, zie `jwRuw` in `client.ts`).
 */

import type { SiteCapabilities } from "../../config/jwplayer-capabilities";
import { JwFout } from "./client";
import { easternDatum, plusDagen } from "./periode";

export { easternDatum, plusDagen };

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
export const EXTRA_DIMENSIES = ["media_id", "device_id", "country_code", "player_playback_mode"] as const;
export const PREMIUM_METRICS = ["play_rate", "plays_per_viewer", "content_score"] as const;
export const ENGAGEMENT_METRICS = ["25_percent_completes", "50_percent_completes", "75_percent_completes"] as const;
/** Volgorde waarin `operation` wordt geprobeerd; tellers werken met `sum`, sommige verhoudingen alleen met een andere. */
export const OPERATIONS = ["sum", "max", "avg"] as const;
/** Bereiken (in dagen) om de grens per query te vinden. */
export const BEREIKEN = [31, 92, 184, 366, 731, 1096, 1827] as const;

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
}

export async function probeSite(
  site: { id: string; label: string },
  verzoek: Verzoeker,
  vandaag: Date = new Date()
): Promise<ProbeUitkomst> {
  const checks: Check[] = [];
  const tot = plusDagen(easternDatum(vandaag), -1);
  const van30 = plusDagen(tot, -29);

  async function query(naam: string, q: Query, source = "default"): Promise<{ check: Check; body: unknown }> {
    const { status, body } = await verzoek({
      method: "POST",
      pad: `/sites/${site.id}/analytics/queries/?source=${source}`,
      body: { page: 0, page_length: 10, ...q },
    });
    const ok = status >= 200 && status < 300;
    const check: Check = { naam, ok, status, rijen: rijenUit(body).length, melding: ok ? undefined : melding(body) };
    checks.push(check);
    return { check, body };
  }

  const perDag = (metrics: { operation: string; field: string }[], extra: Partial<Query> = {}): Query => ({
    start_date: van30,
    end_date: tot,
    dimensions: ["eastern_date"],
    metrics,
    ...extra,
  });

  // Basis: alles samen (zoals gevraagd), daarna elke metric los, met de eerste operation die werkt.
  const eerste = await query("basis: alle metrics per eastern_date", perDag(BASIS_METRICS.map(som), { page_length: 31 }));
  // Een geweigerde sleutel zegt niets over de licentie: dan stoppen, in plaats van "niets beschikbaar" vast te leggen.
  if (eerste.check.status === 401 || eerste.check.status === 403) {
    throw new JwFout(eerste.check.melding ?? "De sleutel werd geweigerd.", eerste.check.status);
  }
  const metrics: Record<string, string | null> = {};
  for (const m of [...BASIS_METRICS, ...PREMIUM_METRICS, ...ENGAGEMENT_METRICS]) {
    metrics[m] = null;
    for (const operation of OPERATIONS) {
      if ((await query(`metric ${m} (${operation})`, perDag([{ operation, field: m }]))).check.ok) {
        metrics[m] = operation;
        break;
      }
    }
  }
  const plays = metrics.plays ? { operation: metrics.plays, field: "plays" } : som("plays");

  const dimensies: Record<string, boolean> = { eastern_date: metrics.plays !== null };
  for (const d of [...PREMIUM_DIMENSIES, ...EXTRA_DIMENSIES]) {
    dimensies[d] = (await query(`dimensie ${d}`, { start_date: van30, end_date: tot, dimensions: [d], metrics: [plays] })).check.ok;
  }

  const includeMetadata = (
    await query("include_metadata=1 per media_id", {
      start_date: van30,
      end_date: tot,
      dimensions: ["media_id"],
      metrics: [plays],
      include_metadata: 1,
      page_length: 3,
    })
  ).check.ok;

  // OTT: is PSV Play (ook) een JW App?
  const ott = await query("source=ott: plays per eastern_date", perDag([plays]), "ott");
  const ottLogin = ott.check.ok
    ? (await query("source=ott: logged_in_unique_viewers", perDag([som("logged_in_unique_viewers")]), "ott")).check.ok
    : false;

  // Live: filter op playback mode.
  const live = await query(
    "live: filter player_playback_mode in LIVE, DVR",
    perDag([plays], { filter: [{ field: "player_playback_mode", operator: "=", value: ["LIVE", "DVR"] }] })
  );

  // Sorteren.
  let sort: SiteCapabilities["sort"] = null;
  for (const order of ["ascending", "ASCENDING"] as const) {
    if ((await query(`sort eastern_date ${order}`, perDag([plays], { sort: [{ field: "eastern_date", order }], page_length: 1 }))).check.ok) {
      sort = order;
      break;
    }
  }

  // Datumbereik, met één totaal zonder dimensie (zo worden unieke kijkers over een periode gevraagd).
  let maxRangeDays: number | null = null;
  let maxRangeIsLowerBound = false;
  for (const dagen of BEREIKEN) {
    const r = await query(`bereik ${dagen} dagen, zonder dimensie`, {
      start_date: plusDagen(tot, -(dagen - 1)),
      end_date: tot,
      metrics: [plays],
    });
    if (!r.check.ok) break;
    maxRangeDays = dagen;
    maxRangeIsLowerBound = dagen === BEREIKEN[BEREIKEN.length - 1];
  }
  const totalsWithoutDimension = maxRangeDays !== null;

  // Oudste dag met data, binnen het grootste bereik.
  let earliestDate: string | null = null;
  if (maxRangeDays && sort) {
    const r = await query("oudste dag met data", {
      start_date: plusDagen(tot, -(maxRangeDays - 1)),
      end_date: tot,
      dimensions: ["eastern_date"],
      metrics: [plays],
      sort: [{ field: "eastern_date", order: sort }],
      page_length: 1,
    });
    const eerste = rijenUit(r.body)[0];
    if (Array.isArray(eerste) && typeof eerste[0] === "string") earliestDate = eerste[0].slice(0, 10);
  }

  // Management API.
  const media = await verzoek({ method: "GET", pad: `/sites/${site.id}/media/?page_length=5` });
  const lijst = (media.body as { media?: Record<string, unknown>[] } | null)?.media ?? [];
  const mediaOk = media.status >= 200 && media.status < 300;
  checks.push({ naam: "management: GET media", ok: mediaOk, status: media.status, rijen: lijst.length, melding: mediaOk ? undefined : melding(media.body) });
  const velden = new Set<string>();
  for (const item of lijst) {
    for (const k of Object.keys(item)) velden.add(k);
    const md = item.metadata as Record<string, unknown> | undefined;
    if (md && typeof md === "object") {
      for (const k of Object.keys(md)) velden.add(`metadata.${k}`);
      const cp = md.custom_params as Record<string, unknown> | undefined;
      if (cp && typeof cp === "object") for (const k of Object.keys(cp)) velden.add(`metadata.custom_params.${k}`);
    }
  }

  return {
    capabilities: {
      label: site.label,
      metrics,
      dimensions: dimensies,
      totalsWithoutDimension,
      includeMetadata,
      ott: { available: ott.check.ok, hasData: ott.check.ok && ott.check.rijen > 0, loggedInUniqueViewers: ottLogin },
      live: { filter: live.check.ok, hasData: live.check.ok && live.check.rijen > 0 },
      sort,
      maxRangeDays,
      maxRangeIsLowerBound,
      earliestDate,
      management: { available: mediaOk, fields: [...velden].sort() },
    },
    checks,
  };
}
