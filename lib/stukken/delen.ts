import type { DeelRecord } from "./store";

/**
 * De regels voor een deellink, puur zodat de deelpagina, de API en de tests
 * dezelfde gebruiken.
 *
 * - Standaard alleen voor ingelogde collega's.
 * - Openbaar (iedereen met de link) kan per stuk, maar alleen met een
 *   verloopdatum: een openbare link brengt bedrijfscijfers buiten PSV.
 */

export const MAX_DAGEN_GELDIG = 365;
export const STANDAARD_DAGEN_OPENBAAR = 30;

const DAG = /^\d{4}-\d{2}-\d{2}$/;

export type DeelToegang = "ok" | "verlopen" | "inloggen";

/** Mag deze bezoeker de link zien? `ingelogd`: een geldige sessie van PSV Tools. */
export function deelToegang(record: Pick<DeelRecord, "publiek" | "verlooptOp">, ingelogd: boolean, vandaag: string): DeelToegang {
  // De verloopdatum is de laatste dag waarop de link werkt.
  if (record.verlooptOp && record.verlooptOp < vandaag) return "verlopen";
  if (!record.publiek && !ingelogd) return "inloggen";
  return "ok";
}

function plusDagen(dag: string, dagen: number): string {
  const d = new Date(`${dag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dagen);
  return d.toISOString().slice(0, 10);
}

/** Controleert wat er uit het deelformulier komt. */
export function leesDeelInvoer(
  body: unknown,
  vandaag: string
): { publiek: boolean; verlooptOp?: string } | { fout: string } {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const publiek = raw.publiek === true;
  const verlooptOp = typeof raw.verlooptOp === "string" && raw.verlooptOp.trim() ? raw.verlooptOp.trim() : undefined;

  if (verlooptOp !== undefined) {
    if (!DAG.test(verlooptOp) || Number.isNaN(Date.parse(`${verlooptOp}T00:00:00Z`))) return { fout: "Kies een geldige verloopdatum." };
    if (verlooptOp < vandaag) return { fout: "De verloopdatum ligt in het verleden." };
    if (verlooptOp > plusDagen(vandaag, MAX_DAGEN_GELDIG)) return { fout: `Een link werkt hooguit ${MAX_DAGEN_GELDIG} dagen.` };
  }
  if (publiek && !verlooptOp) return { fout: "Een openbare link heeft een verloopdatum nodig." };
  return { publiek, ...(verlooptOp && { verlooptOp }) };
}

export function standaardVerloopdatum(vandaag: string): string {
  return plusDagen(vandaag, STANDAARD_DAGEN_OPENBAAR);
}
