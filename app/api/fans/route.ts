import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { maakOverzicht } from "@/lib/fans/bereken";
import { doelenVoor } from "@/lib/fans/doelen";
import { HANDMATIG } from "@/lib/fans/handmatig";
import { blobOpslag, isBezig, leesHistorie, leesStatus } from "@/lib/fans/store";
import { amsterdamDag } from "@/lib/fans/tijd";

/**
 * Data voor de pagina Active & Engaged Fans (`/dashboard/fans`). Alleen
 * ingelogd, en alleen voor wie de pagina mag zien (`API_PAGES` in
 * `lib/access.ts`). Leest de historie van de dagelijkse telling en voegt de
 * handmatige cijfers van vóór de automatische telling toe. Alleen aantallen.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;
  const headers = { "Cache-Control": "no-store, max-age=0" };

  const vandaag = amsterdamDag(new Date());
  const seizoen = doelenVoor(vandaag);
  if (!seizoen) {
    return NextResponse.json({ error: `Er zijn nog geen doelen voor het seizoen van ${vandaag}.` }, { status: 404, headers });
  }

  try {
    const [historie, status] = await Promise.all([leesHistorie(blobOpslag, seizoen.seizoen), leesStatus(blobOpslag)]);
    const overzicht = maakOverzicht({ seizoen, handmatig: HANDMATIG, historie, vandaag, mijnpsvGekoppeld: false });
    return NextResponse.json(
      {
        overzicht,
        status: { lastRunAt: status.lastRunAt, lastError: status.lastError, bezig: isBezig(status) },
      },
      { headers }
    );
  } catch (err) {
    const melding = err instanceof Error ? err.message : String(err);
    console.error(`[fans] ${melding}`);
    return NextResponse.json({ error: `De cijfers konden niet worden gelezen: ${melding}` }, { status: 500, headers });
  }
}
