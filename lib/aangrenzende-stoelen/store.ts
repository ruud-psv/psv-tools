/**
 * Opslag van de lijst seizoenkaarthouders, en wie hem mag vervangen.
 *
 * De lijst koppelt relatienummers aan stoelen en staat daarom privé in Vercel
 * Blob. Iedereen met een login mag er een uitkomst uit laten berekenen.
 *
 * Vervangen mag in de testfase ook iedereen met een login. Later moet dat
 * alleen Digital Marketing worden; PSV Tools kent geen rollen, dus dat loopt
 * dan via een lijst e-mailadressen in `SEIZOENKAART_UPLOAD_EMAILS`. Zolang die
 * variabele leeg is, staat het open.
 */

import { get, put } from "@vercel/blob";
import type { Holder } from "./neighbors";
import type { HolderListSummary } from "./holders";

const LIST_PATH = "aangrenzende-stoelen/seizoenkaarthouders.json";

/** Alles over de lijst behalve de regels zelf: veilig om aan de interface te geven. */
export interface HolderListMeta {
  uploadedAt: string;
  uploadedBy: string;
  fileName: string;
  rowsRead: number;
  seats: number;
  relations: number;
  invalidRows: HolderListSummary["invalidRows"];
  duplicateSeats: HolderListSummary["duplicateSeats"];
  excludedAreaSeats: number;
}

interface StoredHolderList extends HolderListMeta {
  /** `[relatienummer, vak, rij, stoel]` — compact, want het zijn er ruim 20.000. */
  holders: [string, string, number, number][];
}

/** De e-mailadressen die de lijst mogen vervangen. */
export function uploadAllowlist(): string[] {
  return (process.env.SEIZOENKAART_UPLOAD_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function canUploadHolders(email: string): boolean {
  const allowlist = uploadAllowlist();
  return allowlist.length === 0 || allowlist.includes(email.trim().toLowerCase());
}

async function readStored(): Promise<StoredHolderList | null> {
  const result = await get(LIST_PATH, { access: "private", useCache: false });
  if (!result || !result.stream) return null;
  try {
    return JSON.parse(await new Response(result.stream).text()) as StoredHolderList;
  } catch {
    console.error("[aangrenzende-stoelen] lijst seizoenkaarthouders niet te lezen.");
    return null;
  }
}

function metaOf(stored: StoredHolderList): HolderListMeta {
  const { holders: _holders, ...meta } = stored;
  return meta;
}

export async function readHolderListMeta(): Promise<HolderListMeta | null> {
  const stored = await readStored();
  return stored ? metaOf(stored) : null;
}

export async function readHolderList(): Promise<{ meta: HolderListMeta; holders: Holder[] } | null> {
  const stored = await readStored();
  if (!stored) return null;
  return {
    meta: metaOf(stored),
    holders: stored.holders.map(([relationNumber, area, row, seat]) => ({ relationNumber, area, row, seat })),
  };
}

export async function writeHolderList(
  summary: HolderListSummary,
  uploadedBy: string,
  fileName: string
): Promise<HolderListMeta> {
  const stored: StoredHolderList = {
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    fileName,
    rowsRead: summary.rowsRead,
    seats: summary.holders.length,
    relations: summary.relations,
    invalidRows: summary.invalidRows,
    duplicateSeats: summary.duplicateSeats,
    excludedAreaSeats: summary.excludedAreaSeats,
    holders: summary.holders.map((holder) => [holder.relationNumber, holder.area, holder.row, holder.seat]),
  };
  await put(LIST_PATH, JSON.stringify(stored), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return metaOf(stored);
}
