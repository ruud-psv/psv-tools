import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { checkIds, ID_TYPES, isIdType } from "@/lib/contact-filter-import/ids";
import { createFilterOnFirstField, MAILEON_FIELDS } from "@/lib/contact-filter-import/maileon";
import {
  contactFilterUrl,
  createTargetGroup,
  filterName,
  getTargetGroup,
  isMaileonConfigured,
  MAX_FILTER_VALUES,
  refreshContactFilter,
  validateNameInput,
} from "@/lib/maileon/contact-filters";

/**
 * Contact Filter Import (beta): een lijst relatienummers, SSO-ID's of GroupID's
 * als contactfilter in Maileon, met een doelgroep erop onder dezelfde naam. De
 * preference-regel die bij de mailing hoort, voegt Digital Marketing in Maileon
 * zelf aan het filter toe: de API accepteert die regel niet.
 *
 * POST maakt filter en doelgroep. De ID's komen hier uit de browser (het is de
 * lijst van de gebruiker zelf), dus elke waarde wordt opnieuw gecontroleerd.
 * GET geeft de stand van de doelgroep: Maileon rekent hem op de achtergrond
 * door, de pagina vraagt dit op tot hij klaar is.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/** Langer dan dit wordt de naam in de lijst van Maileon onleesbaar. */
const MAX_TITLE_LENGTH = 150;

export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  if (!isMaileonConfigured()) {
    return NextResponse.json({ error: "Maileon is niet gekoppeld (MAILEON_API_KEY ontbreekt)." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    idType?: unknown;
    values?: unknown;
    sendDate?: unknown;
    title?: unknown;
    dmid?: unknown;
  };

  if (!isIdType(body.idType)) return NextResponse.json({ error: "Kies een soort ID." }, { status: 400 });
  const type = ID_TYPES[body.idType];

  const invalid = validateNameInput(body.sendDate, body.dmid);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim() : "";
  if (!title) return NextResponse.json({ error: "Vul een naam in voor het filter." }, { status: 400 });
  if (title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json({ error: `De naam mag hooguit ${MAX_TITLE_LENGTH} tekens hebben.` }, { status: 400 });
  }

  const checked = checkIds(body.idType, body.values);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { values } = checked;
  if (values.length > MAX_FILTER_VALUES) {
    return NextResponse.json(
      {
        error: `Maileon past hooguit ${MAX_FILTER_VALUES} ${type.plural} in één filter; deze lijst heeft er ${values.length}. Splits de lijst.`,
      },
      { status: 400 }
    );
  }

  try {
    const name = filterName({ sendDate: body.sendDate as string, title, dmid: body.dmid as string });
    const { contactFilterId, field } = await createFilterOnFirstField(name, MAILEON_FIELDS[body.idType].fields, values);

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
      `[contact-filter-import] Maileon: filter ${contactFilterId}, doelgroep ${targetGroupId ?? `mislukt (${targetGroupError})`}, ` +
        `${values.length} ${type.plural} op ${field}, door ${session.email}`
    );

    // Een nieuw filter rekent Maileon meestal vanzelf door; dit duwt het aan.
    await refreshContactFilter(contactFilterId).catch((error) =>
      console.warn("[contact-filter-import] Maileon-filter verversen mislukt:", error instanceof Error ? error.message : error)
    );

    return NextResponse.json(
      {
        name,
        contactFilterId,
        filterUrl: contactFilterUrl(contactFilterId),
        targetGroupId,
        targetGroupError,
        pushed: values.length,
        field,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[contact-filter-import] doorzetten naar Maileon mislukt:", message);
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
