import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, requireAdmin } from "@/lib/api-admin";
import { isControlledJob, readPauses, setPaused, type ControlledJob } from "@/lib/beheer/cron-control";
import { isLocked, readState } from "@/lib/ringside/store";
import { isSeatIngestLocked, readSeatState, SEAT_PHASE_LABELS, seatIngestProgress } from "@/lib/ringside/seat-store";

/**
 * Beheer > Crons: welke crons er zijn, wat ze nu doen, en ze stoppen,
 * hervatten of opnieuw laten draaien. Alleen voor admins.
 *
 * Stoppen en hervatten kan bij de twee crons van Ringside die lang lopen (de
 * verkoop per dag en de stoelstatus); zie `lib/beheer/cron-control.ts`. Van de
 * andere crons staat hier alleen wanneer ze draaien.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/** Een ketting van zoveel runs: lang genoeg om een doorloop af te maken. */
const CHAIN = 400;

const PATHS: Record<ControlledJob, string> = {
  "ringside-verkoop": "/api/ringside/ingest",
  "ringside-stoelen": "/api/ringside/stoelen",
};

/** De crons zonder knoppen, uit `vercel.json`. */
const OTHER_JOBS = [
  {
    id: "wachtlijst",
    name: "Wachtlijst",
    path: "/api/wachtlijst/inlezen",
    schedule: "Elke nacht om 03:23 (UTC)",
    description: "Leest de wachtlijst in uit Ringside: omvang, verloop, leeftijd en postcode.",
  },
  {
    id: "psv-play",
    name: "PSV Play",
    path: "/api/psv-play/snapshot",
    schedule: "Elke dag om 06:00 (UTC)",
    description: "Legt de cijfers van JW Player van de vorige dag vast.",
  },
  {
    id: "fans",
    name: "Active & Engaged Fans",
    path: "/api/fans/snapshot",
    schedule: "Elke dag om 21:30 (UTC)",
    description: "Telt de unieke fans uit Maileon (klikken) en, zodra gekoppeld, MijnPSV (BlueConic), voor de seizoensdoelen.",
  },
  {
    id: "asana-automaat",
    name: "Asana-automaat",
    path: "/api/marnix/asana/automaat",
    schedule: "Elke 5 minuten",
    description: "Zet briefings uit het Asana-testproject om naar conceptmails in Maileon.",
  },
];

async function jobs() {
  const [pauses, sales, seats] = await Promise.all([readPauses(), readState(), readSeatState()]);
  const seatProgress = seatIngestProgress(seats);

  const controlled = [
    {
      id: "ringside-verkoop" as const,
      name: "Ringside: verkoop per dag",
      path: PATHS["ringside-verkoop"],
      schedule: "Elk uur",
      description:
        "Telt per wedstrijd en dag de verkochte tickets en hun opbrengst. Voedt de verkoopgrafieken, de vergelijking en de recette.",
      canRestart: true,
      paused: pauses["ringside-verkoop"] ?? null,
      running: isLocked(sales),
      runningUntil: sales.runningUntil,
      lastRunAt: sales.updatedAt || null,
      lastError: sales.lastError,
      runs: sales.runs,
      status:
        sales.mode === "backfill"
          ? {
              busy: true,
              summary: "Volledige doorloop bezig",
              detail: `${sales.rowsRead.toLocaleString("nl-NL")} verkoopregels gelezen (van ruim 15 miljoen). De pagina's tonen tot hij klaar is de vorige cijfers.`,
            }
          : {
              busy: false,
              summary: "Bij: houdt nieuwe verkoop bij",
              detail: sales.caughtUpAt ? `Laatst bijgewerkt tot het eind van de stroom: ${sales.caughtUpAt}.` : "",
            },
      checks: sales.tracksTickets
        ? [
            {
              label: "Gewijzigde tickets vervangen",
              value: sales.check.replaced ?? 0,
              ok: true,
              hint: "Tickets van komende wedstrijden die opnieuw binnenkwamen (bijvoorbeeld in de resale gezet) en niet dubbel geteld zijn.",
            },
            {
              label: "Tickets eraf",
              value: sales.check.removed ?? 0,
              ok: true,
              hint: "Retouren, doorverkochte kaarten van verkopers en verwijderde regels: niet meer meegeteld.",
            },
            {
              label: "Register niet opgeslagen",
              value: sales.check.registryMismatch ?? 0,
              ok: (sales.check.registryMismatch ?? 0) === 0,
              hint: "Moet 0 zijn. Anders kon het register een keer niet worden opgeslagen; dan kan een gewijzigd ticket alsnog dubbel tellen. Opnieuw beginnen lost het op.",
            },
          ]
        : [
            {
              label: "Telt op zonder register",
              value: sales.check.outOfOrder,
              ok: false,
              hint: "Deze cijfers komen uit een doorloop van vóór het register: een ticket dat na verkoop wijzigt, kan dubbel tellen. Kies \"Opnieuw beginnen\" om het register op te bouwen. (Het getal is het aantal regels buiten volgorde in die doorloop.)",
            },
          ],
      phases: [] as { name: string; read: number; complete: boolean }[],
    },
    {
      id: "ringside-stoelen" as const,
      name: "Ringside: stoelstatus",
      path: PATHS["ringside-stoelen"],
      schedule: "Elk kwartier",
      description:
        "Houdt per komende wedstrijd bij welke stoel vrij, verkocht of in de resale is. Voedt de bezetting, Aangrenzende stoelen en het aanbod.",
      canRestart: false,
      paused: pauses["ringside-stoelen"] ?? null,
      running: isSeatIngestLocked(seats),
      runningUntil: seats.runningUntil,
      lastRunAt: seats.updatedAt || null,
      lastError: seats.lastError,
      runs: seats.runs,
      status: seatProgress.done
        ? {
            busy: false,
            summary: "Bij: houdt nieuwe mutaties bij",
            detail: seats.caughtUpAt ? `Laatst bijgewerkt tot het eind van de stroom: ${seats.caughtUpAt}.` : "",
          }
        : {
            busy: true,
            summary: `Bezig met de ronde ${SEAT_PHASE_LABELS[seatProgress.busyWith ?? ""] ?? seatProgress.busyWith}`,
            detail: "Een eenmalige extra ronde door de stroom; de gewone stand van de stoelen blijft intussen bij.",
          },
      checks: [] as { label: string; value: number; ok: boolean; hint: string }[],
      phases: Object.entries(seatProgress.phases).map(([name, phase]) => ({
        name: SEAT_PHASE_LABELS[name] ?? name,
        ...phase,
      })),
    },
  ];

  return { controlled, other: OTHER_JOBS };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  try {
    return NextResponse.json(await jobs(), { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[beheer/crons]", message);
    return NextResponse.json({ error: `De crons konden niet worden gelezen: ${message}` }, { status: 500 });
  }
}

/**
 * Start een run van een cron en wacht alleen tot het verzoek de deur uit is,
 * net als de ketting zelf (`lib/ringside/chain.ts`). Geeft de status terug als
 * er binnen twee seconden antwoord kwam (409: er loopt al een run).
 */
async function trigger(req: NextRequest, path: string, params: Record<string, string>): Promise<number | "gestart"> {
  const url = new URL(path, req.url);
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV === "production" && productionHost) {
    url.protocol = "https:";
    url.host = productionHost;
  }
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const headers: Record<string, string> = {};
  if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
  const cookie = req.headers.get("cookie");
  if (cookie) headers.cookie = cookie;

  try {
    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
      redirect: "manual",
    });
    return res.status;
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return "gestart";
    throw error;
  }
}

/** Body: `{ job, action }` met `action` = `stop`, `resume` of `restart`. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;

  const body = await readJsonBody(req);
  const job = body?.job;
  const action = body?.action;
  if (!isControlledJob(job)) return NextResponse.json({ error: "Onbekende cron." }, { status: 400 });
  if (action !== "stop" && action !== "resume" && action !== "restart") {
    return NextResponse.json({ error: "Onbekende actie." }, { status: 400 });
  }

  try {
    if (action === "stop") {
      await setPaused(job, true, admin.email);
      return NextResponse.json({
        message: "Gestopt. Een run die nog bezig is, maakt zijn werk af en slaat op (hooguit een paar minuten); daarna start er niets meer.",
        ...(await jobs()),
      });
    }

    if (action === "restart") {
      if (job !== "ringside-verkoop") {
        return NextResponse.json(
          { error: "De stoelstatus heeft geen nieuwe doorloop nodig: hij houdt per ticket alleen de laatste versie bij." },
          { status: 400 }
        );
      }
      const sales = await readState();
      if (isLocked(sales)) {
        return NextResponse.json(
          {
            error:
              "Er loopt nog een run. Stop de cron eerst, wacht tot \"Bezig\" verdwijnt (hooguit een paar minuten) en kies dan opnieuw \"Opnieuw beginnen\".",
          },
          { status: 409 }
        );
      }
    }

    await setPaused(job, false, admin.email);
    const result = await trigger(req, PATHS[job], {
      chain: String(CHAIN),
      ...(action === "restart" ? { restart: "1" } : {}),
    });
    const message =
      result === "gestart"
        ? action === "restart"
          ? "Nieuwe doorloop gestart. De pagina's tonen de vorige cijfers tot hij klaar is."
          : "Hervat: er is een run gestart, en die zet zichzelf voort tot alles bij is."
        : result === 409
          ? "Hervat. Er liep al een run; die gaat gewoon door."
          : `Hervat, maar de run startte niet meteen (status ${result}). De cron pakt hem bij zijn volgende beurt op.`;
    return NextResponse.json({ message, ...(await jobs()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[beheer/crons]", message);
    return NextResponse.json({ error: `Dat lukte niet: ${message}` }, { status: 500 });
  }
}
