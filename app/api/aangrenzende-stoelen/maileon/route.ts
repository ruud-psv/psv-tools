import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { buildNeighborList, ListError, parseListRequest } from "@/lib/aangrenzende-stoelen/build-list";
import {
  contactFilterUrl,
  createContactFilter,
  createTargetGroup,
  getTargetGroup,
  isMaileonConfigured,
  maileonName,
  refreshContactFilter,
  validateNameInput,
} from "@/lib/aangrenzende-stoelen/maileon";

/**
 * Doorzetten naar Maileon.
 *
 * POST rekent de lijst opnieuw uit (zelfde berekening als "Maak lijst") en
 * maakt er een contactfilter met doelgroep van. De relatienummers komen dus
 * nooit uit de browser. GET geeft de stand van de doelgroep: Maileon rekent
 * het filter op de achtergrond door, de pagina vraagt dit op tot het klaar is.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  if (!isMaileonConfigured()) {
    return NextResponse.json({ error: "Maileon is niet gekoppeld (MAILEON_API_KEY ontbreekt)." }, { status: 503 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      eventId?: unknown;
      maxSeatsPerRelation?: unknown;
      sendDate?: unknown;
      dmid?: unknown;
    };
    const request = parseListRequest(body);
    const invalid = validateNameInput(body.sendDate, body.dmid);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const { event, result, dataAsOf, catchUp } = await buildNeighborList(request);
    if (!event.name) {
      return NextResponse.json({ error: "Deze wedstrijd heeft geen naam in Ringside." }, { status: 409 });
    }
    const relationNumbers = result.rows.map((row) => row.relationNumber);
    if (relationNumbers.length === 0) {
      return NextResponse.json({ error: "Er staat niemand op de lijst; er is niets doorgezet." }, { status: 409 });
    }

    const name = maileonName({ sendDate: body.sendDate as string, eventName: event.name, dmid: body.dmid as string });
    const contactFilterId = await createContactFilter(name, relationNumbers);

    // Lukt de doelgroep niet, dan blijft het filter staan: daar kan iemand in
    // Maileon zelf een doelgroep op maken.
    let targetGroupId: number | null = null;
    let targetGroupError: string | null = null;
    try {
      targetGroupId = await createTargetGroup(name, contactFilterId);
    } catch (error) {
      targetGroupError = error instanceof Error ? error.message : String(error);
    }
    console.info(
      `[aangrenzende-stoelen] Maileon: filter ${contactFilterId}, doelgroep ${targetGroupId ?? `mislukt (${targetGroupError})`}, ` +
        `${relationNumbers.length} relatienummers, door ${session.email}`
    );

    // Een nieuw filter rekent Maileon meestal vanzelf door; dit duwt het aan.
    await refreshContactFilter(contactFilterId).catch((error) =>
      console.warn("[aangrenzende-stoelen] Maileon-filter verversen mislukt:", error instanceof Error ? error.message : error)
    );

    return NextResponse.json(
      {
        name,
        contactFilterId,
        targetGroupId,
        targetGroupError,
        filterUrl: contactFilterUrl(contactFilterId),
        pushed: relationNumbers.length,
        dataAsOf,
        catchUp,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    if (error instanceof ListError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[aangrenzende-stoelen] doorzetten naar Maileon mislukt:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const targetGroupId = Number(req.nextUrl.searchParams.get("targetGroupId"));
  if (!Number.isInteger(targetGroupId) || targetGroupId <= 0) {
    return NextResponse.json({ error: "Geen geldige doelgroep." }, { status: 400 });
  }
  if (!isMaileonConfigured()) {
    return NextResponse.json({ error: "Maileon is niet gekoppeld (MAILEON_API_KEY ontbreekt)." }, { status: 503 });
  }

  try {
    return NextResponse.json(await getTargetGroup(targetGroupId), { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
