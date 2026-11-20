import { NextRequest, NextResponse } from "next/server";

import { AsanaConfigError, AsanaFout, TESTPROJECT, asanaApi, asanaConfig } from "@/lib/asana/client";
import { alleenAdmins } from "@/lib/marnix/toegang";

/** De open taken in het Asana-testproject, voor de keuzelijst op /marnix/maileon-concept. */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessie = await alleenAdmins(req);
  if ("error" in sessie) return sessie.error;

  try {
    const taken = await asanaApi(asanaConfig()).takenInProject(TESTPROJECT);
    return NextResponse.json({ project: TESTPROJECT, taken });
  } catch (err) {
    if (err instanceof AsanaConfigError) return NextResponse.json({ error: err.message }, { status: 500 });
    if (err instanceof AsanaFout) {
      console.error(`[marnix/asana] Asana ${err.status}: ${err.message}`);
      return NextResponse.json({ error: `Asana gaf een fout (${err.status}): ${err.message}` }, { status: 502 });
    }
    console.error("[marnix/asana] Asana niet bereikbaar:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Asana is niet bereikbaar." }, { status: 502 });
  }
}
