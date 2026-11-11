/**
 * Geeft Bunny dezelfde versie als PSV Tools? De demo en de livepagina laden
 * de bundel van Bunny, dus wat Bunny teruggeeft is wat bezoekers zien. Elke
 * bundel draagt zijn eigen publicatietijd (`window.__psvkBundel`); die
 * vergelijken we met de laatste publicatie in PSV Tools.
 *
 * Of het vaste stukje code echt in Playable staat, kunnen we niet zien: de
 * API van Playable kan niet in een `html-element` kijken.
 */

export type BundleStatusCode =
  /** Bunny geeft de laatste publicatie. */
  | "gelijk"
  /** Bunny geeft een oudere versie: de cache is niet geleegd. */
  | "ouder"
  /** Bunny geeft een andere versie dan PSV Tools kent. */
  | "anders"
  /** Er staat niets op Bunny voor deze campagne. */
  | "leeg"
  /** Bunny was niet bereikbaar of het bestand was niet te lezen. */
  | "fout";

export interface BundleStatus {
  status: BundleStatusCode;
  /** De publicatietijd in het bestand op Bunny. */
  bunnyPublishedAt: string | null;
  detail?: string;
}

/** Leest campagne en publicatietijd uit een bundel. */
export function readBundleVersion(bundle: string): { campaignId: number; publishedAt: string } | null {
  const m = /__psvkBundel = \{ campagne: (\d+), gepubliceerd: "([^"]+)" \}/.exec(bundle);
  return m ? { campaignId: Number(m[1]), publishedAt: m[2] } : null;
}

export function compareVersions(bunny: string | null, tools: string | null): BundleStatusCode {
  if (!bunny) return "leeg";
  if (!tools) return "anders";
  if (bunny === tools) return "gelijk";
  return Date.parse(bunny) < Date.parse(tools) ? "ouder" : "anders";
}

/**
 * Haalt de bundel op zoals de loader dat doet (met `?v=` van deze minuut) en
 * vergelijkt hem met de laatste publicatie in PSV Tools.
 */
export async function checkBundle(bundleUrl: string, toolsPublishedAt: string | null): Promise<BundleStatus> {
  try {
    const res = await fetch(`${bundleUrl}?v=${Math.floor(Date.now() / 60000)}`, { cache: "no-store" });
    if (res.status === 404) return { status: "leeg", bunnyPublishedAt: null };
    if (!res.ok) return { status: "fout", bunnyPublishedAt: null, detail: `Bunny antwoordde met ${res.status}.` };
    const versie = readBundleVersion(await res.text());
    if (!versie) return { status: "fout", bunnyPublishedAt: null, detail: "Het bestand op Bunny is geen bundel van PSV Tools." };
    return { status: compareVersions(versie.publishedAt, toolsPublishedAt), bunnyPublishedAt: versie.publishedAt };
  } catch (err) {
    return { status: "fout", bunnyPublishedAt: null, detail: err instanceof Error ? err.message : String(err) };
  }
}
