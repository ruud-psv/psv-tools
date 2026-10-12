import { findNeighbors, type NeighborResult } from "@/lib/aangrenzende-stoelen/neighbors";
import { CATCH_UP_SECONDS } from "@/lib/aangrenzende-stoelen/settings";
import { readHolderList, type HolderListMeta } from "@/lib/aangrenzende-stoelen/store";
import { isRingsideConfigured } from "@/lib/ringside/auth";
import { runLockedSeatIngest } from "@/lib/ringside/seat-ingest";
import { toNeighborInput } from "@/lib/ringside/seat-state";
import { readEventSeats, readSeatState } from "@/lib/ringside/seat-store";

/**
 * Maakt de lijst voor één wedstrijd: welke seizoenkaarthouders zitten naast een
 * vrije stoel. Gedeeld door "Maak lijst" en "Doorzetten naar Maileon", zodat
 * Maileon altijd dezelfde berekening krijgt als de CSV.
 *
 * Eerst worden de nieuwste mutaties uit Ringside opgehaald, zodat de lijst zo
 * actueel is als Ringside zelf (meestal minder dan een minuut). Loopt er op dat
 * moment al een run, dan rekenen we met de stand van die vorige run en zeggen
 * we dat erbij.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Een fout met de HTTP-status die de route moet teruggeven. */
export class ListError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export interface ListRequest {
  eventId: string;
  maxSeatsPerRelation: number | null;
}

/** Leest wedstrijd en grens uit de body van een verzoek. */
export function parseListRequest(body: { eventId?: unknown; maxSeatsPerRelation?: unknown }): ListRequest {
  const eventId = typeof body.eventId === "string" ? body.eventId.trim().toLowerCase() : "";
  if (!UUID.test(eventId)) throw new ListError("Kies een wedstrijd.", 400);
  const rawMax = Number(body.maxSeatsPerRelation);
  const maxSeatsPerRelation = Number.isInteger(rawMax) && rawMax > 0 ? rawMax : null;
  return { eventId, maxSeatsPerRelation };
}

export type CatchUp = "bijgewerkt" | "overgeslagen" | "mislukt";

export interface BuiltList {
  event: { eventId: string; name: string | null; eventDate: string | null };
  result: NeighborResult;
  listMeta: HolderListMeta;
  dataAsOf: string | null;
  catchUp: CatchUp;
}

export async function buildNeighborList({ eventId, maxSeatsPerRelation }: ListRequest): Promise<BuiltList> {
  const before = await readSeatState();
  if (!before.manifestsComplete || !before.salesComplete) {
    throw new ListError(
      "De stoelstatus wordt nog voor het eerst uit Ringside ingelezen. Probeer het later opnieuw.",
      409
    );
  }

  let catchUp: CatchUp = "overgeslagen";
  let dataAsOf = before.caughtUpAt;
  if (isRingsideConfigured()) {
    const outcome = await runLockedSeatIngest(CATCH_UP_SECONDS * 1000);
    if (outcome.ran) {
      catchUp = outcome.error ? "mislukt" : "bijgewerkt";
      dataAsOf = outcome.state.caughtUpAt;
    }
  }

  const [event, list] = await Promise.all([readEventSeats(eventId), readHolderList()]);
  if (!event) {
    throw new ListError("Voor deze wedstrijd is geen stoelstatus gevonden.", 404);
  }
  if (!list) {
    throw new ListError("Er staat nog geen lijst seizoenkaarthouders. Upload die eerst op deze pagina.", 409);
  }

  const { seats, tickets } = toNeighborInput(event);
  const result = findNeighbors(seats, tickets, list.holders, { maxSeatsPerRelation });

  return {
    event: { eventId: event.eventId, name: event.name, eventDate: event.eventDate },
    result,
    listMeta: list.meta,
    dataAsOf,
    catchUp,
  };
}
