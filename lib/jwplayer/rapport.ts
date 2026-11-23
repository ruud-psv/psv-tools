import type { SiteCapabilities } from "../../config/jwplayer-capabilities";
import type { TagPrefix } from "../../config/psvplay-taxonomy";
import { heeftDimensie, heeftMetric, metrics, onderdeel } from "./capabilities";
import type { Filter, JwApi, Rij } from "./client";
import { plat, type MediaIndex, type Video } from "./media";
import {
  TIJDZONE_NOTITIE,
  aantalDagen,
  deltaPct,
  plusDagen,
  splitsPeriode,
  type Periode,
  type PeriodeKeuze,
} from "./periode";
import type { JwSite } from "./sites";
import { ADDITIEF, LIVE_FILTER, archiefRijen, type Archief } from "./snapshot";
import { pastBij, tagLabel } from "./taxonomie";

/**
 * De cijfers van PSV Play voor de pagina en de MCP-tools: van JW-rijen naar
 * compacte objecten met titels in plaats van id's.
 *
 * Unieke kijkers (`unique_viewers`) zijn een benadering van JW (IP-adres plus
 * user agent) en zijn NIET optelbaar: wie op maandag en dinsdag kijkt, telt
 * op beide dagen. Over een periode worden ze daarom altijd met één query over
 * die hele periode opgehaald, en nooit uit dagwaarden of uit waarden per video
 * opgeteld. Kan dat niet (de periode is langer dan één query toelaat, of de
 * API kent geen totaal zonder dimensie), dan is de waarde `null`.
 */

export const UNIEK_NOTITIE =
  "Unieke kijkers zijn een benadering van JW Player (IP-adres plus browser) en zijn niet optelbaar over dagen, video's of groepen: ze komen altijd uit één query over de hele periode.";
export const PERCENTAGE_NOTITIE =
  "De percentage-completes (25, 50 en 75%) en daarmee de afhaakcurve bestaan alleen voor video's langer dan 30 seconden.";

const KERN = ["plays", "time_watched", "unique_viewers", "completes"] as const;
const ENGAGEMENT = ["25_percent_completes", "50_percent_completes", "75_percent_completes"] as const;
const ADDITIEVE = new Set<string>(ADDITIEF);

export interface Ctx {
  api: JwApi;
  site: JwSite;
  cap: SiteCapabilities;
  media: MediaIndex;
  archief?: Archief | null;
}

/* ---------- Getallen ---------- */

function getal(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function afgerond(n: number | null, decimalen = 1): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** decimalen;
  return Math.round(n * f) / f;
}

const uren = (seconden: number) => afgerond(seconden / 3600, 1) ?? 0;
const pct = (deel: number, geheel: number) => (geheel > 0 ? afgerond((deel / geheel) * 100, 1) : null);

/* ---------- Vragen aan de API ---------- */

function sleutel(rij: Rij, dims: string[]): string {
  return dims.map((d) => String(rij[d] ?? "")).join("\u0000");
}

/**
 * Eén query, zo nodig in stukken als de periode langer is dan de API in één
 * keer toelaat. Bij stukken worden alleen additieve metrics opgeteld; unieke
 * kijkers worden dan `null` (niet optelbaar). Dagen vóór de oudste dag die de
 * API nog kent, komen uit de dagelijkse snapshots als die er zijn.
 */
export async function vraag(ctx: Ctx, p: Periode, dims: string[], velden: readonly string[], filter?: Filter[]): Promise<Rij[]> {
  const ms = metrics(ctx.cap, velden);
  if (!ms.length || p.van > p.tot) return [];

  // Deel uit het archief: dagen die de API niet meer heeft.
  const vroegste = ctx.cap.earliestDate;
  let archiefDeel: Rij[] = [];
  let apiPeriode = p;
  if (vroegste && p.van < vroegste && ctx.archief && !filter) {
    const archiefPeriode = { van: p.van, tot: p.tot < vroegste ? p.tot : plusDagen(vroegste, -1) };
    const snapshots = await ctx.archief.dagen(ctx.site.id, archiefPeriode);
    const rijen = snapshots.length ? archiefRijen(snapshots, dims, ms.map((m) => m.field)) : null;
    if (rijen) {
      archiefDeel = rijen;
      if (p.tot < vroegste) return rijen;
      apiPeriode = { van: vroegste, tot: p.tot };
    }
  }

  const max = ctx.cap.maxRangeDays ?? 31;
  const stukken = aantalDagen(apiPeriode) <= max ? [apiPeriode] : splitsPeriode(apiPeriode, max);
  const gesplitst = stukken.length > 1 || archiefDeel.length > 0;
  const metricsVoorStuk = gesplitst ? ms.filter((m) => ADDITIEVE.has(m.field)) : ms;
  if (!metricsVoorStuk.length) return [];

  const delen = await Promise.all(
    stukken.map((s) =>
      ctx.api.queryAnalytics(ctx.site.id, { start_date: s.van, end_date: s.tot, dimensions: dims, metrics: metricsVoorStuk, ...(filter ? { filter } : {}) })
    )
  );
  if (!gesplitst) return delen[0];

  // Samenvoegen op de dimensies; additieve metrics optellen, de rest wordt null.
  const samen = new Map<string, Rij>();
  for (const rij of [...archiefDeel, ...delen.flat()]) {
    const k = sleutel(rij, dims);
    const doel = samen.get(k) ?? Object.fromEntries(dims.map((d) => [d, rij[d] ?? null]));
    for (const m of ms) doel[m.field] = ADDITIEVE.has(m.field) ? getal(doel[m.field]) + getal(rij[m.field]) : null;
    samen.set(k, doel);
  }
  return [...samen.values()];
}

/* ---------- KPI's ---------- */

export interface Kpis {
  plays: number;
  kijktijd_uren: number;
  /** `null` als het niet in één query over de hele periode kan. */
  unieke_kijkers: number | null;
  kijktijd_per_kijker_min: number | null;
  completes: number;
  complete_rate_pct: number | null;
}

export async function kpis(ctx: Ctx, p: Periode): Promise<Kpis> {
  const zonderDimensie = ctx.cap.totalsWithoutDimension;
  const rijen = await vraag(ctx, p, zonderDimensie ? [] : ["eastern_date"], KERN);
  let plays = 0;
  let tijd = 0;
  let completes = 0;
  for (const r of rijen) {
    plays += getal(r.plays);
    tijd += getal(r.time_watched);
    completes += getal(r.completes);
  }
  // Alleen uit een totaal over de hele periode; nooit dagwaarden optellen.
  const uniek = zonderDimensie && rijen.length === 1 && rijen[0].unique_viewers != null ? getal(rijen[0].unique_viewers) : null;
  return {
    plays,
    kijktijd_uren: uren(tijd),
    unieke_kijkers: uniek,
    kijktijd_per_kijker_min: uniek ? afgerond(tijd / 60 / uniek, 1) : null,
    completes,
    complete_rate_pct: heeftMetric(ctx.cap, "completes") ? pct(completes, plays) : null,
  };
}

function kpiDelta(a: Kpis, b: Kpis) {
  return {
    plays: deltaPct(a.plays, b.plays),
    kijktijd_uren: deltaPct(a.kijktijd_uren, b.kijktijd_uren),
    unieke_kijkers: deltaPct(a.unieke_kijkers, b.unieke_kijkers),
    kijktijd_per_kijker_min: deltaPct(a.kijktijd_per_kijker_min, b.kijktijd_per_kijker_min),
    complete_rate_pct: deltaPct(a.complete_rate_pct, b.complete_rate_pct),
  };
}

export function periodeInfo(k: PeriodeKeuze) {
  return {
    periode: { start_date: k.periode.van, end_date: k.periode.tot, label: k.label, datums: "eastern_date (US Eastern)" },
    vorige_periode: { start_date: k.vorige.van, end_date: k.vorige.tot },
    data_through: k.dataThrough,
  };
}

export function notities(extra: string[] = []): string[] {
  return [TIJDZONE_NOTITIE, UNIEK_NOTITIE, ...extra];
}

export interface DagPunt {
  datum: string;
  plays: number;
  kijktijd_uren: number;
  /** Per dag mag; niet optellen over dagen. */
  unieke_kijkers: number | null;
  completes: number;
}

export async function dagreeks(ctx: Ctx, p: Periode, filter?: Filter[]): Promise<DagPunt[]> {
  const rijen = await vraag(ctx, p, ["eastern_date"], ["plays", "time_watched", "unique_viewers", "completes"], filter);
  return rijen
    .map((r) => ({
      datum: String(r.eastern_date ?? "").slice(0, 10),
      plays: getal(r.plays),
      kijktijd_uren: uren(getal(r.time_watched)),
      unieke_kijkers: r.unique_viewers == null ? null : getal(r.unique_viewers),
      completes: getal(r.completes),
    }))
    .filter((d) => d.datum)
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

export async function overzicht(ctx: Ctx, keuze: PeriodeKeuze) {
  const [nu, vorig, perDag] = await Promise.all([kpis(ctx, keuze.periode), kpis(ctx, keuze.vorige), dagreeks(ctx, keuze.periode)]);
  const extra: string[] = [];
  if (nu.unieke_kijkers === null) extra.push(onderdeelUitleg(ctx.cap, "uniekPeriode") ?? "Unieke kijkers over deze periode zijn niet in één query op te halen.");
  return {
    site: ctx.site.label,
    ...periodeInfo(keuze),
    kpis: nu,
    vorige: vorig,
    delta_pct: kpiDelta(nu, vorig),
    per_dag: perDag,
    notes: notities(extra),
  };
}

function onderdeelUitleg(cap: SiteCapabilities, wat: Parameters<typeof onderdeel>[1]): string | null {
  const o = onderdeel(cap, wat);
  return o.ok ? null : o.uitleg;
}

/* ---------- Per video ---------- */

export interface Afhaakcurve {
  start: 100;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p100: number | null;
}

export interface VideoCijfers {
  media_id: string;
  titel: string;
  gepubliceerd: string | null;
  duur_sec: number | null;
  type: string;
  team: string;
  seizoen: string | null;
  plays: number;
  kijktijd_uren: number;
  /** Uniek voor deze video over de hele periode (uit één query). */
  unieke_kijkers: number | null;
  completes: number;
  complete_rate_pct: number | null;
  /** Percentage van de plays dat 25/50/75/100% haalde; alleen voor video's langer dan 30 seconden. */
  afhaakcurve: Afhaakcurve | null;
  /** Ruw, voor groeperen. */
  _seconden: number;
  _video: Video;
}

function curve(cap: SiteCapabilities, r: Rij, duur: number | null): Afhaakcurve | null {
  if (!onderdeel(cap, "afhaakcurve").ok) return null;
  if (duur !== null && duur <= 30) return null;
  const plays = getal(r.plays);
  if (!plays) return null;
  return {
    start: 100,
    p25: pct(getal(r["25_percent_completes"]), plays),
    p50: pct(getal(r["50_percent_completes"]), plays),
    p75: pct(getal(r["75_percent_completes"]), plays),
    p100: pct(getal(r.completes), plays),
  };
}

export async function perVideo(ctx: Ctx, p: Periode, filter?: Filter[]): Promise<VideoCijfers[]> {
  if (!onderdeel(ctx.cap, "content").ok) return [];
  const rijen = await vraag(ctx, p, ["media_id"], [...KERN, ...ENGAGEMENT], filter);
  const ids = rijen.map((r) => String(r.media_id ?? "")).filter(Boolean);
  const videos = await ctx.media.zoekOp(ids);
  return rijen
    .filter((r) => r.media_id)
    .map((r) => {
      const v = videos.get(String(r.media_id))!;
      const plays = getal(r.plays);
      const seconden = getal(r.time_watched);
      return {
        media_id: v.id,
        titel: v.titel || `Video zonder titel (${v.id})`,
        gepubliceerd: v.gepubliceerd ? v.gepubliceerd.slice(0, 10) : null,
        duur_sec: v.duur === null ? null : Math.round(v.duur),
        type: tagLabel("type", v.taxonomie.type),
        team: tagLabel("team", v.taxonomie.team),
        seizoen: v.taxonomie.seizoen,
        plays,
        kijktijd_uren: uren(seconden),
        unieke_kijkers: r.unique_viewers == null ? null : getal(r.unique_viewers),
        completes: getal(r.completes),
        complete_rate_pct: heeftMetric(ctx.cap, "completes") ? pct(getal(r.completes), plays) : null,
        afhaakcurve: curve(ctx.cap, r, v.duur),
        _seconden: seconden,
        _video: v,
      };
    });
}

/** Zonder de interne velden, voor JSON naar buiten. */
export function openbaar(v: VideoCijfers) {
  const { _seconden, _video, ...rest } = v;
  void _seconden;
  void _video;
  return rest;
}

export interface Groep {
  groep: string;
  videos: number;
  plays: number;
  kijktijd_uren: number;
  aandeel_kijktijd_pct: number | null;
  complete_rate_pct: number | null;
  gemiddelde_plays_per_video: number;
}

export function groepeer(videos: VideoCijfers[], prefix: TagPrefix): Groep[] {
  const totaal = videos.reduce((s, v) => s + v._seconden, 0);
  const groepen = new Map<string, { videos: number; plays: number; seconden: number; completes: number }>();
  for (const v of videos) {
    const label = tagLabel(prefix, v._video.taxonomie[prefix]);
    const g = groepen.get(label) ?? { videos: 0, plays: 0, seconden: 0, completes: 0 };
    g.videos++;
    g.plays += v.plays;
    g.seconden += v._seconden;
    g.completes += v.completes;
    groepen.set(label, g);
  }
  return [...groepen.entries()]
    .map(([groep, g]) => ({
      groep,
      videos: g.videos,
      plays: g.plays,
      kijktijd_uren: uren(g.seconden),
      aandeel_kijktijd_pct: pct(g.seconden, totaal),
      complete_rate_pct: pct(g.completes, g.plays),
      gemiddelde_plays_per_video: Math.round(g.plays / g.videos),
    }))
    .sort((a, b) => b.kijktijd_uren - a.kijktijd_uren);
}

export type SorteerOp = "kijktijd" | "plays" | "unieke_kijkers" | "complete_rate";
export const SORTEER_OP: SorteerOp[] = ["kijktijd", "plays", "unieke_kijkers", "complete_rate"];

const sorteerWaarde: Record<SorteerOp, (v: VideoCijfers) => number> = {
  kijktijd: (v) => v._seconden,
  plays: (v) => v.plays,
  unieke_kijkers: (v) => v.unieke_kijkers ?? -1,
  complete_rate: (v) => v.complete_rate_pct ?? -1,
};

export interface ContentFilter {
  type?: string;
  team?: string;
  seizoen?: string;
}

export async function content(ctx: Ctx, keuze: PeriodeKeuze, opties: { sorteer?: SorteerOp; limiet?: number; filter?: ContentFilter } = {}) {
  const o = onderdeel(ctx.cap, "content");
  if (!o.ok) return { site: ctx.site.label, ...periodeInfo(keuze), beschikbaar: false, uitleg: o.uitleg, notes: notities() };

  const alle = await perVideo(ctx, keuze.periode);
  const gefilterd = alle.filter((v) => pastBij(v._video.taxonomie, opties.filter ?? {}));
  const sorteer = opties.sorteer ?? "kijktijd";
  const top = [...gefilterd].sort((a, b) => sorteerWaarde[sorteer](b) - sorteerWaarde[sorteer](a)).slice(0, opties.limiet ?? 20);

  const totaal = alle.reduce((s, v) => s + v._seconden, 0);
  const zonderType = alle.filter((v) => v._video.taxonomie.type === null);
  const extra = [PERCENTAGE_NOTITIE, "Groepen tonen geen unieke kijkers: die zijn niet optelbaar over video's."];
  if (!onderdeel(ctx.cap, "afhaakcurve").ok) extra.push(onderdeelUitleg(ctx.cap, "afhaakcurve")!);
  if (!onderdeel(ctx.cap, "media").ok) extra.push(onderdeelUitleg(ctx.cap, "media")!);

  return {
    site: ctx.site.label,
    ...periodeInfo(keuze),
    beschikbaar: true,
    filter: opties.filter ?? {},
    sorteer_op: sorteer,
    videos_met_kijkers: alle.length,
    videos_na_filter: gefilterd.length,
    top: top.map(openbaar),
    per_type: groepeer(alle, "type"),
    per_team: groepeer(alle, "team"),
    ongecategoriseerd: {
      videos: zonderType.length,
      kijktijd_uren: uren(zonderType.reduce((s, v) => s + v._seconden, 0)),
      aandeel_kijktijd_pct: pct(zonderType.reduce((s, v) => s + v._seconden, 0), totaal),
    },
    notes: notities(extra),
  };
}

/* ---------- Eén video ---------- */

export async function mediaDetail(ctx: Ctx, mediaId: string, keuze: PeriodeKeuze) {
  const video = (await ctx.media.zoekOp([mediaId])).get(mediaId)!;
  const filter: Filter[] = [{ field: "media_id", operator: "=", value: [mediaId] }];
  const o = onderdeel(ctx.cap, "content");
  if (!o.ok) return { site: ctx.site.label, ...periodeInfo(keuze), beschikbaar: false, uitleg: o.uitleg, notes: notities() };

  const [alle, perDag] = await Promise.all([perVideo(ctx, keuze.periode), dagreeks(ctx, keuze.periode, filter)]);
  const deze = alle.find((v) => v.media_id === mediaId);
  const zelfdeType = alle.filter((v) => v.media_id !== mediaId && v._video.taxonomie.type === video.taxonomie.type);
  const gem = (f: (v: VideoCijfers) => number | null) => {
    const w = zelfdeType.map(f).filter((x): x is number => x !== null);
    return w.length ? afgerond(w.reduce((a, b) => a + b, 0) / w.length, 1) : null;
  };

  return {
    site: ctx.site.label,
    ...periodeInfo(keuze),
    beschikbaar: true,
    video: {
      media_id: video.id,
      titel: video.titel,
      gepubliceerd: video.gepubliceerd?.slice(0, 10) ?? null,
      duur_sec: video.duur === null ? null : Math.round(video.duur),
      type: tagLabel("type", video.taxonomie.type),
      team: tagLabel("team", video.taxonomie.team),
      seizoen: video.taxonomie.seizoen,
      tags: video.tags,
    },
    cijfers: deze ? openbaar(deze) : null,
    per_dag: perDag.map(({ datum, plays, kijktijd_uren, completes }) => ({ datum, plays, kijktijd_uren, completes })),
    gemiddelde_zelfde_type: {
      type: tagLabel("type", video.taxonomie.type),
      videos: zelfdeType.length,
      plays: gem((v) => v.plays),
      kijktijd_uren: gem((v) => v.kijktijd_uren),
      complete_rate_pct: gem((v) => v.complete_rate_pct),
    },
    notes: notities([
      PERCENTAGE_NOTITIE,
      ...(deze ? [] : ["Deze video had in deze periode geen plays."]),
      "Het gemiddelde van hetzelfde type is over de video's van dat type die in deze periode plays hadden, zonder deze video.",
    ]),
  };
}

/* ---------- Periodes vergelijken ---------- */

export async function vergelijk(ctx: Ctx, a: Periode, b: Periode, per: "totaal" | "type", info: { data_through: string }) {
  const periodes = {
    periode_a: { start_date: a.van, end_date: a.tot },
    periode_b: { start_date: b.van, end_date: b.tot },
    data_through: info.data_through,
  };
  if (per === "totaal") {
    const [ka, kb] = await Promise.all([kpis(ctx, a), kpis(ctx, b)]);
    return { site: ctx.site.label, ...periodes, per, a: ka, b: kb, delta_pct_a_t_o_v_b: kpiDelta(ka, kb), notes: notities() };
  }
  const o = onderdeel(ctx.cap, "content");
  if (!o.ok) return { site: ctx.site.label, ...periodes, per, beschikbaar: false, uitleg: o.uitleg, notes: notities() };
  const [va, vb] = await Promise.all([perVideo(ctx, a), perVideo(ctx, b)]);
  const ga = groepeer(va, "type");
  const gb = new Map(groepeer(vb, "type").map((g) => [g.groep, g]));
  const namen = [...new Set([...ga.map((g) => g.groep), ...gb.keys()])];
  return {
    site: ctx.site.label,
    ...periodes,
    per,
    types: namen.map((naam) => {
      const x = ga.find((g) => g.groep === naam) ?? null;
      const y = gb.get(naam) ?? null;
      return {
        type: naam,
        a: x && { videos: x.videos, plays: x.plays, kijktijd_uren: x.kijktijd_uren, complete_rate_pct: x.complete_rate_pct },
        b: y && { videos: y.videos, plays: y.plays, kijktijd_uren: y.kijktijd_uren, complete_rate_pct: y.complete_rate_pct },
        delta_kijktijd_pct: deltaPct(x?.kijktijd_uren, y?.kijktijd_uren),
        delta_plays_pct: deltaPct(x?.plays, y?.plays),
      };
    }),
    notes: notities(["Per type zonder unieke kijkers: die zijn niet optelbaar over video's."]),
  };
}

/* ---------- Live ---------- */

export interface LiveUitzending {
  media_id: string;
  titel: string;
  type: string;
  team: string;
  /** Eerste JW-dag met live-plays. */
  datum: string;
  live: { plays: number; unieke_kijkers: number | null; kijktijd_uren: number };
  nakijk: { plays: number; kijktijd_uren: number; tot_en_met: string; opnames: string[] };
}

const NAKIJK_DAGEN = 7;

export async function live(ctx: Ctx, keuze: PeriodeKeuze) {
  const o = onderdeel(ctx.cap, "live");
  if (!o.ok) return { site: ctx.site.label, ...periodeInfo(keuze), beschikbaar: false, uitleg: o.uitleg, notes: notities() };

  const p = keuze.periode;
  const filter = [LIVE_FILTER];
  const [liveRijen, liveDagen] = await Promise.all([
    vraag(ctx, p, ["media_id"], ["plays", "unique_viewers", "time_watched"], filter),
    heeftDimensie(ctx.cap, "eastern_date") ? vraag(ctx, p, ["media_id", "eastern_date"], ["plays", "time_watched"], filter) : Promise.resolve([]),
  ]);
  const ids = liveRijen.map((r) => String(r.media_id ?? "")).filter(Boolean);
  if (!ids.length) {
    return { site: ctx.site.label, ...periodeInfo(keuze), beschikbaar: true, uitzendingen: [], per_type: [], notes: notities(["Geen live-uitzendingen met plays in deze periode."]) };
  }

  const videos = await ctx.media.zoekOp(ids);
  const eersteDag = new Map<string, string>();
  const livePerDag = new Map<string, { plays: number; seconden: number }>();
  for (const r of liveDagen) {
    const id = String(r.media_id);
    const d = String(r.eastern_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!eersteDag.has(id) || d < eersteDag.get(id)!) eersteDag.set(id, d);
    livePerDag.set(`${id}|${d}`, { plays: getal(r.plays), seconden: getal(r.time_watched) });
  }

  // Opnames die als losse video zijn gepubliceerd: dezelfde titel, tot drie dagen na de uitzending.
  const alleVideos = onderdeel(ctx.cap, "media").ok ? await ctx.media.alle() : [];
  const opnamesVan = new Map<string, Video[]>();
  for (const id of ids) {
    const v = videos.get(id)!;
    const d0 = eersteDag.get(id) ?? p.van;
    const titel = plat(v.titel);
    if (!titel) continue;
    const opnames = alleVideos.filter((m) => {
      if (m.id === id || ids.includes(m.id) || !m.gepubliceerd) return false;
      const d = m.gepubliceerd.slice(0, 10);
      return d >= plusDagen(d0, -1) && d <= plusDagen(d0, 3) && (plat(m.titel) === titel || plat(m.titel).includes(titel));
    });
    opnamesVan.set(id, opnames);
  }

  // Alle plays (live én on demand) van de uitzendingen en hun opnames, in de dagen erna.
  const vensterTot = (d0: string) => {
    const t = plusDagen(d0, NAKIJK_DAGEN);
    return t > keuze.dataThrough ? keuze.dataThrough : t;
  };
  const allesVan = [...new Set([...ids, ...[...opnamesVan.values()].flat().map((m) => m.id)])];
  const start = [...eersteDag.values(), p.van].sort()[0];
  const eind = vensterTot([...eersteDag.values(), p.tot].sort().reverse()[0]);
  const totaalRijen = await vraag(ctx, { van: start, tot: eind }, ["media_id", "eastern_date"], ["plays", "time_watched"], [
    { field: "media_id", operator: "=", value: allesVan },
  ]);

  const uitzendingen: LiveUitzending[] = liveRijen
    .map((r) => {
      const id = String(r.media_id);
      const v = videos.get(id)!;
      const d0 = eersteDag.get(id) ?? p.van;
      const tot = vensterTot(d0);
      const opnames = opnamesVan.get(id) ?? [];
      const opnameIds = new Set(opnames.map((m) => m.id));
      let plays = 0;
      let seconden = 0;
      for (const t of totaalRijen) {
        const tid = String(t.media_id);
        const d = String(t.eastern_date ?? "").slice(0, 10);
        if (d < d0 || d > tot) continue;
        if (tid === id) {
          const l = livePerDag.get(`${id}|${d}`) ?? { plays: 0, seconden: 0 };
          plays += Math.max(0, getal(t.plays) - l.plays);
          seconden += Math.max(0, getal(t.time_watched) - l.seconden);
        } else if (opnameIds.has(tid)) {
          plays += getal(t.plays);
          seconden += getal(t.time_watched);
        }
      }
      return {
        media_id: id,
        titel: v.titel || `Uitzending zonder titel (${id})`,
        type: tagLabel("type", v.taxonomie.type),
        team: tagLabel("team", v.taxonomie.team),
        datum: d0,
        live: {
          plays: getal(r.plays),
          unieke_kijkers: r.unique_viewers == null ? null : getal(r.unique_viewers),
          kijktijd_uren: uren(getal(r.time_watched)),
        },
        nakijk: { plays, kijktijd_uren: uren(seconden), tot_en_met: tot, opnames: opnames.map((m) => m.titel) },
      };
    })
    .sort((a, b) => b.datum.localeCompare(a.datum));

  const perType = new Map<string, { n: number; live: number; nakijk: number; uren: number }>();
  for (const u of uitzendingen) {
    const g = perType.get(u.type) ?? { n: 0, live: 0, nakijk: 0, uren: 0 };
    g.n++;
    g.live += u.live.plays;
    g.nakijk += u.nakijk.plays;
    g.uren += u.live.kijktijd_uren + u.nakijk.kijktijd_uren;
    perType.set(u.type, g);
  }

  return {
    site: ctx.site.label,
    ...periodeInfo(keuze),
    beschikbaar: true,
    uitzendingen,
    per_type: [...perType.entries()]
      .map(([type, g]) => ({
        type,
        uitzendingen: g.n,
        gem_live_plays: Math.round(g.live / g.n),
        gem_nakijk_plays: Math.round(g.nakijk / g.n),
        gem_kijktijd_uren: afgerond(g.uren / g.n, 1),
      }))
      .sort((a, b) => b.uitzendingen - a.uitzendingen),
    notes: notities([
      `Live = plays in playback mode LIVE of DVR. Nakijken = on-demand plays van dezelfde video plus van opnames met dezelfde titel (gepubliceerd tot drie dagen later), vanaf de uitzenddag tot en met ${NAKIJK_DAGEN} dagen erna.`,
    ]),
  };
}

/* ---------- Publiek ---------- */

const PLATFORM_LABEL: Record<string, string> = {
  web: "Web",
  html5: "Web",
  ios: "iOS",
  android: "Android",
  tvos: "tvOS (Apple TV)",
  appletv: "tvOS (Apple TV)",
  roku: "Roku",
  firetv: "Fire TV",
  fire_tv: "Fire TV",
  androidtv: "Android TV",
  android_tv: "Android TV",
  samsung: "Samsung TV",
  tizen: "Samsung TV",
  lg: "LG TV",
  webos: "LG TV",
  chromecast: "Chromecast",
};

function landNaam(code: string): string {
  try {
    return new Intl.DisplayNames(["nl"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export interface Verdeling {
  waarde: string;
  label: string;
  plays: number;
  kijktijd_uren: number;
  aandeel_plays_pct: number | null;
}

async function verdeling(ctx: Ctx, p: Periode, dim: string, label: (w: string) => string): Promise<Verdeling[]> {
  const rijen = await vraag(ctx, p, [dim], ["plays", "time_watched"]);
  const totaal = rijen.reduce((s, r) => s + getal(r.plays), 0);
  return rijen
    .map((r) => {
      const waarde = String(r[dim] ?? "onbekend");
      return { waarde, label: label(waarde), plays: getal(r.plays), kijktijd_uren: uren(getal(r.time_watched)), aandeel_plays_pct: pct(getal(r.plays), totaal) };
    })
    .sort((a, b) => b.plays - a.plays);
}

export async function publiek(ctx: Ctx, keuze: PeriodeKeuze) {
  const p = keuze.periode;
  const uit: Record<string, unknown> = { site: ctx.site.label, ...periodeInfo(keuze) };
  const extra: string[] = [];

  const dev = onderdeel(ctx.cap, "device");
  uit.device = dev.ok ? await verdeling(ctx, p, "device_id", (w) => w) : null;
  if (!dev.ok) extra.push(dev.uitleg);

  const plat_ = onderdeel(ctx.cap, "platform");
  uit.platform = plat_.ok ? await verdeling(ctx, p, "platform_id", (w) => PLATFORM_LABEL[w.toLowerCase()] ?? w) : null;
  if (!plat_.ok) extra.push(plat_.uitleg);

  const land = onderdeel(ctx.cap, "land");
  if (land.ok) {
    const landen = await verdeling(ctx, p, "country_code", landNaam);
    const totaal = landen.reduce((s, l) => s + l.plays, 0);
    const buitenland = landen.filter((l) => l.waarde.toUpperCase() !== "NL");
    const buitenlandPlays = buitenland.reduce((s, l) => s + l.plays, 0);
    uit.land = {
      top10: landen.slice(0, 10),
      nederland_pct: pct(totaal - buitenlandPlays, totaal),
      buitenland_totaal: {
        landen: buitenland.length,
        plays: buitenlandPlays,
        kijktijd_uren: afgerond(buitenland.reduce((s, l) => s + l.kijktijd_uren, 0), 1),
        aandeel_plays_pct: pct(buitenlandPlays, totaal),
      },
    };
  } else {
    uit.land = null;
    extra.push(land.uitleg);
  }
  uit.notes = notities(["Verdelingen zijn op plays; JW bepaalt land op basis van het IP-adres."]);
  if (extra.length) uit.niet_beschikbaar = extra;
  return uit;
}

/* ---------- Zoeken ---------- */

export async function zoekMedia(
  ctx: Ctx,
  opties: { zoek?: string; tag?: string; gepubliceerd_van?: string; gepubliceerd_tot?: string; limiet?: number }
) {
  const o = onderdeel(ctx.cap, "media");
  if (!o.ok) return { site: ctx.site.label, beschikbaar: false, uitleg: o.uitleg };
  const woorden = plat(opties.zoek ?? "").split(" ").filter(Boolean);
  const tag = opties.tag?.trim().toLowerCase();
  const gevonden = (await ctx.media.alle())
    .filter((v) => {
      const d = v.gepubliceerd?.slice(0, 10) ?? "";
      if (opties.gepubliceerd_van && (!d || d < opties.gepubliceerd_van)) return false;
      if (opties.gepubliceerd_tot && (!d || d > opties.gepubliceerd_tot)) return false;
      if (tag && !v.tags.some((t) => t.toLowerCase() === tag || t.toLowerCase().replace(/\s*:\s*/, ":") === tag.replace(/\s*:\s*/, ":"))) return false;
      if (!woorden.length) return true;
      const hooiberg = plat(`${v.titel} ${v.tags.join(" ")}`);
      return woorden.every((w) => hooiberg.includes(w));
    })
    .sort((a, b) => (b.gepubliceerd ?? "").localeCompare(a.gepubliceerd ?? ""));
  return {
    site: ctx.site.label,
    gevonden: gevonden.length,
    videos: gevonden.slice(0, opties.limiet ?? 20).map((v) => ({
      media_id: v.id,
      titel: v.titel,
      gepubliceerd: v.gepubliceerd?.slice(0, 10) ?? null,
      duur_sec: v.duur === null ? null : Math.round(v.duur),
      type: tagLabel("type", v.taxonomie.type),
      team: tagLabel("team", v.taxonomie.team),
      seizoen: v.taxonomie.seizoen,
      tags: v.tags,
    })),
    notes: ["Publicatiedatums zoals JW ze geeft (UTC). Gebruik media_id in psvplay_media_detail voor de cijfers."],
  };
}
