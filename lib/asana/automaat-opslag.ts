import { get, put } from "@vercel/blob";

/**
 * Wat de automaat per Asana-taak onthoudt, in Vercel Blob (privé), onder
 * `asana-mail/taken/<gid>.json`: welke versie van de brief hij het laatst
 * verwerkte en wat eruit kwam. Zo komt er per versie hooguit één reactie.
 */

export interface TaakStatus {
  gid: string;
  /** `briefHash` van de versie die het laatst is verwerkt. */
  hash: string;
  /** concept: in Maileon gezet; wachten: brief niet compleet; fout: Maileon weigerde. */
  status: "concept" | "wachten" | "fout";
  mailingId?: number;
  bijgewerkt: string;
}

export interface TaakStatusOpslag {
  get(gid: string): Promise<TaakStatus | null>;
  save(status: TaakStatus): Promise<void>;
}

const PREFIX = "asana-mail/taken/";
const GID = /^\d{1,30}$/;

export const blobTaakStatus: TaakStatusOpslag = {
  async get(gid) {
    if (!GID.test(gid)) return null;
    try {
      const result = await get(`${PREFIX}${gid}.json`, { access: "private", useCache: false });
      if (!result || !result.stream) return null;
      const record = JSON.parse(await new Response(result.stream).text()) as TaakStatus;
      return record && record.gid === gid ? record : null;
    } catch {
      return null;
    }
  },
  async save(status) {
    if (!GID.test(status.gid)) return;
    await put(`${PREFIX}${status.gid}.json`, JSON.stringify(status), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  },
};
