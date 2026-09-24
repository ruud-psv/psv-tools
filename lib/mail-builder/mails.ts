import { createHash } from "crypto";
import { put, del, get, list } from "@vercel/blob";

/**
 * Overzicht van de mails die uit de Mail Builder zijn gedownload. Eén blob per
 * mail (`mail-builder-mails/<id>.json`), zelfde patroon als `lib/utm-links.ts`,
 * zodat twee mensen elkaar niet overschrijven.
 *
 * Het id is een hash van de DMID, of van de mailnaam als er geen DMID is.
 * Dezelfde mail nog eens downloaden werkt zo de bestaande rij bij in plaats van
 * er een tweede naast te zetten.
 */

const PREFIX = "mail-builder-mails/";
const ID_RE = /^[a-f0-9]{32}$/;
const MAX_FIELD = 300;

export interface MailRecord {
  id: string;
  /** Vrij tekstveld, bedoeld als identifier uit Maileon (bijv. DMID26-19542). */
  dmid?: string;
  naam: string;
  template: string;
  /** Preview-tekst die naast het onderwerp in de inbox staat. */
  previewTekst?: string;
  aantalBlokken: number;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  /** Gezet zodra dezelfde mail opnieuw wordt gedownload. */
  updatedAt?: string;
}

export type MailInput = Omit<
  MailRecord,
  "id" | "createdBy" | "createdByName" | "createdAt" | "updatedAt"
>;

function pathFor(id: string): string {
  return `${PREFIX}${id}.json`;
}

export function mailId(sleutel: string): string {
  return createHash("sha256").update(sleutel.trim().toLowerCase()).digest("hex").slice(0, 32);
}

function schoon(waarde: unknown): string {
  return typeof waarde === "string" ? waarde.trim().slice(0, MAX_FIELD) : "";
}

/** Leest de payload van de client; geeft null bij iets onbruikbaars. */
export function parseMailInput(body: unknown): MailInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const naam = schoon(b.naam);
  const template = schoon(b.template);
  if (!naam || !template) return null;
  const aantal = Number(b.aantalBlokken);
  return {
    naam,
    template,
    aantalBlokken: Number.isFinite(aantal) && aantal >= 0 ? Math.floor(aantal) : 0,
    ...(schoon(b.dmid) && { dmid: schoon(b.dmid) }),
    ...(schoon(b.previewTekst) && { previewTekst: schoon(b.previewTekst) }),
  };
}

async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeJson(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function saveMail(record: MailRecord): Promise<void> {
  await writeJson(pathFor(record.id), record);
}

export async function getMail(id: string): Promise<MailRecord | null> {
  if (!ID_RE.test(id)) return null;
  const parsed = await readJson<MailRecord>(pathFor(id));
  if (!parsed || typeof parsed !== "object" || parsed.id !== id) return null;
  return parsed;
}

export async function listMails(): Promise<MailRecord[]> {
  const { blobs } = await list({ prefix: PREFIX });
  const ids = blobs
    .map((b) => b.pathname.slice(PREFIX.length).replace(/\.json$/, ""))
    .filter((id) => ID_RE.test(id));

  const results = await Promise.all(ids.map((id) => getMail(id)));
  return results
    .filter((r): r is MailRecord => r !== null)
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
}

export async function deleteMail(id: string): Promise<boolean> {
  if (!ID_RE.test(id)) return false;
  await del(pathFor(id));
  return true;
}
