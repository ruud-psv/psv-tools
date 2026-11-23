import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { FileflowFout, zoekBeelden } from "@/lib/fileflow/client";

/**
 * Zoeken in FileFlow, de beeldbank van PSV, voor een foto in een stuk. Via de
 * server, zodat het token (FILEFLOW_SECRET) nooit in de browser komt.
 * `?q=…&offset=…&categorie=…`
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;
  const p = req.nextUrl.searchParams;
  const categorie = Number(p.get("categorie"));
  try {
    const resultaat = await zoekBeelden({
      q: p.get("q") ?? undefined,
      offset: Number(p.get("offset")) || 0,
      ...(Number.isInteger(categorie) && categorie > 0 && { categorie }),
    });
    return NextResponse.json(resultaat);
  } catch (err) {
    if (err instanceof FileflowFout) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[fileflow/zoeken]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Zoeken in FileFlow is mislukt." }, { status: 502 });
  }
}
