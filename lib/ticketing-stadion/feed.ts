/**
 * De komende thuiswedstrijden van PSV 1 in de vorm van de oude XML-feed
 * (`/api/ticket-feed`). De rapportage-generator en de deellinks lezen die
 * vorm; zo merken ze niets van de overstap naar Ringside.
 *
 * Alleen wedstrijden van PSV 1 in het Philips Stadion: tours, museum en
 * andere events zitten niet meer in de feed.
 */

import { daysUntil, type StadionMatch } from "./summary";

/** Dezelfde velden als de oude feed. */
export interface FeedEvent {
  nameAndDate: string;
  showId: string;
  eventId: string;
  eventDate: string;
  saleStatus: string;
  soldTickets: number;
  availableCapacity: number;
  totalCapacity: number;
  startSaleFrom: string;
  endSaleAt: string;
  lastUpdate: string;
  availableForDisplay: boolean;
  category: string;
  subCategory: string;
  matchGroup: string;
  eventName: string;
}

/** `2026-11-08 14:30:00` → `2026-11-08T14:30:00`, zoals de oude feed hem gaf. */
function isoLocal(date: string | null): string {
  return (date ?? "").trim().replace(" ", "T");
}

export function toFeedEvents(matches: StadionMatch[], today: string, updatedAt: string): FeedEvent[] {
  return matches
    .filter((match) => (daysUntil(match.eventDate, today) ?? -1) >= 0)
    .sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? ""))
    .map((match) => {
      const name = match.name ?? "Onbekende wedstrijd";
      const eventDate = isoLocal(match.eventDate);
      return {
        nameAndDate: `${name} ${eventDate.slice(0, 10)}`.trim(),
        showId: match.eventId,
        eventId: match.eventId,
        eventDate,
        saleStatus: match.total.free > 0 ? "Open" : "Uitverkocht",
        soldTickets: match.total.sold,
        availableCapacity: match.total.free,
        totalCapacity: match.total.capacity,
        startSaleFrom: "",
        endSaleAt: eventDate,
        lastUpdate: updatedAt,
        availableForDisplay: true,
        category: "Wedstrijden",
        subCategory: "PSV",
        matchGroup: `${name.toLowerCase()}|${eventDate}`,
        eventName: name,
      };
    });
}
