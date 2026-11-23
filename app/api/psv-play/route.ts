import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { onderdeel } from "@/lib/jwplayer/capabilities";
import { foutAntwoord } from "@/lib/jwplayer/fouten";
import { PRESETS, kiesPeriode, type Preset } from "@/lib/jwplayer/periode";
import { SORTEER_OP, content, live, overzicht, publiek, type SorteerOp } from "@/lib/jwplayer/rapport";
import { psvPlayOmgeving } from "@/lib/jwplayer/server";

/**
 * Data voor de pagina PSV Play (`/dashboard/psv-play`). Alleen ingelogd, en
 * alleen voor wie de pagina mag zien (`API_PAGES` in `lib/access.ts`). Alle
 * JW-verzoeken lopen hier, op de server; het secret gaat nooit naar de browser.
 *
 * `?onderdeel=` overzicht | content | live | publiek | meta, met `preset`
 * (7d, 30d, 90d, season) of `van` en `tot` (JW-datums), en optioneel `site`.
 * Bij content ook `sorteer`, `type`, `team` en `seizoen`.
 *
 * De eerste vraag ooit draait de capability probe (zo'n minuut); daarom de
 * ruime `maxDuration`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ONDERDELEN = ["overzicht", "content", "live", "publiek", "meta"] as const;
type Onderdeel = (typeof ONDERDELEN)[number];

export async function GET(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  const q = req.nextUrl.searchParams;
  const wat = (q.get("onderdeel") ?? "overzicht") as Onderdeel;
  if (!ONDERDELEN.includes(wat)) return NextResponse.json({ error: "Onbekend onderdeel." }, { status: 400 });

  try {
    const omgeving = psvPlayOmgeving({ signal: req.signal });
    const ctx = await omgeving.ctx(q.get("site"));

    if (wat === "meta") {
      const onderdelen = (["content", "afhaakcurve", "live", "platform", "device", "land", "uniekPeriode", "media"] as const).map((o) => [o, onderdeel(ctx.cap, o)]);
      return NextResponse.json(
        {
          sites: omgeving.sites,
          site: ctx.site,
          onderdelen: Object.fromEntries(onderdelen),
          capabilities: { ott: ctx.cap.ott, earliestDate: ctx.cap.earliestDate, maxRangeDays: ctx.cap.maxRangeDays },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const preset = q.get("preset") as Preset | null;
    const keuze = kiesPeriode({
      preset: preset && PRESETS.includes(preset) ? preset : null,
      start_date: q.get("van"),
      end_date: q.get("tot"),
    });

    let data: unknown;
    if (wat === "overzicht") data = await overzicht(ctx, keuze);
    else if (wat === "content") {
      const sorteer = q.get("sorteer") as SorteerOp | null;
      data = await content(ctx, keuze, {
        sorteer: sorteer && SORTEER_OP.includes(sorteer) ? sorteer : "kijktijd",
        limiet: 25,
        filter: { type: q.get("type") ?? undefined, team: q.get("team") ?? undefined, seizoen: q.get("seizoen") ?? undefined },
      });
    } else if (wat === "live") data = await live(ctx, keuze);
    else data = await publiek(ctx, keuze);

    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, melding } = foutAntwoord(err);
    console.error(`[psv-play] ${wat}: ${melding}`);
    return NextResponse.json({ error: melding }, { status });
  }
}
