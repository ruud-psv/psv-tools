/**
 * Opslag van het SSO-bronbestand op Vercel Blob.
 *
 *   database/source/versions.json           alle uploads + welke actief is
 *   database/source/<versionId>/part-N.bin  de gesorteerde index, in shards
 *
 * De index gaat in shards omhoog omdat een serverless function maximaal ~4,5 MB
 * request body aanneemt en een index van een miljoen records 8 MB is. De
 * browser sorteert vóór het opsplitsen, dus de shards achter elkaar plakken
 * herstelt de volledige sortering — er is geen samenvoegstap nodig.
 *
 * Dit bestand is de naad voor de latere API-koppeling: gaan de records straks
 * via een API binnen in plaats van via een upload, dan hoeft alleen het vullen
 * te veranderen. `readSourceIndex()` en de analyse blijven zoals ze zijn.
 */

import { del, list } from "@vercel/blob";
import {
  readBlobBytes,
  readBlobJson,
  writeBlobBytes,
  writeBlobJson,
} from "@/lib/database/blob";
import {
  MAX_PART_BYTES,
  concatBytes,
  fromBytes,
  type PackedIndex,
} from "@/lib/database/index-format";
import { isValidVersionId, newVersionId } from "@/lib/database/ids";
import type { SourceState, SourceVersion } from "@/lib/database/types";

const STATE_PATH = "database/source/versions.json";

export { MAX_PART_BYTES, isValidVersionId, newVersionId };

function partPath(versionId: string, part: number): string {
  return `database/source/${versionId}/part-${String(part).padStart(3, "0")}.bin`;
}

/* ---------- Status ---------- */

export async function getSourceState(): Promise<SourceState> {
  const parsed = await readBlobJson<Partial<SourceState>>(STATE_PATH);
  if (!parsed) return { activeVersionId: null, versions: [] };
  return {
    activeVersionId:
      typeof parsed.activeVersionId === "string" ? parsed.activeVersionId : null,
    versions: Array.isArray(parsed.versions) ? parsed.versions : [],
  };
}

async function writeSourceState(state: SourceState): Promise<void> {
  await writeBlobJson(STATE_PATH, state);
}

/** De versie waartegen campagnes worden geteld, of null als er nog geen bron is. */
export async function getActiveVersion(): Promise<SourceVersion | null> {
  const state = await getSourceState();
  if (!state.activeVersionId) return null;
  return state.versions.find((v) => v.id === state.activeVersionId) ?? null;
}

/* ---------- Schrijven ---------- */

/** Eén shard van de index wegschrijven. Nog niet zichtbaar: pas `commit` telt. */
export async function putSourcePart(
  versionId: string,
  part: number,
  bytes: ArrayBuffer
): Promise<void> {
  await writeBlobBytes(partPath(versionId, part), bytes);
}

/**
 * Maakt de geüploade shards de actieve bron. Controleert eerst of alle shards
 * er zijn: bij een afgebroken upload zou je anders een halve database als
 * waarheid activeren en overal te veel "nieuw" tellen.
 */
export async function commitSourceVersion(
  version: SourceVersion
): Promise<SourceState> {
  const { blobs } = await list({ prefix: `database/source/${version.id}/` });
  if (blobs.length !== version.parts) {
    throw new Error(
      `Upload onvolledig: ${blobs.length} van ${version.parts} delen ontvangen. Probeer het opnieuw.`
    );
  }

  const state = await getSourceState();
  const next: SourceState = {
    activeVersionId: version.id,
    versions: [version, ...state.versions.filter((v) => v.id !== version.id)].sort(
      (a, b) => b.uploadedAt.localeCompare(a.uploadedAt)
    ),
  };
  await writeSourceState(next);
  indexCache = null;
  return next;
}

/**
 * Verwijdert een versie met zijn index. De actieve versie kan niet weg: zonder
 * bron is er niets om campagnes tegen te tellen.
 */
export async function deleteSourceVersion(versionId: string): Promise<void> {
  if (!isValidVersionId(versionId)) throw new Error("Onbekende versie.");
  const state = await getSourceState();
  if (state.activeVersionId === versionId) {
    throw new Error("De actieve bron kan niet worden verwijderd. Upload eerst een nieuwe.");
  }

  const { blobs } = await list({ prefix: `database/source/${versionId}/` });
  if (blobs.length) await del(blobs.map((b) => b.pathname));

  await writeSourceState({
    ...state,
    versions: state.versions.filter((v) => v.id !== versionId),
  });
  if (indexCache?.versionId === versionId) indexCache = null;
}

/** Ruimt shards op van een upload die nooit is afgerond. */
export async function discardSourceParts(versionId: string): Promise<void> {
  if (!isValidVersionId(versionId)) return;
  const { blobs } = await list({ prefix: `database/source/${versionId}/` });
  if (blobs.length) await del(blobs.map((b) => b.pathname));
}

/* ---------- Lezen ---------- */

/**
 * Eén index in het geheugen van de function. Een warme invocatie die vijf
 * campagnes opnieuw telt haalt de 8 MB dan één keer op in plaats van vijf keer.
 */
let indexCache: { versionId: string; index: PackedIndex } | null = null;

export async function readSourceIndex(
  versionId: string
): Promise<PackedIndex | null> {
  if (!isValidVersionId(versionId)) return null;
  if (indexCache?.versionId === versionId) return indexCache.index;

  const { blobs } = await list({ prefix: `database/source/${versionId}/` });
  if (!blobs.length) return null;

  // Lexicografisch oplopend is hier ook numeriek oplopend: `part-000`, `part-001`.
  const ordered = [...blobs].sort((a, b) => a.pathname.localeCompare(b.pathname));
  const parts: Uint8Array[] = [];
  for (const blob of ordered) {
    const bytes = await readBlobBytes(blob.pathname);
    // Een shard die de lijst noemt maar niet te lezen is maakt de index
    // onbetrouwbaar; dan liever niets teruggeven dan een gat erin.
    if (!bytes) return null;
    parts.push(bytes);
  }

  const index = fromBytes(concatBytes(parts));
  indexCache = { versionId, index };
  return index;
}
