/**
 * Rekent het effect van een mail uit voor de pagina: leest de ingelezen
 * ticketregels van de wedstrijd, de lijst seizoenkaarthouders en een
 * stoelenkaart, en geeft ze aan `analyzeMailEffect()`.
 *
 * De stoelenkaart zegt welke stoelen er zijn en welke geblokkeerd. De
 * stoelstatus bewaart alleen komende wedstrijden; voor een gespeelde wedstrijd
 * nemen we daarom de stoelenkaart van de eerstvolgende thuiswedstrijd, net als
 * de instroom. Het stadion is hetzelfde; welke stoelen geblokkeerd zijn kan per
 * wedstrijd iets verschillen.
 */

import { isPsvHomeMatch } from "./events";
import { analyzeMailEffect, toEffectCsv, type EffectResult } from "./effect";
import { parseAmsterdamDateTime, parseRelationNumbers } from "./effect-input";
import { readEffectData, readEffectState } from "./effect-store";
import type { SeatInfo } from "./neighbors";
import { readHolderList } from "./store";
import { toNeighborInput, todayInAmsterdam } from "../ringside/seat-state";
import { readEventSeats, readSeatIndex } from "../ringside/seat-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Ruim boven een gewone mailing, maar een grens tegen een verkeerd geplakt bestand. */
export const MAX_RELATIONS = 20_000;

/** Een fout met de HTTP-status die de route moet teruggeven. */
export class EffectError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export interface EffectRequest {
  productId: string;
  /** Zoals ingevuld: `2026-11-03T20:00`, Nederlandse tijd. */
  mailMoment: string;
  mailAt: number;
  relationNumbers: string[];
}

export function parseEffectRequest(body: {
  productId?: unknown;
  mailMoment?: unknown;
  relationNumbers?: unknown;
}): EffectRequest {
  const productId = typeof body.productId === "string" ? body.productId.trim().toLowerCase() : "";
  if (!UUID.test(productId)) throw new EffectError("Kies een wedstrijd.", 400);

  const mailMoment = typeof body.mailMoment === "string" ? body.mailMoment.trim() : "";
  const mailAt = parseAmsterdamDateTime(mailMoment);
  if (mailAt === null) throw new EffectError("Vul het moment van de mail in, met datum en tijd.", 400);

  const relationNumbers = parseRelationNumbers(typeof body.relationNumbers === "string" ? body.relationNumbers : "");
  if (relationNumbers.length === 0) throw new EffectError("Plak de relatienummers die de mail kregen.", 400);
  if (relationNumbers.length > MAX_RELATIONS) {
    throw new EffectError(`Dat zijn meer dan ${MAX_RELATIONS.toLocaleString("nl-NL")} relatienummers.`, 400);
  }
  return { productId, mailMoment, mailAt, relationNumbers };
}

export interface SeatMapSource {
  name: string | null;
  eventDate: string | null;
  /** `true` als het de stoelenkaart van deze wedstrijd zelf is. */
  own: boolean;
}

/** De stoelenkaart van deze wedstrijd, of anders die van een komende thuiswedstrijd. */
async function loadSeatMap(productId: string): Promise<{ seats: SeatInfo[]; source: SeatMapSource | null }> {
  const index = await readSeatIndex();
  const today = todayInAmsterdam();
  const own = index[productId];
  const upcoming = Object.values(index)
    .filter((entry) => isPsvHomeMatch(entry.name) && entry.seats > 0 && (entry.eventDate ?? "").slice(0, 10) >= today)
    .sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? ""));

  for (const entry of own ? [own, ...upcoming.slice(0, 3)] : upcoming.slice(0, 3)) {
    const event = await readEventSeats(entry.eventId);
    if (!event || Object.keys(event.seats).length === 0) continue;
    return {
      seats: toNeighborInput(event).seats,
      source: { name: event.name, eventDate: event.eventDate, own: entry.eventId === productId },
    };
  }
  return { seats: [], source: null };
}

export interface BuiltEffect {
  match: { productId: string; name: string; eventDate: string };
  mailMoment: string;
  result: EffectResult;
  csv: string;
  seatMap: SeatMapSource | null;
  /** Tot wanneer de verkoop van deze wedstrijd is ingelezen. */
  caughtUpAt: string;
  listUploadedAt: string;
}

export async function buildMailEffect({ productId, mailMoment, mailAt, relationNumbers }: EffectRequest): Promise<BuiltEffect> {
  const state = await readEffectState();
  const ready = state.ready[productId];
  if (!ready) {
    throw new EffectError("De verkoop van deze wedstrijd is nog niet helemaal ingelezen. Lees hem eerst in.", 409);
  }

  const [data, list, seatMap] = await Promise.all([readEffectData(productId), readHolderList(), loadSeatMap(productId)]);
  if (!data) throw new EffectError("De ingelezen verkoop van deze wedstrijd is niet gevonden. Lees hem opnieuw in.", 409);
  if (!list) {
    throw new EffectError("Er staat geen lijst seizoenkaarthouders. Upload die eerst op deze pagina.", 409);
  }

  const result = analyzeMailEffect({
    tickets: Object.values(data.tickets),
    seats: seatMap.seats,
    holders: list.holders,
    relationNumbers,
    mailAt,
  });

  return {
    match: { productId, name: ready.name, eventDate: ready.eventDate },
    mailMoment,
    result,
    csv: toEffectCsv(result.relations),
    seatMap: seatMap.source,
    caughtUpAt: ready.caughtUpAt,
    listUploadedAt: list.meta.uploadedAt,
  };
}
