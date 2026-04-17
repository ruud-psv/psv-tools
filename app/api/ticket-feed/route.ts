import { NextResponse } from "next/server";

const FEED_URL = "https://ticketshop.psv.nl/feed/eventsavailability";

export const revalidate = 10;

export async function GET() {
  try {
    const res = await fetch(FEED_URL, {
      next: { revalidate: 10 },
      headers: {
        "User-Agent": "PSV-Tools/1.0",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Feed returned ${res.status}` },
        { status: 502 }
      );
    }

    const xml = await res.text();
    const events = parseXML(xml);

    return NextResponse.json({
      events,
      count: events.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Feed ophalen mislukt" },
      { status: 502 }
    );
  }
}

interface TicketEvent {
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

function isMatchEvent(name: string): boolean {
  const n = name.toLowerCase();
  // Main match, package, fietsenstalling, or PSV Direct
  if (
    n.startsWith("package ") ||
    n.startsWith("fietsenstalling") ||
    n.startsWith("psv direct")
  ) return true;
  // "Team - Opponent" or "Opponent - Team" with PSV/Jong PSV/PSV Vrouwen
  if (
    /^(psv|jong psv|psv vrouwen)\s*-\s*.+/.test(n) ||
    /^.+\s*-\s*(psv|jong psv|psv vrouwen)\b/.test(n)
  ) {
    // Exclude tours that have " - " in the name (e.g. bekerfinale description won't match these)
    if (n.includes("stadiontour") || n.includes("kampioenstour") || n.includes("legend tour") || n.includes("matchday tour")) return false;
    return true;
  }
  // Women's match patterns (e.g. "FC Twente Vrouwen - PSV Vrouwen")
  if (/vrouwen.*-.*psv|psv.*vrouwen.*-/.test(n)) return true;
  return false;
}

function getMatchSubCategory(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("jong psv")) return "Jong PSV";
  if (n.includes("psv vrouwen") || n.includes("vrouwen")) return "PSV Vrouwen";
  return "PSV";
}

function getMatchItemType(name: string): string {
  const n = name.toLowerCase();
  if (n.startsWith("package ")) return "package";
  if (n.startsWith("fietsenstalling")) return "fietsenstalling";
  if (n.startsWith("psv direct")) return "direct";
  return "match";
}

/** Extract a stable match group key from the event name (opponent only) */
function getMatchGroup(name: string, eventDate: string): string {
  const n = name.toLowerCase();
  let base = n
    .replace(/^package\s+/i, "")
    .replace(/^fietsenstalling\s*\|\s*/i, "")
    .replace(/^psv direct\s*\|\s*/i, "");
  base = base
    .replace(/\s*\d{2}[\/-]\d{2}[\/-]\d{4}\s*\d{2}:\d{2}\s*$/, "")
    .replace(/\s*\d{2}[\/-]\d{2}[\/-]\d{4}\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${base}|${eventDate}`;
}

function categorizeEvent(name: string): string {
  const n = name.toLowerCase();

  if (isMatchEvent(name)) return "Wedstrijden";

  // Tours
  if (
    n.includes("stadiontour") ||
    n.includes("kampioenstour") ||
    n.includes("legend tour") ||
    n.includes("matchday tour")
  ) {
    return "Tours";
  }

  // Museum
  if (n.includes("museum")) return "Museum";

  // Jeugd & Academy
  if (
    n.includes("minivoetbal") ||
    n.includes("vakantie clinic") ||
    n.includes("starclinic") ||
    n.includes("trainingsmodule") ||
    n.includes("individuele training") ||
    n.includes("talent day") ||
    n.includes("voetbalgames") ||
    n.includes("phoxy") ||
    n.includes("voetbaltraining")
  ) {
    return "Jeugd";
  }

  // Evenementen
  if (
    n.includes("kinderfeestje") ||
    n.includes("open training") ||
    n.includes("funpark") ||
    n.includes("awayday") ||
    n.includes("scholenchallenge") ||
    n.includes("welkom bij de club") ||
    n.includes("wedstrijdbezoek") ||
    n.includes("fanclub")
  ) {
    return "Evenementen";
  }

  // Abonnementen
  if (
    n.includes("mijn psv") ||
    n.includes("seizoen club card") ||
    n.includes("interesse seizoen")
  ) {
    return "Abonnementen";
  }

  return "Overig";
}

function extractEventName(nameAndDate: string): string {
  return nameAndDate
    .replace(/\s*\d{2}[\/-]\d{2}[\/-]\d{4}\s*\d{2}:\d{2}\s*$/, "")
    .replace(/\s*\d{2}[\/-]\d{2}[\/-]\d{4}\s*$/, "")
    .trim();
}

function getTextContent(element: Element, tagName: string): string {
  const el = element.getElementsByTagName(tagName)[0];
  return el?.textContent?.trim() ?? "";
}

function parseXML(xml: string): TicketEvent[] {
  // Server-side XML parsing using regex extraction (no DOM available in edge)
  const events: TicketEvent[] = [];
  const eventRegex = /<Event>([\s\S]*?)<\/Event>/g;
  let match;

  while ((match = eventRegex.exec(xml)) !== null) {
    const block = match[1];

    const get = (tag: string): string => {
      const r = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`);
      const m = block.match(r);
      return m ? m[1].trim() : "";
    };

    const nameAndDate = get("NameAndDate");
    const eventDate = get("ActualEventDate");
    const sold = parseInt(get("SoldTickets"), 10) || 0;
    const available = parseInt(get("AvailableCapacity"), 10) || 0;

    const category = categorizeEvent(nameAndDate);
    const isMatch = category === "Wedstrijden";

    events.push({
      nameAndDate,
      showId: get("ShowId"),
      eventId: get("EventId"),
      eventDate,
      saleStatus: get("SaleStatus"),
      soldTickets: sold,
      availableCapacity: available,
      totalCapacity: sold + available,
      startSaleFrom: get("StartSaleFrom"),
      endSaleAt: get("EndSaleAt"),
      lastUpdate: get("LastUpdate"),
      availableForDisplay: get("AvailableForDisplay") === "True",
      category,
      subCategory: isMatch ? getMatchSubCategory(nameAndDate) : "",
      matchGroup: isMatch ? getMatchGroup(nameAndDate, eventDate) : "",
      eventName: extractEventName(nameAndDate),
    });
  }

  return events;
}
