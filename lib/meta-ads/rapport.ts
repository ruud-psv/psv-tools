import { assertCleanSecret } from "../paid-ads/connectors/types";

/**
 * Meta Ads voor de MCP-server van PSV Tools (`lib/mcp/servers/meta-ads.ts`).
 * Puur: van invoer naar de parameters voor de Graph API, en van het antwoord
 * naar tekst voor een model. Dezelfde instellingen als het Paid Ads-dashboard
 * (`lib/paid-ads/connectors/meta.ts`), dat ongewijzigd blijft.
 */

export const GRAPH_HOST = "https://graph.facebook.com";
const DEFAULT_API_VERSION = "v21.0";

export interface MetaConfig {
  token: string;
  /** `act_<id>`: het enige account waar de server bij kan. */
  accountPath: string;
  apiVersion: string;
}

/** Ontbrekende of onjuiste instelling aan de kant van PSV Tools. */
export class MetaConfigError extends Error {}
/** Een fout in de vraag, die het model kan herstellen. */
export class MetaInvoerFout extends Error {}
/** Meta gaf een fout terug. */
export class MetaFout extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function metaConfig(env: Record<string, string | undefined> = process.env): MetaConfig {
  const token = env.META_ADS_ACCESS_TOKEN?.trim();
  const accountId = env.META_ADS_ACCOUNT_ID?.trim();
  const missing = [!token && "META_ADS_ACCESS_TOKEN", !accountId && "META_ADS_ACCOUNT_ID"].filter(Boolean);
  if (missing.length) throw new MetaConfigError(`Meta-configuratie ontbreekt: ${missing.join(", ")}.`);
  try {
    assertCleanSecret("META_ADS_ACCESS_TOKEN", token!);
  } catch (err) {
    throw new MetaConfigError((err as Error).message);
  }
  return {
    token: token!,
    accountPath: accountId!.startsWith("act_") ? accountId! : `act_${accountId}`,
    apiVersion: env.META_ADS_API_VERSION?.trim() || DEFAULT_API_VERSION,
  };
}

/** Haalt het token uit tekst die naar buiten gaat, voor het geval Meta het terugstuurt. */
export function redact(text: string, token: string): string {
  return token ? text.split(token).join("[token]") : text;
}

/* ---------- Invoer ---------- */

export const NIVEAUS = ["account", "campaign", "adset", "ad"] as const;
export type Niveau = (typeof NIVEAUS)[number];

export const PERIODES = [
  "today",
  "yesterday",
  "this_week_mon_today",
  "last_week_mon_sun",
  "last_3d",
  "last_7d",
  "last_14d",
  "last_28d",
  "last_30d",
  "last_90d",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
  "maximum",
] as const;

export const OPERATORS = ["EQUAL", "NOT_EQUAL", "CONTAIN", "NOT_CONTAIN", "GREATER_THAN", "LESS_THAN", "IN", "NOT_IN"] as const;

export const VELDNAAM = /^[a-z][a-z0-9_]{0,60}$/;
export const FILTERVELD = /^[a-z][a-z0-9_]{0,40}(\.[a-z][a-z0-9_]{0,40})?$/;
export const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_VELDEN = 20;
export const MAX_RIJEN = 250;
export const STANDAARD_RIJEN = 25;

export interface MetaFilter {
  veld: string;
  operator: (typeof OPERATORS)[number];
  /** Bij IN en NOT_IN: waarden gescheiden door komma's. */
  waarde: string;
}

export interface RapportInvoer {
  niveau: Niveau;
  velden: string[];
  periode?: (typeof PERIODES)[number];
  van?: string;
  tot?: string;
  per?: "dag" | "week" | "maand";
  uitsplitsing?: string[];
  filters?: MetaFilter[];
  actie_types?: string[];
  sorteer_op?: string;
  oplopend?: boolean;
  limiet?: number;
}

export interface ObjectenInvoer {
  niveau: "campaign" | "adset" | "ad";
  alleen_actief?: boolean;
  zoek?: string;
  limiet?: number;
}

/** De naamvelden die bij elk niveau horen, zodat een rij te herkennen is. */
const NAAMVELDEN: Record<Niveau, string[]> = {
  account: [],
  campaign: ["campaign_name"],
  adset: ["campaign_name", "adset_name"],
  ad: ["campaign_name", "adset_name", "ad_name"],
};

function limiet(waarde: number | undefined, standaard = STANDAARD_RIJEN): number {
  if (!waarde || !Number.isFinite(waarde)) return standaard;
  return Math.min(Math.max(1, Math.floor(waarde)), MAX_RIJEN);
}

function filtering(filters: MetaFilter[] | undefined) {
  return (filters ?? []).map((f) => ({
    field: f.veld,
    operator: f.operator,
    value: f.operator === "IN" || f.operator === "NOT_IN" ? f.waarde.split(",").map((w) => w.trim()).filter(Boolean) : f.waarde,
  }));
}

/** De kolommen van een rapport, in de volgorde van de tabel. */
export function rapportKolommen(invoer: RapportInvoer): string[] {
  const kolommen = [
    ...(invoer.per ? ["date_start"] : []),
    ...(invoer.uitsplitsing ?? []),
    ...NAAMVELDEN[invoer.niveau],
    ...invoer.velden,
  ];
  return [...new Set(kolommen)];
}

export function rapportParams(invoer: RapportInvoer): Record<string, string> {
  const heeftBereik = Boolean(invoer.van || invoer.tot);
  if (invoer.periode && heeftBereik) throw new MetaInvoerFout("Geef een periode of van en tot, niet allebei.");
  if (!invoer.periode && !heeftBereik) throw new MetaInvoerFout("Geef een periode (zoals last_7d) of van en tot.");
  if (heeftBereik && (!invoer.van || !invoer.tot)) throw new MetaInvoerFout("Geef zowel van als tot.");

  const velden = [...new Set([...NAAMVELDEN[invoer.niveau], ...invoer.velden])];
  const params: Record<string, string> = {
    level: invoer.niveau,
    fields: velden.join(","),
    limit: String(limiet(invoer.limiet)),
    // Zonder deze vlag rapporteert Meta op het attributievenster van de API in
    // plaats van dat van het account; dan wijken de cijfers af van Ads Manager.
    use_unified_attribution_setting: "true",
  };
  if (invoer.periode) params.date_preset = invoer.periode;
  else params.time_range = JSON.stringify({ since: invoer.van, until: invoer.tot });
  if (invoer.per) params.time_increment = invoer.per === "dag" ? "1" : invoer.per === "week" ? "7" : "monthly";
  if (invoer.uitsplitsing?.length) params.breakdowns = invoer.uitsplitsing.join(",");
  if (invoer.filters?.length) params.filtering = JSON.stringify(filtering(invoer.filters));
  const sorteer = invoer.sorteer_op ?? invoer.velden[0];
  if (sorteer) params.sort = JSON.stringify([`${sorteer}_${invoer.oplopend ? "ascending" : "descending"}`]);
  return params;
}

export const OBJECT_EDGE = { campaign: "campaigns", adset: "adsets", ad: "ads" } as const;

const OBJECT_VELDEN = {
  campaign: "id,name,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time",
  adset: "id,name,effective_status,campaign{name},optimization_goal,daily_budget,lifetime_budget,start_time,end_time",
  ad: "id,name,effective_status,campaign{name},adset{name},created_time",
};

export function objectenParams(invoer: ObjectenInvoer): Record<string, string> {
  const params: Record<string, string> = { fields: OBJECT_VELDEN[invoer.niveau], limit: String(limiet(invoer.limiet, 50)) };
  if (invoer.alleen_actief) params.effective_status = JSON.stringify(["ACTIVE"]);
  if (invoer.zoek?.trim()) params.filtering = JSON.stringify([{ field: "name", operator: "CONTAIN", value: invoer.zoek.trim() }]);
  return params;
}

/* ---------- Tekst voor het model ---------- */

export interface MetaAccount {
  id?: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
}

export interface MetaLijst {
  data?: Record<string, unknown>[];
  paging?: { next?: string };
}

function kort(value: string): string {
  if (!/^-?\d+\.\d+$/.test(value)) return value;
  return String(Number(Number(value).toFixed(4)));
}

/** Een waarde uit een rij: acties als `soort=waarde`, de rest als tekst. */
function cel(value: unknown, actieTypes: string[] | undefined): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) {
    const acties = value.filter(
      (a): a is { action_type: string; value: unknown } => Boolean(a) && typeof a === "object" && "action_type" in a
    );
    if (acties.length === value.length) {
      const gekozen = actieTypes?.length ? acties.filter((a) => actieTypes.includes(a.action_type)) : acties;
      const tekst = gekozen.slice(0, 12).map((a) => `${a.action_type}=${kort(String(a.value))}`);
      if (gekozen.length > 12) tekst.push(`… en nog ${gekozen.length - 12}`);
      return tekst.join("; ");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "object") {
    const naam = (value as { name?: unknown }).name;
    return typeof naam === "string" ? naam : JSON.stringify(value);
  }
  return kort(String(value));
}

function accountKop(account: MetaAccount, accountPath: string): string {
  const extra = [account.currency && `valuta ${account.currency}`, account.timezone_name && `tijdzone ${account.timezone_name}`]
    .filter(Boolean)
    .join(", ");
  return `${account.name ?? "Advertentieaccount"} (${accountPath})${extra ? `, ${extra}` : ""}`;
}

export function rapportTekst(lijst: MetaLijst, invoer: RapportInvoer, account: MetaAccount, accountPath: string): string {
  const rijen = lijst.data ?? [];
  const periode = invoer.periode ?? `${invoer.van} tot en met ${invoer.tot}`;
  const sorteer = invoer.sorteer_op ?? invoer.velden[0];
  const regels = [
    `META ADS · ${accountKop(account, accountPath)} · niveau ${invoer.niveau} · ${periode}${invoer.per ? ` · per ${invoer.per}` : ""}`,
    rijen.length === 0
      ? "Geen rijen voor deze vraag en periode."
      : `${rijen.length} rijen${sorteer ? `, gesorteerd op ${sorteer} (${invoer.oplopend ? "oplopend" : "aflopend"})` : ""}. Bedragen in de valuta van het account.`,
  ];
  if (rijen.length > 0) {
    const kolommen = rapportKolommen(invoer);
    regels.push("", kolommen.join(" | "), ...rijen.map((rij) => kolommen.map((k) => cel(rij[k], invoer.actie_types)).join(" | ")));
  }
  if (lijst.paging?.next) regels.push("", "Er zijn meer rijen; vraag een hogere limiet of gebruik een filter.");
  return regels.join("\n");
}

function budget(value: unknown, currency: string | undefined): string {
  const centen = Number(value);
  if (value === undefined || value === null || value === "" || !Number.isFinite(centen)) return "";
  // Meta geeft budgetten in de kleinste eenheid (centen bij EUR).
  return `${(centen / 100).toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

export function objectenTekst(lijst: MetaLijst, invoer: ObjectenInvoer, account: MetaAccount, accountPath: string): string {
  const rijen = lijst.data ?? [];
  const soort = { campaign: "campagnes", adset: "advertentiesets", ad: "advertenties" }[invoer.niveau];
  const regels = [
    `META ADS · ${accountKop(account, accountPath)} · ${soort}${invoer.alleen_actief ? " (alleen actief)" : ""}${invoer.zoek ? ` met "${invoer.zoek}"` : ""}`,
    rijen.length === 0 ? `Geen ${soort} gevonden.` : `${rijen.length} ${soort}.`,
  ];
  if (rijen.length > 0) {
    const kolommen =
      invoer.niveau === "campaign"
        ? ["id", "name", "effective_status", "objective", "daily_budget", "lifetime_budget", "start_time", "stop_time"]
        : invoer.niveau === "adset"
          ? ["id", "name", "effective_status", "campaign", "optimization_goal", "daily_budget", "lifetime_budget", "start_time", "end_time"]
          : ["id", "name", "effective_status", "campaign", "adset", "created_time"];
    regels.push(
      "",
      kolommen.join(" | "),
      ...rijen.map((rij) =>
        kolommen.map((k) => (k.endsWith("_budget") ? budget(rij[k], account.currency) : cel(rij[k], undefined))).join(" | ")
      )
    );
  }
  if (lijst.paging?.next) regels.push("", "Er zijn er meer; vraag een hogere limiet of zoek specifieker.");
  return regels.join("\n");
}
