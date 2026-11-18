import type { protos } from "@google-analytics/data";

/**
 * Rapporten op Google Analytics 4 voor de MCP-server van PSV Tools
 * (`lib/mcp/servers/google-analytics.ts`). Puur: van invoer naar een verzoek
 * aan de Data API, en van het antwoord naar tekst voor een model.
 */

type RunReportRequest = protos.google.analytics.data.v1beta.IRunReportRequest;
type RunReportResponse = protos.google.analytics.data.v1beta.IRunReportResponse;
type RunRealtimeReportRequest = protos.google.analytics.data.v1beta.IRunRealtimeReportRequest;
type RunRealtimeReportResponse = protos.google.analytics.data.v1beta.IRunRealtimeReportResponse;
type FilterExpression = protos.google.analytics.data.v1beta.IFilterExpression;
type Metadata = protos.google.analytics.data.v1beta.IMetadata;

export interface GaSite {
  /** Korte sleutel, zoals `psv`. */
  key: string;
  /** Het domein, zoals `psv.nl`. */
  label: string;
  propertyId: string;
  /** De omgevingsvariabele met het property-id, voor foutmeldingen. */
  envVar?: string;
}

/** Een veldnaam in de Data API, ook eigen velden als `customEvent:speler`. */
export const VELDNAAM = /^[a-zA-Z][a-zA-Z0-9_:]{0,99}$/;
/** JJJJ-MM-DD, of de relatieve datums die de Data API kent. */
export const DATUM = /^(\d{4}-\d{2}-\d{2}|today|yesterday|\d{1,4}daysAgo)$/;

/** `MetricAggregation.TOTAL`; als getal, zodat dit bestand de GA-bibliotheek niet hoeft te laden. */
const TOTAAL = 1 as protos.google.analytics.data.v1beta.MetricAggregation;

export const MAX_METRICS = 10;
export const MAX_DIMENSIES = 9;
export const MAX_RIJEN = 250;
export const STANDAARD_RIJEN = 10;

export type FilterType = "gelijk" | "bevat" | "begint_met" | "eindigt_met" | "regex";

export interface RapportFilter {
  dimensie: string;
  type: FilterType;
  waarde: string;
  /** Rijen die aan het filter voldoen juist weglaten. */
  uitsluiten?: boolean;
}

export interface RapportInvoer {
  site: string;
  metrics: string[];
  dimensies?: string[];
  van: string;
  tot: string;
  vergelijk_van?: string;
  vergelijk_tot?: string;
  filters?: RapportFilter[];
  sorteer_op?: string;
  oplopend?: boolean;
  limiet?: number;
}

export interface RealtimeInvoer {
  site: string;
  metrics: string[];
  dimensies?: string[];
  filters?: RapportFilter[];
  limiet?: number;
}

const MATCH_TYPE: Record<FilterType, "EXACT" | "CONTAINS" | "BEGINS_WITH" | "ENDS_WITH" | "FULL_REGEXP"> = {
  gelijk: "EXACT",
  bevat: "CONTAINS",
  begint_met: "BEGINS_WITH",
  eindigt_met: "ENDS_WITH",
  regex: "FULL_REGEXP",
};

function filterExpressie(filters: RapportFilter[] | undefined): FilterExpression | undefined {
  if (!filters?.length) return undefined;
  const expressies: FilterExpression[] = filters.map((f) => {
    const filter: FilterExpression = {
      filter: { fieldName: f.dimensie, stringFilter: { matchType: MATCH_TYPE[f.type], value: f.waarde, caseSensitive: false } },
    };
    return f.uitsluiten ? { notExpression: filter } : filter;
  });
  return expressies.length === 1 ? expressies[0] : { andGroup: { expressions: expressies } };
}

function sortering(invoer: { metrics: string[]; sorteer_op?: string; oplopend?: boolean }) {
  const veld = invoer.sorteer_op ?? invoer.metrics[0];
  const desc = !invoer.oplopend;
  return invoer.metrics.includes(veld) ? [{ metric: { metricName: veld }, desc }] : [{ dimension: { dimensionName: veld }, desc }];
}

function limiet(waarde: number | undefined): number {
  if (!waarde || !Number.isFinite(waarde)) return STANDAARD_RIJEN;
  return Math.min(Math.max(1, Math.floor(waarde)), MAX_RIJEN);
}

export function vindSite(sites: GaSite[], key: string): GaSite {
  const site = sites.find((s) => s.key === key);
  if (!site) throw new GaInvoerFout(`Onbekende site "${key}". Kies uit: ${sites.map((s) => s.key).join(", ")}.`);
  return site;
}

/** Een fout in de vraag, die het model kan herstellen. */
export class GaInvoerFout extends Error {}

/** Ontbrekende of onleesbare instelling van het service-account. */
export class GaConfigError extends Error {}

export function rapportVerzoek(invoer: RapportInvoer, site: GaSite): RunReportRequest {
  const dateRanges = [{ startDate: invoer.van, endDate: invoer.tot, name: "periode" }];
  if (invoer.vergelijk_van || invoer.vergelijk_tot) {
    if (!invoer.vergelijk_van || !invoer.vergelijk_tot) {
      throw new GaInvoerFout("Geef voor een vergelijking zowel vergelijk_van als vergelijk_tot op.");
    }
    dateRanges.push({ startDate: invoer.vergelijk_van, endDate: invoer.vergelijk_tot, name: "vergelijking" });
  }
  return {
    property: `properties/${site.propertyId}`,
    dateRanges,
    metrics: invoer.metrics.map((name) => ({ name })),
    dimensions: (invoer.dimensies ?? []).map((name) => ({ name })),
    dimensionFilter: filterExpressie(invoer.filters),
    orderBys: sortering(invoer),
    limit: limiet(invoer.limiet),
    metricAggregations: [TOTAAL],
  };
}

export function realtimeVerzoek(invoer: RealtimeInvoer, site: GaSite): RunRealtimeReportRequest {
  return {
    property: `properties/${site.propertyId}`,
    metrics: invoer.metrics.map((name) => ({ name })),
    dimensions: (invoer.dimensies ?? []).map((name) => ({ name })),
    dimensionFilter: filterExpressie(invoer.filters),
    orderBys: sortering(invoer),
    limit: limiet(invoer.limiet),
    metricAggregations: [TOTAAL],
  };
}

/** Kommagetallen kort houden; hele getallen en tekst blijven zoals ze zijn. */
function waarde(value: string | null | undefined): string {
  const tekst = value ?? "";
  if (!/^-?\d+\.\d+(e[-+]?\d+)?$/i.test(tekst)) return tekst;
  return String(Number(Number(tekst).toFixed(4)));
}

const EENHEID: Record<string, string> = {
  TYPE_SECONDS: "seconden",
  TYPE_MILLISECONDS: "milliseconden",
  TYPE_MINUTES: "minuten",
  TYPE_HOURS: "uren",
  TYPE_CURRENCY: "valuta",
};

function tabel(response: RunReportResponse | RunRealtimeReportResponse): string[] {
  const dimensies = (response.dimensionHeaders ?? []).map((h) => h.name ?? "");
  const metrics = (response.metricHeaders ?? []).map((h) => {
    const eenheid = EENHEID[String(h.type ?? "")];
    return eenheid ? `${h.name} (${eenheid})` : h.name ?? "";
  });
  const regels = [[...dimensies, ...metrics].join(" | ")];
  for (const rij of response.rows ?? []) {
    regels.push(
      [...(rij.dimensionValues ?? []).map((v) => v.value ?? ""), ...(rij.metricValues ?? []).map((v) => waarde(v.value))].join(" | ")
    );
  }
  // Zonder dimensies is de enige rij al het totaal.
  for (const totaal of dimensies.length > 0 ? response.totals ?? [] : []) {
    const label = (totaal.dimensionValues ?? []).map((v) => v.value ?? "").filter((v) => v && v !== "RESERVED_TOTAL");
    regels.push(
      [`TOTAAL${label.length ? ` (${label.join(", ")})` : ""}`, ...dimensies.slice(1).map(() => ""), ...(totaal.metricValues ?? []).map((v) => waarde(v.value))].join(
        " | "
      )
    );
  }
  return regels;
}

export function rapportTekst(response: RunReportResponse, invoer: RapportInvoer, site: GaSite): string {
  const getoond = response.rows?.length ?? 0;
  const totaal = Number(response.rowCount ?? getoond);
  const periode = `${invoer.van} tot en met ${invoer.tot}`;
  const vergelijking = invoer.vergelijk_van ? `, vergeleken met ${invoer.vergelijk_van} tot en met ${invoer.vergelijk_tot}` : "";
  const sorteer = invoer.sorteer_op ?? invoer.metrics[0];
  const regels = [
    `GOOGLE ANALYTICS · ${site.label} (property ${site.propertyId}) · ${periode}${vergelijking}`,
    getoond === 0
      ? "Geen rijen voor deze vraag en periode."
      : `${getoond} van ${totaal} rijen, gesorteerd op ${sorteer} (${invoer.oplopend ? "oplopend" : "aflopend"}).`,
  ];
  if (response.metadata?.dataLossFromOtherRow) {
    regels.push("Let op: Google Analytics heeft een deel van de rijen samengevoegd als (other); de cijfers per rij zijn onvolledig.");
  }
  if (response.metadata?.subjectToThresholding) {
    regels.push("Let op: Google Analytics laat kleine aantallen weg (drempelwaarden); kleine rijen kunnen ontbreken.");
  }
  if (getoond > 0) regels.push("", ...tabel(response));
  if (totaal > getoond) regels.push("", `Er zijn meer rijen (${totaal}); vraag een hogere limiet of gebruik een filter.`);
  return regels.join("\n");
}

export function realtimeTekst(response: RunRealtimeReportResponse, site: GaSite): string {
  const getoond = response.rows?.length ?? 0;
  const regels = [`GOOGLE ANALYTICS REALTIME · ${site.label} · de afgelopen 30 minuten`];
  regels.push(getoond === 0 ? "Geen activiteit gevonden voor deze vraag." : "", ...(getoond > 0 ? tabel(response) : []));
  return regels.join("\n").trim();
}

const MAX_VELDEN = 60;

/** Zoekt in de velden van een property; zonder zoekterm alleen de eigen velden. */
export function veldenTekst(metadata: Metadata, site: GaSite, zoek?: string): string {
  const term = zoek?.trim().toLowerCase() ?? "";
  type Veld = { soort: "dimensie" | "metric"; apiName: string; uiName: string; description: string; custom: boolean };
  const velden: Veld[] = [
    ...(metadata.dimensions ?? []).map((d) => ({
      soort: "dimensie" as const,
      apiName: d.apiName ?? "",
      uiName: d.uiName ?? "",
      description: d.description ?? "",
      custom: Boolean(d.customDefinition),
    })),
    ...(metadata.metrics ?? []).map((m) => ({
      soort: "metric" as const,
      apiName: m.apiName ?? "",
      uiName: m.uiName ?? "",
      description: m.description ?? "",
      custom: Boolean(m.customDefinition),
    })),
  ];
  const gevonden = term
    ? velden.filter((v) => [v.apiName, v.uiName, v.description].some((t) => t.toLowerCase().includes(term)))
    : velden.filter((v) => v.custom);
  const kop = term
    ? `VELDEN VAN ${site.label} MET "${zoek}" (${gevonden.length})`
    : `EIGEN VELDEN VAN ${site.label} (${gevonden.length}). Geef een zoekterm voor de standaardvelden.`;
  const regels = gevonden
    .slice(0, MAX_VELDEN)
    .map((v) => `${v.soort} ${v.apiName}: ${v.uiName}${v.description ? `. ${v.description.slice(0, 160)}` : ""}`);
  if (gevonden.length > MAX_VELDEN) regels.push(`… en nog ${gevonden.length - MAX_VELDEN}. Zoek specifieker.`);
  return [kop, ...regels].join("\n");
}

/**
 * Weigert Google Analytics de toegang (gRPC-code 7)? Dan zegt de melding wat er
 * moet gebeuren: meestal mist het service-account de rol Lezer op de property.
 */
export function geenToegangTekst(err: unknown, site: GaSite, serviceAccount: string | null): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  const bericht = gaFoutTekst(err);
  if (code !== 7 && !/PERMISSION_DENIED/.test(err instanceof Error ? err.message : String(err))) return null;

  const kop = `Google Analytics geeft geen toegang tot ${site.label} (property ${site.propertyId}): ${bericht}`;
  if (/has not been used in project|is disabled|SERVICE_DISABLED/i.test(bericht)) {
    return `${kop}
Oplossing: zet de Google Analytics Data API aan in het Google Cloud-project van het service-account.`;
  }
  const account = serviceAccount ? `het service-account ${serviceAccount}` : "het service-account uit GA_SERVICE_ACCOUNT_JSON";
  const variabele = site.envVar ? ` Klopt het id niet, pas dan ${site.envVar} in Vercel aan.` : "";
  return `${kop}
Oplossing: geef ${account} de rol Lezer op property ${site.propertyId} in Google Analytics (Beheer > Toegangsbeheer voor property).${variabele}`;
}

/** De melding van de Data API zonder de gRPC-code ervoor, voor het model. */
export function gaFoutTekst(err: unknown): string {
  const bericht = err instanceof Error ? err.message : String(err);
  return bericht.replace(/^\d+\s+[A-Z_]+:\s*/, "").slice(0, 1_000);
}
