import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { PlayableTestError, runPlayableApiTest } from "@/lib/playable-api-test/run";

export const dynamic = "force-dynamic";
// Tientallen verzoeken naar Playable: tokens per recht en de endpoints van één campagne.
export const maxDuration = 120;

/**
 * Playable API-test (beta tool): welke rechten hebben de sleutels van PSV
 * Tools, en geeft de API de HTML, CSS en JS van een campagne terug? Wie de
 * pagina niet mag zien houdt de middleware tegen (`API_PAGES` in
 * `lib/access.ts`). Leest alleen; zie `lib/playable-api-test/run.ts`.
 */
export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const body = (await req.json().catch(() => null)) as { campaign?: unknown } | null;
  const campaign = typeof body?.campaign === "string" ? body.campaign : "";

  try {
    const report = await runPlayableApiTest(campaign);
    console.info(
      `[playable-api-test] ${session.email} testte campagne ${report.campaign.id}: ` +
        `code ${report.conclusion.codeFound ? "gevonden" : "niet gevonden"}, ` +
        `modify ${report.conclusion.modify}, copy ${report.conclusion.copy}`
    );
    return NextResponse.json(report);
  } catch (err) {
    if (err instanceof PlayableTestError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[playable-api-test] Test mislukt:", err);
    return NextResponse.json(
      { error: `De test is mislukt: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
