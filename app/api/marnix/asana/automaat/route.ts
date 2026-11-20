import { NextRequest, NextResponse } from "next/server";

import { getAccess } from "@/lib/access-store";
import { verifySession } from "@/lib/auth";
import { draaiRonde } from "@/lib/asana/automaat";
import { blobTaakStatus } from "@/lib/asana/automaat-opslag";
import { AsanaConfigError, asanaApi, asanaConfig, type AsanaApi } from "@/lib/asana/client";
import { mailUitOpzet } from "@/lib/asana/mail";
import { maileonConceptApi, type MaileonConceptApi } from "@/lib/maileon/concept";
import { zetConceptMetVoorbeeld } from "@/lib/maileon/concept-zetten";
import { MaileonConfigError, maileonConfig } from "@/lib/maileon/rapport";

/**
 * De automaat voor het Asana-testproject: elke 5 minuten via de cron in
 * `vercel.json`, of met de knop "Nu verwerken" op `/marnix/maileon-concept`.
 * Wat hij doet staat in `lib/asana/automaat.ts`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** De cron met het gedeelde geheim, of een ingelogde admin. */
async function magDraaien(req: NextRequest): Promise<boolean> {
  const geheim = process.env.CRON_SECRET;
  if (geheim) {
    if (req.headers.get("authorization") === `Bearer ${geheim}`) return true;
    if (req.headers.get("x-cron-secret") === geheim) return true;
  }
  const cookie = req.cookies.get("psv_session")?.value;
  const sessie = cookie ? verifySession(cookie) : null;
  return Boolean(sessie && (await getAccess(sessie.email)).isAdmin);
}

/**
 * Het adres voor de voorbeeldlink in Asana. De cron roept de deployment aan,
 * niet per se tools.psv.nl; daarom in productie het vaste productiedomein.
 */
function publiekeBasis(req: NextRequest): string {
  const vast = process.env.PSV_TOOLS_URL?.trim();
  if (vast) return vast;
  const productie = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV === "production" && productie) return `https://${productie}`;
  return req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  if (!(await magDraaien(req))) return NextResponse.json({ error: "Geen toegang." }, { status: 401 });

  let asana: AsanaApi;
  let maileon: MaileonConceptApi;
  try {
    asana = asanaApi(asanaConfig());
    maileon = maileonConceptApi(maileonConfig());
  } catch (err) {
    const melding = err instanceof AsanaConfigError || err instanceof MaileonConfigError ? err.message : "Configuratie ontbreekt.";
    console.error(`[asana/automaat] ${melding}`);
    return NextResponse.json({ error: melding }, { status: 500 });
  }

  const basis = publiekeBasis(req);
  try {
    const verslag = await draaiRonde({
      asana,
      status: blobTaakStatus,
      maakMail: (opzet) => {
        const mail = mailUitOpzet(opzet);
        return { html: mail.html, problemen: mail.problemen };
      },
      maakConcept: async (invoer) => {
        const concept = await zetConceptMetVoorbeeld(maileon, invoer, "automaat (Asana)");
        return {
          mailingId: concept.mailingId,
          nieuw: concept.nieuw,
          naam: concept.naam,
          voorbeeldUrl: new URL(concept.voorbeeldPad, basis).toString(),
        };
      },
    });
    console.info(
      `[asana/automaat] ${verslag.bekeken} taken bekeken, ${verslag.verwerkt.length} verwerkt` +
        (verslag.verwerkt.length ? `: ${verslag.verwerkt.map((v) => `${v.gid} ${v.actie}`).join(", ")}` : "")
    );
    return NextResponse.json(verslag);
  } catch (err) {
    const melding = err instanceof Error ? err.message : String(err);
    console.error(`[asana/automaat] ronde mislukt: ${melding}`);
    return NextResponse.json({ error: `De ronde mislukte: ${melding}` }, { status: 502 });
  }
}
