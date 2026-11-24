/**
 * De recette van een thuiswedstrijd: hoe staan we ervoor ten opzichte van het
 * target, en wat betekent dat voor de vrije verkoop en de resale. Puur
 * rekenwerk, zodat het te testen is.
 *
 * Alle bedragen in centen, inclusief btw (zoals de prijzen in Ringside en het
 * target).
 *
 * - **Recette** = opbrengst vrije verkoop + opbrengst resale.
 * - **Status** = target − recette. Positief is nog te gaan.
 * - **Potentie vrije verkoop** = wat de vrije verkoop oplevert als alles
 *   verkocht wordt: de opbrengst tot nu toe plus elke plaats die nog vrij is
 *   tegen de prijs van zijn vak. Dat is "aangeboden × gemiddelde prijs", maar
 *   per vak, zodat een dure plaats die nog vrij is niet tegen het gemiddelde
 *   telt.
 * - **xOVV** (verwachte opbrengst vrije verkoop) = afnamepercentage × potentie.
 * - **Minimum resale-target** = target − potentie.
 * - **Verwacht resale-target** = target − xOVV.
 * - **Tekort resale** = verwacht resale-target − opbrengst resale.
 *
 * De resaleprijs is altijd gelijk aan de prijs van het vak in de vrije verkoop
 * (bevestigd door Ticketing, november 2026). Zo krijgt ook het aanbod in de
 * resale een waarde.
 */

import { normalizeArea } from "../aangrenzende-stoelen/neighbors";
import type { AreaOccupancy } from "../ticketing-herdgang/occupancy";
import { totalOf, type EventSales } from "../ringside/sales-series";

/** Target per wedstrijd: €246.852,94 inclusief 9% btw. */
export const DEFAULT_TARGET_CENTS = 24_685_294;
/** Afnamepercentage van de vrije verkoop voor xOVV, tot het historisch bekend is. */
export const DEFAULT_UPTAKE = 0.84;

/** Vakken waarvan de vrije plaatsen niet bij de vrije verkoop van PSV horen. */
const NOT_FREE_SALE = new Set(["BEZOEKERS"]);

export interface RecetteSettings {
  targetCents: number;
  /** Tussen 0 en 1. */
  uptake: number;
  /** Komt het target van deze wedstrijd zelf (`true`) of is het de standaard? */
  customTarget: boolean;
}

export interface Recette {
  targetCents: number;
  uptake: number;
  customTarget: boolean;

  recetteCents: number;
  /** Target − recette; negatief als het target gehaald is. */
  statusCents: number;

  free: {
    sold: number;
    revenueCents: number;
    /** `null` zonder verkochte tickets. */
    averageCents: number | null;
    /** Nu nog vrij te koop. */
    available: number;
    /** Verkocht + nog vrij. */
    offered: number;
    /** Verkocht ÷ aangeboden; `null` zonder aanbod. */
    soldShare: number | null;
    potentialCents: number;
    expectedCents: number;
    /** Opbrengst ÷ xOVV; `null` als xOVV 0 is. */
    progressShare: number | null;
    /** Vrije plaatsen in een vak zonder bekende prijs; die tellen tegen het gemiddelde. */
    unpricedSeats: number;
  };

  resale: {
    sold: number;
    revenueCents: number;
    averageCents: number | null;
    /** Nu aangeboden door houders. */
    offered: number;
    offeredValueCents: number;
    offeredAverageCents: number | null;
    /** Verkocht ÷ (verkocht + nu aangeboden); `null` als beide 0 zijn. */
    soldShare: number | null;
    minimumTargetCents: number;
    expectedTargetCents: number;
    /** Verwacht resale-target − opbrengst resale; negatief is voor op schema. */
    shortfallCents: number;
  };
}

/**
 * Een getal zoals iemand het intypt: `246.852,94`, `246852,94` of `246852.94`.
 * Met een komma is die het decimaalteken en zijn punten duizendtallen. Zonder
 * komma zijn punten met steeds drie cijfers erachter duizendtallen (`250.000`),
 * en anders is een punt het decimaalteken (`246852.94`). `null` als het geen
 * getal is.
 */
export function parseDecimalInput(value: string): number | null {
  const trimmed = value.replace(/[€\s]/g, "");
  if (!/^\d[\d.,]*$/.test(trimmed)) return null;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(trimmed)
      ? trimmed.replace(/\./g, "")
      : trimmed;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

/** Een bedrag in centen voor in een invoerveld: `246852,94`. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/**
 * Rekent de recette uit. `null` als de verkoop per dag nog geen bedragen heeft
 * (de doorloop die ze vult, is nog bezig).
 */
export function computeRecette(
  sales: Pick<EventSales, "series" | "revenueCents" | "areaPriceCents"> | null | undefined,
  areas: readonly Pick<AreaOccupancy, "area" | "free" | "resale">[],
  settings: RecetteSettings
): Recette | null {
  if (!sales?.revenueCents) return null;

  const freeSold = totalOf(sales.series.vrij);
  const freeRevenue = totalOf(sales.revenueCents.vrij);
  const freeAverage = freeSold > 0 ? freeRevenue / freeSold : null;
  const resaleSold = totalOf(sales.series.resale);
  const resaleRevenue = totalOf(sales.revenueCents.resale);
  const resaleAverage = resaleSold > 0 ? resaleRevenue / resaleSold : null;

  const prices = sales.areaPriceCents ?? {};
  const priceOf = (area: string): number | null => prices[normalizeArea(area)] ?? null;

  let available = 0;
  let availableValue = 0;
  let unpricedSeats = 0;
  let resaleOffered = 0;
  let resaleOfferedValue = 0;
  let resaleUnpriced = 0;
  for (const row of areas) {
    if (NOT_FREE_SALE.has(normalizeArea(row.area))) continue;
    const price = priceOf(row.area);
    if (row.free > 0) {
      available += row.free;
      if (price !== null) availableValue += row.free * price;
      else unpricedSeats += row.free;
    }
    if (row.resale > 0) {
      resaleOffered += row.resale;
      if (price !== null) resaleOfferedValue += row.resale * price;
      else resaleUnpriced += row.resale;
    }
  }
  // Zonder vakprijs het gemiddelde van wat er verkocht is.
  availableValue += unpricedSeats * (freeAverage ?? 0);
  resaleOfferedValue += resaleUnpriced * (resaleAverage ?? freeAverage ?? 0);

  const potential = Math.round(freeRevenue + availableValue);
  const expected = Math.round(settings.uptake * potential);
  const recette = freeRevenue + resaleRevenue;
  const offered = freeSold + available;
  const expectedTarget = settings.targetCents - expected;

  return {
    targetCents: settings.targetCents,
    uptake: settings.uptake,
    customTarget: settings.customTarget,
    recetteCents: recette,
    statusCents: settings.targetCents - recette,
    free: {
      sold: freeSold,
      revenueCents: freeRevenue,
      averageCents: freeAverage === null ? null : Math.round(freeAverage),
      available,
      offered,
      soldShare: ratio(freeSold, offered),
      potentialCents: potential,
      expectedCents: expected,
      progressShare: ratio(freeRevenue, expected),
      unpricedSeats,
    },
    resale: {
      sold: resaleSold,
      revenueCents: resaleRevenue,
      averageCents: resaleAverage === null ? null : Math.round(resaleAverage),
      offered: resaleOffered,
      offeredValueCents: Math.round(resaleOfferedValue),
      offeredAverageCents: resaleOffered > 0 ? Math.round(resaleOfferedValue / resaleOffered) : null,
      soldShare: ratio(resaleSold, resaleSold + resaleOffered),
      minimumTargetCents: settings.targetCents - potential,
      expectedTargetCents: expectedTarget,
      shortfallCents: expectedTarget - resaleRevenue,
    },
  };
}
