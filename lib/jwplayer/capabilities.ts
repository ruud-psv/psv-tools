import { GEEN_CAPABILITIES, type JwCapabilities, type SiteCapabilities } from "../../config/jwplayer-capabilities";
import { probeSite, type Check, type Verzoeker } from "./probe";
import { paden, type Opslag } from "./store";
import type { JwSite } from "./sites";

/**
 * De capabilities lezen, en de probe draaien als ze er nog niet zijn of te oud
 * zijn. Plus de vragen die UI en MCP-tools stellen ("kan dit?"), met een
 * uitleg voor wat niet kan.
 */

/** Na zoveel dagen draait de probe opnieuw (de cron doet het ook elke maandag). */
const MAX_LEEFTIJD_MS = 8 * 24 * 60 * 60_000;
const GEHEUGEN_MS = 5 * 60_000;

let geheugen: { at: number; caps: JwCapabilities } | null = null;

export async function leesCapabilities(opslag: Opslag): Promise<JwCapabilities> {
  if (geheugen && Date.now() - geheugen.at < GEHEUGEN_MS) return geheugen.caps;
  const bytes = await opslag.lees(paden.capabilities);
  const caps = bytes ? ({ ...GEEN_CAPABILITIES, ...(JSON.parse(bytes.toString("utf8")) as Partial<JwCapabilities>) } as JwCapabilities) : GEEN_CAPABILITIES;
  geheugen = { at: Date.now(), caps };
  return caps;
}

export async function draaiProbe(
  sites: JwSite[],
  verzoek: Verzoeker,
  opslag: Opslag
): Promise<{ caps: JwCapabilities; checks: Record<string, Check[]> }> {
  const caps: JwCapabilities = { probedAt: new Date().toISOString(), sites: {} };
  const checks: Record<string, Check[]> = {};
  for (const site of sites) {
    const uitkomst = await probeSite(site, verzoek);
    caps.sites[site.id] = uitkomst.capabilities;
    checks[site.id] = uitkomst.checks;
  }
  await opslag.schrijf(paden.capabilities, JSON.stringify({ ...caps, checks }, null, 2), "application/json");
  geheugen = { at: Date.now(), caps };
  return { caps, checks };
}

/** De capabilities van deze property; draait de probe als ze ontbreken of te oud zijn. */
export async function capabilitiesVoor(site: JwSite, sites: JwSite[], verzoek: Verzoeker, opslag: Opslag): Promise<SiteCapabilities> {
  const caps = await leesCapabilities(opslag);
  const oud = !caps.probedAt || Date.now() - Date.parse(caps.probedAt) > MAX_LEEFTIJD_MS;
  // Een uitkomst zonder plays is van een mislukte probe (zoals met een verkeerde sleutel): opnieuw.
  const bruikbaar = caps.sites[site.id] && caps.sites[site.id].metrics.plays;
  if (bruikbaar && !oud) return caps.sites[site.id];
  return (await draaiProbe(sites, verzoek, opslag)).caps.sites[site.id];
}

/** Alleen voor tests. */
export function vergeetCapabilities(): void {
  geheugen = null;
}

/* ---------- Vragen ---------- */

export const ENTERPRISE = "vereist JW Enterprise";

export function heeftMetric(cap: SiteCapabilities | null | undefined, field: string): boolean {
  return Boolean(cap?.metrics[field]);
}

export function heeftDimensie(cap: SiteCapabilities | null | undefined, field: string): boolean {
  return Boolean(cap?.dimensions[field]);
}

/** De metric zoals de API hem wil (met de `operation` die werkte), of `null`. */
export function metric(cap: SiteCapabilities, field: string): { operation: string; field: string } | null {
  const operation = cap.metrics[field];
  return operation ? { operation, field } : null;
}

/** De metrics uit deze lijst die werken; de rest valt weg. */
export function metrics(cap: SiteCapabilities, fields: readonly string[]): { operation: string; field: string }[] {
  return fields.map((f) => metric(cap, f)).filter((m): m is { operation: string; field: string } => m !== null);
}

export type Onderdeel = "content" | "afhaakcurve" | "live" | "platform" | "device" | "land" | "uniekPeriode" | "media";

/** Kan dit onderdeel? Zo niet: een korte uitleg voor de plek waar het had gestaan. */
export function onderdeel(cap: SiteCapabilities | null | undefined, wat: Onderdeel): { ok: true } | { ok: false; uitleg: string } {
  if (!cap) return { ok: false, uitleg: "De mogelijkheden van de API zijn nog niet getest." };
  const nee = (uitleg: string) => ({ ok: false as const, uitleg });
  switch (wat) {
    case "content":
      return heeftDimensie(cap, "media_id") ? { ok: true } : nee(`Cijfers per video: ${ENTERPRISE}.`);
    case "afhaakcurve":
      return heeftMetric(cap, "25_percent_completes") && heeftMetric(cap, "50_percent_completes") && heeftMetric(cap, "75_percent_completes")
        ? { ok: true }
        : nee(`Afhaakcurve (25/50/75%): ${ENTERPRISE}.`);
    case "live":
      return !cap.live.filter || !heeftDimensie(cap, "media_id")
        ? nee(`Live-uitzendingen (filter op playback mode): ${ENTERPRISE}.`)
        : { ok: true };
    case "platform":
      return heeftDimensie(cap, "platform_id") ? { ok: true } : nee(`Platform (web, iOS, Android, tvOS): ${ENTERPRISE}.`);
    case "device":
      return heeftDimensie(cap, "device_id") ? { ok: true } : nee(`Device: ${ENTERPRISE}.`);
    case "land":
      return heeftDimensie(cap, "country_code") ? { ok: true } : nee(`Land: ${ENTERPRISE}.`);
    case "uniekPeriode":
      return cap.totalsWithoutDimension && heeftMetric(cap, "unique_viewers")
        ? { ok: true }
        : nee("Unieke kijkers over een periode: de API geeft geen totaal zonder dimensie.");
    case "media":
      return cap.management.available ? { ok: true } : nee("Titels en tags: de Management API is niet bereikbaar met deze sleutel.");
  }
}
