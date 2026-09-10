import { NextResponse } from "next/server";
import { isFandeskRequestAuthorized } from "@/lib/fandesk-auth";
import { buildTaxonomy, shiftDayKey, amsterdamDayBounds, toAmsterdamParts } from "@/lib/fandesk";
import { readRange } from "@/lib/fandesk-store";

/**
 * De woordenlijst voor de n8n-workflow. Wanneer Freshdesk `cf_soort` leeg laat,
 * mag het model het ticket alsnog indelen — maar alleen in waarden die echt
 * bestaan. Dit endpoint levert die waarden, afgeleid uit wat er is binnengekomen,
 * zodat de lijst vanzelf meegroeit met Freshdesk en niemand hem hoeft bij te
 * werken.
 *
 * Beveiligd met dezelfde FANDESK_INGEST_SECRET als de ingest, dus n8n heeft geen
 * nieuwe credential nodig.
 */

export const dynamic = "force-dynamic";

/** Over hoeveel dagen terug de woordenlijst wordt opgebouwd. */
const WINDOW_DAYS = 180;

export async function GET(request: Request) {
  if (!isFandeskRequestAuthorized(request, "fandesk/taxonomy")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today =
      toAmsterdamParts(new Date().toISOString())?.dayKey ?? new Date().toISOString().slice(0, 10);
    const { fromInstant, toInstant } = amsterdamDayBounds(
      shiftDayKey(today, -(WINDOW_DAYS - 1)),
      today
    );

    const tickets = await readRange(fromInstant, toInstant);

    // Alleen wat Freshdesk zelf heeft ingevuld telt mee. Zou het model zijn
    // eigen invullingen terugzien in deze lijst, dan bevestigt het zijn eigen
    // gokken en groeit de taxonomie met waarden die Freshdesk nooit gebruikt.
    const fromFreshdesk = tickets.filter((ticket) => !ticket.inferred && ticket.soort);

    return NextResponse.json({
      soorten: buildTaxonomy(fromFreshdesk),
      basedOnTickets: fromFreshdesk.length,
      windowDays: WINDOW_DAYS,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ophalen mislukt";
    console.error("[fandesk/taxonomy] GET mislukt:", message);
    // Nog geen opslag betekent simpelweg nog geen woordenlijst. Een lege lijst
    // laat de workflow doordraaien; het model vult dan niets in, wat correct is.
    if (message.includes("BLOB_READ_WRITE_TOKEN")) {
      return NextResponse.json({
        soorten: [],
        basedOnTickets: 0,
        windowDays: WINDOW_DAYS,
        generatedAt: new Date().toISOString(),
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
