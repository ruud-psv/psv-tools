/**
 * Van een stoelenkaart uit de stoelstatus naar de stoelen van het stadion.
 * Puur, zodat het te testen is; welke stoelenkaart het wordt, bepaalt `load.ts`.
 */

import { toSeatNumber } from "../aangrenzende-stoelen/neighbors";
import { SEAT_EXCLUDED, SEAT_GA, seatCapacity, type EventSeatState } from "../ringside/seat-state";
import { replayArea, type LayoutSeat, type StadiumLayout } from "./replay";

/**
 * De stoelen van één stoelenkaart, zonder wat Ringside buiten de capaciteit
 * houdt. Een staanvak is één rij met de capaciteit van het hele vak.
 */
export function layoutFromSeatState(event: EventSeatState): StadiumLayout {
  const seats: LayoutSeat[] = [];
  const standing: Record<string, number> = {};
  for (const tuple of Object.values(event.seats)) {
    const [area, row, seat, flags] = tuple;
    const name = replayArea(area);
    if (!name || flags & SEAT_EXCLUDED) continue;
    if (flags & SEAT_GA) {
      standing[name] = (standing[name] ?? 0) + seatCapacity(tuple);
      continue;
    }
    const r = toSeatNumber(row);
    const s = toSeatNumber(seat);
    if (r !== null && s !== null) seats.push({ area: name, row: r, seat: s });
  }
  return { seats, standing, source: event.name };
}
