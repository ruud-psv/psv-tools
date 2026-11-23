import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { FileflowFout, categorieen } from "@/lib/fileflow/client";

/** De categorieën van FileFlow, om in de fotokiezer op te filteren. */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json({ categorieen: await categorieen() });
  } catch (err) {
    if (err instanceof FileflowFout) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[fileflow/categorieen]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "De categorieën van FileFlow konden niet worden geladen." }, { status: 502 });
  }
}
