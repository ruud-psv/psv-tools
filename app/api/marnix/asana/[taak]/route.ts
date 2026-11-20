import { NextRequest, NextResponse } from "next/server";

import { AsanaConfigError, AsanaFout, asanaApi, asanaConfig, isGid } from "@/lib/asana/client";
import { taakMetBrief } from "@/lib/asana/taak-brief";
import { alleenAdmins } from "@/lib/marnix/toegang";

/**
 * Eén taak uit het Asana-testproject, met de content brief omgezet naar een
 * opzet voor de Mail Builder en de punten die opvallen. Alleen lezen.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ taak: string }> }) {
  const sessie = await alleenAdmins(req);
  if ("error" in sessie) return sessie.error;

  const { taak: gid } = await params;
  if (!isGid(gid)) return NextResponse.json({ error: "Ongeldig Asana-ID." }, { status: 400 });

  try {
    const { taak, uitkomst } = await taakMetBrief(asanaApi(asanaConfig()), gid);
    return NextResponse.json({
      taak: { gid: taak.gid, naam: taak.naam, url: taak.url, sectie: taak.sectie, dueOn: taak.dueOn },
      uitkomst,
    });
  } catch (err) {
    if (err instanceof AsanaConfigError) return NextResponse.json({ error: err.message }, { status: 500 });
    if (err instanceof AsanaFout) {
      console.error(`[marnix/asana] taak ${gid}: Asana ${err.status}: ${err.message}`);
      const status = err.status === 403 || err.status === 404 ? err.status : 502;
      return NextResponse.json({ error: err.status === 403 ? err.message : `Asana gaf een fout (${err.status}): ${err.message}` }, { status });
    }
    console.error("[marnix/asana] Asana niet bereikbaar:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Asana is niet bereikbaar." }, { status: 502 });
  }
}
