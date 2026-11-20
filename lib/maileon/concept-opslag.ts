import { randomBytes } from "node:crypto";
import { get, put } from "@vercel/blob";

import { mailId } from "@/lib/mail-builder/mails";

/**
 * Wat PSV Tools onthoudt van concepten die het in Maileon zette, in Vercel
 * Blob (privé):
 *
 * - `maileon-concepten/<sleutel>.json`: per mail (sleutel = hash van de DMID,
 *   of van de naam zonder DMID) het mailing-ID, de hash om aanpassingen in
 *   Maileon te herkennen, en het ID van het voorbeeld.
 * - `maileon-voorbeelden/<id>.json`: de HTML achter de deellink
 *   `/share/mail/<id>`. Het ID is willekeurig (128 bits) en blijft hetzelfde
 *   bij elke nieuwe versie, zodat een link in Asana blijft werken.
 */

const CONCEPTEN = "maileon-concepten/";
const VOORBEELDEN = "maileon-voorbeelden/";
const ID_RE = /^[a-f0-9]{32}$/;

/** Zo lang na de laatste versie werkt een voorbeeldlink. */
export const VOORBEELD_DAGEN = 60;

export interface ConceptRecord {
  sleutel: string;
  naam: string;
  dmid?: string;
  mailingId: number;
  /** Hash van de HTML zoals Maileon hem na het zetten teruggaf. */
  hash: string;
  voorbeeldId: string;
  aangemaakt: string;
  bijgewerkt: string;
  /** E-mailadres van wie het concept het laatst zette. */
  door: string;
}

export interface VoorbeeldRecord {
  id: string;
  html: string;
  /** `maileon`: het voorbeeld van Maileon zelf; `export`: opgebouwd uit de export. */
  bron: "maileon" | "export";
  mailingId: number;
  bijgewerkt: string;
}

export function conceptSleutel(dmid: string | undefined, naam: string): string {
  return mailId(dmid || naam);
}

export function nieuwVoorbeeldId(): string {
  return randomBytes(16).toString("hex");
}

export function isVoorbeeldId(id: string): boolean {
  return ID_RE.test(id);
}

export function voorbeeldVerlopen(record: Pick<VoorbeeldRecord, "bijgewerkt">, nu = Date.now()): boolean {
  const tijd = Date.parse(record.bijgewerkt);
  return !Number.isFinite(tijd) || nu - tijd > VOORBEELD_DAGEN * 24 * 60 * 60 * 1000;
}

async function leesJson<T>(pad: string): Promise<T | null> {
  try {
    const result = await get(pad, { access: "private", useCache: false });
    if (!result || !result.stream) return null;
    return JSON.parse(await new Response(result.stream).text()) as T;
  } catch {
    return null;
  }
}

async function schrijfJson(pad: string, data: unknown): Promise<void> {
  await put(pad, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function getConcept(sleutel: string): Promise<ConceptRecord | null> {
  if (!ID_RE.test(sleutel)) return null;
  const record = await leesJson<ConceptRecord>(`${CONCEPTEN}${sleutel}.json`);
  return record && record.sleutel === sleutel && Number.isInteger(record.mailingId) ? record : null;
}

export async function saveConcept(record: ConceptRecord): Promise<void> {
  await schrijfJson(`${CONCEPTEN}${record.sleutel}.json`, record);
}

export async function getVoorbeeld(id: string): Promise<VoorbeeldRecord | null> {
  if (!ID_RE.test(id)) return null;
  const record = await leesJson<VoorbeeldRecord>(`${VOORBEELDEN}${id}.json`);
  return record && record.id === id && typeof record.html === "string" ? record : null;
}

export async function saveVoorbeeld(record: VoorbeeldRecord): Promise<void> {
  await schrijfJson(`${VOORBEELDEN}${record.id}.json`, record);
}
