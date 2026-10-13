import { randomBytes } from "crypto";
import { put, del, get, list } from "@vercel/blob";

/**
 * Vragen die de kennisbank niet (goed) kon beantwoorden, gemeld vanuit de
 * chat. Eén blob per melding (`kennisbank-meldingen/<id>.json`); het hele team
 * ziet ze op de documentatiepagina, zodat duidelijk is welke inhoud ontbreekt.
 */

const PREFIX = "kennisbank-meldingen/";
const ID_RE = /^[a-f0-9]{32}$/;
const MAX_VRAAG = 500;
const MAX_ANTWOORD = 2000;

export interface Melding {
  id: string;
  vraag: string;
  /** Het antwoord dat de assistent gaf, zodat je ziet wat er wél stond. */
  antwoord?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

export type MeldingInput = Pick<Melding, "vraag" | "antwoord">;

function pathFor(id: string): string {
  return `${PREFIX}${id}.json`;
}

export function nieuwMeldingId(): string {
  return randomBytes(16).toString("hex");
}

/** Leest de payload van de client; geeft null bij iets onbruikbaars. */
export function parseMeldingInput(body: unknown): MeldingInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const vraag = typeof b.vraag === "string" ? b.vraag.trim().slice(0, MAX_VRAAG) : "";
  if (!vraag) return null;
  const antwoord = typeof b.antwoord === "string" ? b.antwoord.trim().slice(0, MAX_ANTWOORD) : "";
  return { vraag, ...(antwoord && { antwoord }) };
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

export async function saveMelding(melding: Melding): Promise<void> {
  await put(pathFor(melding.id), JSON.stringify(melding), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function listMeldingen(): Promise<Melding[]> {
  const { blobs } = await list({ prefix: PREFIX });
  const ids = blobs
    .map((b) => b.pathname.slice(PREFIX.length).replace(/\.json$/, ""))
    .filter((id) => ID_RE.test(id));

  const results = await Promise.all(ids.map((id) => readJson<Melding>(pathFor(id))));
  return results
    .filter((m): m is Melding => m !== null && typeof m === "object" && ID_RE.test(m.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteMelding(id: string): Promise<boolean> {
  if (!ID_RE.test(id)) return false;
  await del(pathFor(id));
  return true;
}
