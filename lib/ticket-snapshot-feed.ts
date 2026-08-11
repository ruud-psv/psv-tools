/**
 * Selectie van feed-events waarvan we het verkoopverloop bijhouden.
 *
 * Bewust géén filter op categorie: de ticketfeed toont alle categorieën
 * (wedstrijden, tours, museum, jeugd, evenementen, abonnementen) en elk van die
 * events krijgt in de UI dezelfde "verkochte tickets per dag"-grafiek. Filteren
 * we hier op categorie, dan blijft die grafiek voor de rest van de feed
 * permanent leeg — precies wat er gebeurde bij o.a. Open training.
 *
 * Om het aantal blob-operaties toch beperkt te houden vallen alleen rijen weg
 * waar een meting nooit iets kan opleveren: niet-zichtbare rijen, rijen zonder
 * capaciteit en events die al voorbij zijn.
 */

/**
 * Tot hoe lang na de eventdatum we blijven meten. Eén dag extra, zodat de
 * verkoop van de eventdag zelf nog een delta oplevert; daarna verandert er
 * niets meer en zou een meting alleen blob-operaties kosten.
 */
const KEEP_MEASURING_AFTER_EVENT_MS = 24 * 60 * 60 * 1000;

export type SnapshotRow = {
  eventId: string;
  available: number;
  sold: number;
};

export interface SnapshotSelection {
  rows: SnapshotRow[];
  /** Aantal feed-rijen dat is overgeslagen — puur voor de responsestatistiek. */
  skipped: number;
}

interface Candidate {
  eventId: string;
  availableForDisplay: boolean;
  capacity: number;
  /** `ActualEventDate` uit de feed: lokale tijd zonder zone-suffix. */
  eventDate: string;
}

export function shouldSnapshot(event: Candidate, now: number): boolean {
  if (!event.eventId) return false;
  if (!event.availableForDisplay) return false;
  if (event.capacity <= 0) return false;

  const eventTime = event.eventDate ? new Date(event.eventDate).getTime() : NaN;
  // Onparseerbare datum: liever meten dan een event stil laten vallen.
  if (isNaN(eventTime)) return true;
  return eventTime >= now - KEEP_MEASURING_AFTER_EVENT_MS;
}

/**
 * Haalt de meetwaardige events uit de feed-XML. Zelfde regex-aanpak als
 * `/api/ticket-feed`: op de server is er geen DOM.
 */
export function selectSnapshotRows(xml: string, now: number): SnapshotSelection {
  const byEventId = new Map<string, SnapshotRow>();
  let skipped = 0;

  const eventRegex = /<Event>([\s\S]*?)<\/Event>/g;
  let match;
  while ((match = eventRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag: string) => {
      const r = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`);
      const m = block.match(r);
      return m ? m[1].trim() : "";
    };

    const eventId = get("EventId");
    const available = parseInt(get("AvailableCapacity"), 10) || 0;
    const sold = parseInt(get("SoldTickets"), 10) || 0;

    const relevant = shouldSnapshot(
      {
        eventId,
        availableForDisplay: get("AvailableForDisplay") === "True",
        capacity: sold + available,
        eventDate: get("ActualEventDate"),
      },
      now
    );

    if (!relevant) {
      skipped++;
      continue;
    }

    // Dubbele EventId's zouden naar hetzelfde blob-pad schrijven; de laatste
    // rij wint, zodat we één write per event doen.
    byEventId.set(eventId, { eventId, available, sold });
  }

  return { rows: [...byEventId.values()], skipped };
}
