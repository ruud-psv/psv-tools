import { NextRequest, NextResponse } from "next/server";
import { maileonAccessFor } from "@/lib/maileon/access";
import { matchesQueries, scopeWindow } from "@/lib/dm-scope";
import { fetchArchiveUrl, listSentMailings, MaileonConfigError, MaileonError } from "@/lib/maileon/mailings";

export const dynamic = "force-dynamic";

/**
 * De archiefversie (webversie) van een mailing. Met een sessie: elke mailing.
 * Met een deeltoken (`?token=`): alleen een mailing die bij de gedeelde
 * weergave hoort (zie `lib/maileon/access.ts`).
 */
export async function GET(req: NextRequest) {
  const access = await maileonAccessFor(req);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const mailingId = req.nextUrl.searchParams.get("mailingId");
  if (!mailingId || !/^\d+$/.test(mailingId)) {
    return NextResponse.json({ error: "Invalid mailingId" }, { status: 400 });
  }
  const id = Number(mailingId);

  try {
    if (access.scope) {
      // Alleen mailings die de deelpagina zelf ook toont.
      const { from, to } = scopeWindow(access.scope);
      const { queries } = access.scope;
      const shared = await listSentMailings(from, to);
      if (!shared.some((m) => m.id === id && matchesQueries(m, queries))) {
        return NextResponse.json({ error: "Deze mailing hoort niet bij de gedeelde link." }, { status: 403 });
      }
    }

    const archiveUrl = await fetchArchiveUrl(id);
    return NextResponse.json({ archiveUrl });
  } catch (err) {
    if (err instanceof MaileonConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    console.error("[maileon/archive] Ophalen mislukt:", err);
    const message = err instanceof MaileonError ? err.message : "Ophalen mislukt";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
