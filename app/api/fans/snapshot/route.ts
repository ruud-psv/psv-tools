import { NextRequest, NextResponse } from "next/server";
import { maileonKlikken } from "@/lib/fans/maileon";
import { fansRun } from "@/lib/fans/run";
import { blobOpslag, isBezig, leesStatus, schrijfStatus } from "@/lib/fans/store";
import { MaileonFout, maileonConfig } from "@/lib/maileon/rapport";
import { chainRemaining, isCronOrSession, startNextRun } from "@/lib/ringside/chain";

/**
 * De dagelijkse telling van Active & Engaged Fans (zie `lib/fans/run.ts`).
 *
 * - **Cron** (`vercel.json`, 21.30 uur UTC: 22.30 uur in de winter, 23.30 uur
 *   in de zomer): zo is de dag bijna compleet, en valt de laatste run van een
 *   maand op de laatste dag zelf. Dat moet, omdat BlueConic alleen de meest
 *   recente logindatum bewaart.
 * - **Eerste vulling**: Maileon vanaf 1 juli. Past dat niet in één run, dan
 *   start deze run zelf de volgende.
 *
 * Toegang: de cron met `CRON_SECRET`, of een ingelogde gebruiker (de knop Nu
 * bijwerken op de pagina).
 *
 * MijnPSV (BlueConic) is nog niet gekoppeld: dat komt via de BlueConic
 * MCP-server, zodra die bekend is (`docs/fans.md`). Tot dan telt alleen Maileon.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUDGET_MS = 230_000;
/** Het slot loopt iets langer dan een run mag duren. */
const SLOT_MS = 300_000;
const DEFAULT_CHAIN = 30;
const MAX_CHAIN = 60;

export async function GET(req: NextRequest) {
  if (!isCronOrSession(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const headers = { "Cache-Control": "no-store, max-age=0" };

  const status = await leesStatus(blobOpslag);
  if (isBezig(status)) return NextResponse.json({ error: "Er loopt al een telling." }, { status: 409, headers });
  await schrijfStatus(blobOpslag, { ...status, runningUntil: new Date(Date.now() + SLOT_MS).toISOString() });

  try {
    const verslag = await fansRun({
      opslag: blobOpslag,
      maileon: maileonKlikken(maileonConfig()),
      mijnpsv: null,
      nu: new Date(),
      budgetMs: BUDGET_MS,
    });
    const mijnpsvFout = verslag.mijnpsv && "fout" in verslag.mijnpsv ? `MijnPSV: ${verslag.mijnpsv.fout}` : null;
    await schrijfStatus(blobOpslag, {
      runs: status.runs + 1,
      lastRunAt: new Date().toISOString(),
      lastError: mijnpsvFout,
      runningUntil: null,
    });
    console.info(
      `[fans] ${verslag.vandaag}: Maileon ${verslag.maileon.dagen.length} dagen (tot ${verslag.maileon.tot ?? "–"}), ` +
        `${verslag.maileon.klaar ? "bij" : "nog niet bij"}${mijnpsvFout ? `; ${mijnpsvFout}` : ""}`
    );

    // Eerste vulling nog niet af: de volgende run starten, zolang er voortgang is.
    const remaining = chainRemaining(req.nextUrl.searchParams.get("chain"), DEFAULT_CHAIN, MAX_CHAIN);
    const chained =
      !verslag.maileon.klaar && verslag.maileon.dagen.length > 0 && remaining > 0 ? await startNextRun(req, remaining - 1, "fans") : false;

    return NextResponse.json({ ...verslag, chained }, { headers });
  } catch (err) {
    const melding = err instanceof Error ? err.message : String(err);
    // Een fout van Maileon is 502; een ontbrekende instelling of doelen aan onze kant 500.
    const code = err instanceof MaileonFout ? 502 : 500;
    console.error(`[fans] snapshot: ${melding}`);
    await schrijfStatus(blobOpslag, { ...status, lastError: melding, runningUntil: null }).catch(() => {});
    return NextResponse.json({ error: melding }, { status: code, headers });
  }
}
