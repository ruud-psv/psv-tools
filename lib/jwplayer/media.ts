import type { JwApi, JwMedia } from "./client";
import { leesJsonGz, paden, schrijfJsonGz, type Opslag } from "./store";
import { parseTags, type GeparsdeTags } from "./taxonomie";

/**
 * Media-verrijking: titels, tags, publicatiedatum en duur uit de Management
 * API, per `media_id`. UI en MCP-tools tonen nooit kale id's.
 *
 * De hele lijst staat in Vercel Blob en wordt na zes uur ververst; een id dat
 * er (nog) niet in staat wordt los opgehaald en toegevoegd. Bestaat een video
 * niet meer, dan heet hij "Verwijderde video (<id>)".
 */

const VERS_MS = 6 * 60 * 60_000;
const MAX_LOS_OPHALEN = 25;

export interface Video extends JwMedia {
  taxonomie: GeparsdeTags;
}

interface Opgeslagen {
  at: number;
  media: JwMedia[];
}

const geheugen = new Map<string, Opgeslagen>();

export function verrijk(m: JwMedia): Video {
  return { ...m, taxonomie: parseTags(m.tags) };
}

export function onbekendeVideo(id: string): Video {
  return verrijk({ id, titel: `Verwijderde video (${id})`, tags: [], gepubliceerd: null, duur: null, status: null, customParams: {} });
}

export interface MediaIndex {
  alle(): Promise<Video[]>;
  /** Video's op id; onbekende id's worden los opgehaald (tot een grens) of als verwijderd getoond. */
  zoekOp(ids: string[]): Promise<Map<string, Video>>;
}

export function mediaIndex(api: JwApi, siteId: string, opslag: Opslag | null, nu: () => number = Date.now): MediaIndex {
  async function laad(): Promise<Opgeslagen> {
    const inGeheugen = geheugen.get(siteId);
    if (inGeheugen && nu() - inGeheugen.at < VERS_MS) return inGeheugen;
    if (opslag) {
      try {
        const opgeslagen = await leesJsonGz<Opgeslagen>(opslag, paden.media(siteId));
        if (opgeslagen && nu() - opgeslagen.at < VERS_MS) {
          geheugen.set(siteId, opgeslagen);
          return opgeslagen;
        }
      } catch (err) {
        console.warn(`[jwplayer] medialijst lezen mislukt: ${err instanceof Error ? err.message : err}`);
      }
    }
    const vers: Opgeslagen = { at: nu(), media: await api.listMedia(siteId) };
    geheugen.set(siteId, vers);
    if (opslag) await schrijfJsonGz(opslag, paden.media(siteId), vers).catch(() => undefined);
    return vers;
  }

  return {
    async alle() {
      return (await laad()).media.map(verrijk);
    },
    async zoekOp(ids) {
      const lijst = await laad();
      const perId = new Map(lijst.media.map((m) => [m.id, m]));
      const ontbrekend = [...new Set(ids)].filter((id) => !perId.has(id));
      const nieuw: JwMedia[] = [];
      for (const id of ontbrekend.slice(0, MAX_LOS_OPHALEN)) {
        const m = await api.getMedia(siteId, id).catch(() => null);
        if (m) {
          perId.set(id, m);
          nieuw.push(m);
        }
      }
      if (nieuw.length) {
        const bijgewerkt = { at: lijst.at, media: [...lijst.media, ...nieuw] };
        geheugen.set(siteId, bijgewerkt);
        if (opslag) await schrijfJsonGz(opslag, paden.media(siteId), bijgewerkt).catch(() => undefined);
      }
      return new Map(ids.map((id) => [id, perId.has(id) ? verrijk(perId.get(id)!) : onbekendeVideo(id)]));
    },
  };
}

/** Alleen voor tests. */
export function vergeetMedia(): void {
  geheugen.clear();
}

/** Kleine letters, zonder accenten en leestekens: om op titel te zoeken. */
export function plat(tekst: string): string {
  return tekst
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
