import { get, put } from "@vercel/blob";

/**
 * De CPA-doelen per exploitatie ("target vooraf vastleggen"), als één
 * JSON-bestand in Vercel Blob. Een handvol exploitaties en zelden een
 * wijziging, dus één bestand is genoeg.
 */
const PATH = "paid-ads/doelen.json";

export interface PaidAdsDoelen {
  /** CPA-doel in euro's per exploitatie, op de naam zoals het dashboard die toont. */
  cpa: Record<string, number>;
}

/** Een geldig doel: een positief bedrag, afgerond op centen. */
export function geldigDoel(waarde: unknown): number | null {
  const n = typeof waarde === "number" ? waarde : Number(waarde);
  if (!Number.isFinite(n) || n <= 0 || n > 100_000) return null;
  return Math.round(n * 100) / 100;
}

export async function leesDoelen(): Promise<PaidAdsDoelen> {
  try {
    const result = await get(PATH, { access: "private", useCache: false });
    if (!result?.stream) return { cpa: {} };
    const ruw = JSON.parse(await new Response(result.stream).text()) as Partial<PaidAdsDoelen>;
    const cpa: Record<string, number> = {};
    for (const [unit, waarde] of Object.entries(ruw.cpa ?? {})) {
      const doel = geldigDoel(waarde);
      if (doel != null) cpa[unit] = doel;
    }
    return { cpa };
  } catch (err) {
    // Zonder doelen werkt het dashboard gewoon, alleen zonder doelkolom.
    console.error("[paid-ads] doelen lezen mislukt:", err instanceof Error ? err.message : err);
    return { cpa: {} };
  }
}

/** Zet het CPA-doel van één exploitatie, of haalt het weg met `null`. */
export async function zetCpaDoel(unit: string, doel: number | null): Promise<PaidAdsDoelen> {
  const huidig = await leesDoelen();
  const cpa = { ...huidig.cpa };
  if (doel == null) delete cpa[unit];
  else cpa[unit] = doel;
  const doelen = { cpa };
  await put(PATH, JSON.stringify(doelen, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return doelen;
}
