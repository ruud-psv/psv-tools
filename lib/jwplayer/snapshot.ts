import type { SiteCapabilities } from "../../config/jwplayer-capabilities";
import { heeftDimensie, metrics, onderdeel } from "./capabilities";
import type { AnalyticsQuery, Filter, JwApi, Rij } from "./client";
import { dagenIn, plusDagen, type Periode } from "./periode";
import { leesJsonGz, paden, schrijfJsonGz, type Opslag } from "./store";

/**
 * De dagelijkse snapshot: per afgesloten JW-dag de totalen, de cijfers per
 * video en (als de licentie het toelaat) per tag, platform, device en land.
 * Zo zijn seizoens- en jaarvergelijkingen ook te maken voor dagen die de API
 * zelf niet meer teruggeeft, zonder de API opnieuw te bevragen.
 *
 * Unieke kijkers staan er per dag in, maar zijn niet optelbaar over dagen:
 * het archief geeft ze alleen voor één dag terug, nooit als som.
 */

export const ADDITIEF = ["plays", "time_watched", "completes", "25_percent_completes", "50_percent_completes", "75_percent_completes"] as const;
export const SNAPSHOT_METRICS = [...ADDITIEF, "unique_viewers"] as const;
const EXTRA_DIMENSIES = ["tag", "platform_id", "device_id", "country_code"] as const;
export const LIVE_FILTER: Filter = { field: "player_playback_mode", operator: "=", value: ["LIVE", "DVR"] };

type Cijfers = Record<string, number>;

export interface DagSnapshot {
  versie: 1;
  site: string;
  /** JW-datum (eastern_date). */
  datum: string;
  at: string;
  totaal: Cijfers;
  /** Per media_id. */
  media: Record<string, Cijfers>;
  /** Per media_id, alleen live/DVR-kijken; `null` als het filter niet beschikbaar is. */
  live: Record<string, Cijfers> | null;
  /** Per dimensie (tag, platform_id, device_id, country_code), per waarde. */
  per: Record<string, Record<string, Cijfers>>;
}

function getal(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function cijfers(rij: Rij, velden: readonly string[]): Cijfers {
  const c: Cijfers = {};
  for (const v of velden) if (v in rij) c[v] = getal(rij[v]);
  return c;
}

function perSleutel(rijen: Rij[], dim: string, velden: readonly string[]): Record<string, Cijfers> {
  const uit: Record<string, Cijfers> = {};
  for (const r of rijen) {
    const k = String(r[dim] ?? "onbekend");
    uit[k] = cijfers(r, velden);
  }
  return uit;
}

export async function maakSnapshot(api: JwApi, siteId: string, cap: SiteCapabilities, datum: string): Promise<DagSnapshot> {
  const ms = metrics(cap, SNAPSHOT_METRICS);
  const velden = ms.map((m) => m.field);
  const q = (dimensions: string[], extra: Partial<AnalyticsQuery> = {}): AnalyticsQuery => ({ start_date: datum, end_date: datum, dimensions, metrics: ms, ...extra });

  const [totaalRijen, mediaRijen] = await Promise.all([
    api.queryAnalytics(siteId, q(["eastern_date"])),
    heeftDimensie(cap, "media_id") ? api.queryAnalytics(siteId, q(["media_id"])) : Promise.resolve([]),
  ]);
  const live = onderdeel(cap, "live").ok
    ? perSleutel(await api.queryAnalytics(siteId, q(["media_id"], { filter: [LIVE_FILTER] })), "media_id", velden)
    : null;
  const per: DagSnapshot["per"] = {};
  for (const dim of EXTRA_DIMENSIES) {
    if (heeftDimensie(cap, dim)) per[dim] = perSleutel(await api.queryAnalytics(siteId, q([dim])), dim, velden);
  }
  return {
    versie: 1,
    site: siteId,
    datum,
    at: new Date().toISOString(),
    totaal: totaalRijen[0] ? cijfers(totaalRijen[0], velden) : {},
    media: perSleutel(mediaRijen, "media_id", velden),
    live,
    per,
  };
}

export async function bewaarSnapshot(opslag: Opslag, s: DagSnapshot): Promise<void> {
  await schrijfJsonGz(opslag, paden.dag(s.site, s.datum), s);
}

/** De dagen (JW-datums) waarvoor al een snapshot is. */
export async function opgeslagenDagen(opslag: Opslag, siteId: string): Promise<Set<string>> {
  const prefix = paden.dagPrefix(siteId);
  return new Set((await opslag.lijst(prefix)).map((p) => p.slice(prefix.length).replace(/\.json\.gz$/, "")));
}

export interface Archief {
  /** De snapshots in de periode die er zijn. */
  dagen(siteId: string, p: Periode): Promise<DagSnapshot[]>;
}

export function blobArchief(opslag: Opslag): Archief {
  return {
    async dagen(siteId, p) {
      const er = await opgeslagenDagen(opslag, siteId);
      const gevraagd = dagenIn(p).filter((d) => er.has(d));
      const uit: DagSnapshot[] = [];
      for (const d of gevraagd) {
        const s = await leesJsonGz<DagSnapshot>(opslag, paden.dag(siteId, d)).catch(() => null);
        if (s) uit.push(s);
      }
      return uit;
    },
  };
}

/**
 * Rijen zoals de API ze zou geven, uit snapshots. Werkt voor geen dimensie,
 * `eastern_date`, `media_id` of één van de extra dimensies, zonder filter.
 * Additieve metrics worden opgeteld; unieke kijkers alleen bij één dag of per
 * `eastern_date`, anders `null`.
 */
export function archiefRijen(snapshots: DagSnapshot[], dims: string[], velden: string[]): Rij[] | null {
  if (dims.length > 1) return null;
  const dim = dims[0];
  const eenDag = snapshots.length === 1;
  const optel = (doel: Rij, bron: Cijfers, uniek: boolean) => {
    for (const v of velden) {
      if (v === "unique_viewers") {
        doel[v] = uniek && v in bron ? bron[v] : null;
      } else if (v in bron) {
        doel[v] = getal(doel[v]) + bron[v];
      }
    }
  };
  if (!dim || dim === "eastern_date") {
    if (dim) {
      return snapshots.map((s) => {
        const r: Rij = { eastern_date: s.datum };
        optel(r, s.totaal, true);
        return r;
      });
    }
    const r: Rij = {};
    for (const s of snapshots) optel(r, s.totaal, eenDag);
    return [r];
  }
  const bron = (s: DagSnapshot) => (dim === "media_id" ? s.media : s.per[dim]);
  if (snapshots.some((s) => !bron(s))) return null;
  const perWaarde = new Map<string, Rij>();
  for (const s of snapshots) {
    for (const [k, c] of Object.entries(bron(s))) {
      const r = perWaarde.get(k) ?? { [dim]: k };
      optel(r, c, eenDag);
      perWaarde.set(k, r);
    }
  }
  return [...perWaarde.values()];
}

/* ---------- Een run van de cron of de backfill ---------- */

/** Zoveel dagen terug vult de dagelijkse cron gaten op. */
const GATEN_DAGEN = 7;

/**
 * Welke dagen een run moet vastleggen, nieuwste eerst.
 *
 * - Dagelijks: gisteren én eergisteren (JW verwerkt cijfers met vertraging, dus
 *   eergisteren wordt nog eens overschreven), plus ontbrekende dagen van de
 *   laatste week.
 * - Backfill (`van`): elke ontbrekende dag vanaf `van`.
 */
export function teDoen(er: Set<string>, dataThrough: string, van?: string | null): string[] {
  if (van) {
    return dagenIn({ van, tot: dataThrough })
      .filter((d) => !er.has(d))
      .reverse();
  }
  const altijd = [dataThrough, plusDagen(dataThrough, -1)];
  const gaten = dagenIn({ van: plusDagen(dataThrough, -(GATEN_DAGEN - 1)), tot: dataThrough }).filter((d) => !er.has(d));
  return [...new Set([...altijd, ...gaten.reverse()])];
}

export interface SnapshotRun {
  gedaan: string[];
  fouten: { datum: string; melding: string }[];
  over: number;
}

export async function snapshotRun(opties: {
  api: JwApi;
  siteId: string;
  cap: SiteCapabilities;
  opslag: Opslag;
  dataThrough: string;
  van?: string | null;
  budgetMs: number;
  nu?: () => number;
}): Promise<SnapshotRun> {
  const nu = opties.nu ?? Date.now;
  const start = nu();
  const vroegste = opties.cap.earliestDate;
  const van = opties.van && vroegste && opties.van < vroegste ? vroegste : opties.van;
  const lijst = teDoen(await opgeslagenDagen(opties.opslag, opties.siteId), opties.dataThrough, van);
  const uit: SnapshotRun = { gedaan: [], fouten: [], over: 0 };
  for (let i = 0; i < lijst.length; i++) {
    if (nu() - start > opties.budgetMs) {
      uit.over = lijst.length - i;
      break;
    }
    const datum = lijst[i];
    try {
      await bewaarSnapshot(opties.opslag, await maakSnapshot(opties.api, opties.siteId, opties.cap, datum));
      uit.gedaan.push(datum);
    } catch (err) {
      uit.fouten.push({ datum, melding: err instanceof Error ? err.message : String(err) });
      // Een fout op één dag stopt de run niet, maar drie op rij wel (dan is er iets structureel mis).
      if (uit.fouten.length >= 3 && uit.gedaan.length === 0) {
        uit.over = lijst.length - i - 1;
        break;
      }
    }
  }
  return uit;
}
