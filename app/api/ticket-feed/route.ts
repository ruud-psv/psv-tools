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
  eventName: string;
}

function categorizeEvent(name: string): string {
  const n = name.toLowerCase();

  // Wedstrijden: "PSV - Opponent" or "Opponent - PSV" patterns (but not Package/Fietsenstalling/Direct)
  if (
    /^(psv|jong psv|psv vrouwen)\s*-\s*.+\d{2}\/\d{2}\/\d{4}/.test(n) ||
    /^.+\s*-\s*(psv|jong psv|psv vrouwen)\s/.test(n)
  ) {
    if (
      !n.startsWith("package") &&
      !n.startsWith("fietsenstalling") &&
      !n.startsWith("psv direct") &&
      !n.startsWith("matchday tour")
    ) {
      return "Wedstrijden";
    }
  }

  // Wedstrijd-gerelateerd
  if (
    n.startsWith("package ") ||
    n.startsWith("fietsenstalling") ||
    n.startsWith("psv direct")
  ) {
    return "Wedstrijden";
  }

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
  // Remove date/time suffix like "15/04/2026 14:00" or just "15/04/2026"
  return nameAndDate
    .replace(/\s*\d{2}\/\d{2}\/\d{4}\s*\d{2}:\d{2}\s*$/, "")
    .replace(/\s*\d{2}\/\d{2}\/\d{4}\s*$/, "")
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
    const sold = parseInt(get("SoldTickets"), 10) || 0;
    const available = parseInt(get("AvailableCapacity"), 10) || 0;

    events.push({
      nameAndDate,
      showId: get("ShowId"),
      eventId: get("EventId"),
      eventDate: get("ActualEventDate"),
      saleStatus: get("SaleStatus"),
      soldTickets: sold,
      availableCapacity: available,
      totalCapacity: sold + available,
      startSaleFrom: get("StartSaleFrom"),
      endSaleAt: get("EndSaleAt"),
      lastUpdate: get("LastUpdate"),
      availableForDisplay: get("AvailableForDisplay") === "True",
      category: categorizeEvent(nameAndDate),
      eventName: extractEventName(nameAndDate),
    });
  }

  return events;
}
