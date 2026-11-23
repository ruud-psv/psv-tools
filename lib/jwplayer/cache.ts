import type { QueryCache, Rij } from "./client";
import { laatsteVolledigeDag, plusDagen } from "./periode";
import { leesJsonGz, paden, schrijfJsonGz, type Opslag } from "./store";

/**
 * Cache voor analytics-queries.
 *
 * - Loopt de query tot en met gisteren of vandaag (JW-datum), dan kan de data
 *   nog veranderen: JW verwerkt de cijfers met wat vertraging. Kort, alleen in
 *   het geheugen van de serverinstantie.
 * - Alleen afgesloten dagen (einddatum eergisteren of eerder): lang, in het
 *   geheugen én in Vercel Blob, zodat een volgende instantie de API niet
 *   opnieuw hoeft te bevragen.
 */

export const KORT_MS = 15 * 60_000;
export const LANG_MS = 30 * 24 * 60 * 60_000;
const MAX_IN_GEHEUGEN = 500;

export function ttlVoor(eindDatum: string, nu: Date = new Date()): { ms: number; duurzaam: boolean } {
  const afgesloten = eindDatum <= plusDagen(laatsteVolledigeDag(nu), -1);
  return afgesloten ? { ms: LANG_MS, duurzaam: true } : { ms: KORT_MS, duurzaam: false };
}

interface Item {
  at: number;
  rijen: Rij[];
}

const geheugen = new Map<string, Item>();

export function queryCache(opslag: Opslag | null, nu: () => Date = () => new Date()): QueryCache {
  return {
    async haal(sleutel, eindDatum, laad) {
      const moment = nu();
      const { ms, duurzaam } = ttlVoor(eindDatum, moment);
      const vers = (item: Item | null | undefined) => item && moment.getTime() - item.at < ms;

      const inGeheugen = geheugen.get(sleutel);
      if (vers(inGeheugen)) return inGeheugen!.rijen;

      if (duurzaam && opslag) {
        try {
          const opgeslagen = await leesJsonGz<Item>(opslag, paden.cache(sleutel));
          if (vers(opgeslagen)) {
            geheugen.set(sleutel, opgeslagen!);
            return opgeslagen!.rijen;
          }
        } catch (err) {
          console.warn(`[jwplayer] cache lezen mislukt: ${err instanceof Error ? err.message : err}`);
        }
      }

      const rijen = await laad();
      const item = { at: moment.getTime(), rijen };
      if (geheugen.size >= MAX_IN_GEHEUGEN) geheugen.delete(geheugen.keys().next().value as string);
      geheugen.set(sleutel, item);
      if (duurzaam && opslag) {
        await schrijfJsonGz(opslag, paden.cache(sleutel), item).catch((err) =>
          console.warn(`[jwplayer] cache schrijven mislukt: ${err instanceof Error ? err.message : err}`)
        );
      }
      return rijen;
    },
  };
}

/** Alleen voor tests. */
export function leegCache(): void {
  geheugen.clear();
}
