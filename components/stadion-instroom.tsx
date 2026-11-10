"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { StadionInstroomPlayer } from "@/components/stadion-instroom-player";
import { formatDateTime, formatEventDate, number, share } from "@/components/ticketing-stadion-parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { InstroomPayload, InstroomStatus } from "@/lib/instroom/load";
import type { Replay } from "@/lib/instroom/replay-types";

/** Zolang het inlezen loopt, kijken we zo vaak hoe ver het is. */
const POLL_MS = 30_000;

function Legend() {
  const items = [
    { label: "Gescand", className: "bg-psv-red-primary" },
    { label: "Net binnen", className: "bg-psv-white border border-border" },
    { label: "Kaart verkocht, niet gescand", className: "bg-psv-gray-10" },
    { label: "Geen kaart", className: "bg-psv-gray-11" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-hidden="true">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-sm ${item.className}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Wat er onder het stadion over de data te zeggen valt. */
function ReplayNotes({ replay }: { replay: Replay }) {
  const { totals, joins } = replay;
  if (replay.demo) {
    return (
      <p className="max-w-3xl text-xs text-muted-foreground">
        Dit is een voorbeeld: de stoelen zijn een raster in de vakken van de plattegrond en de aankomsttijden zijn
        verzonnen. Het laat zien hoe het scherm werkt, niet hoe een wedstrijd verliep.
      </p>
    );
  }
  const joined = totals.scannedTickets - joins.none;
  return (
    <div className="max-w-3xl space-y-1 text-xs text-muted-foreground">
      <p>
        {number.format(totals.entered)} van de {number.format(totals.sold)} plaatsen met een kaart zijn gescand (
        {share(totals.entered, totals.sold)}). Per plaats telt de eerste geslaagde scan naar binnen. Een staanvak heeft
        geen plaatsen: daar vult elke scan een willekeurige plek in het vak.
      </p>
      <p>
        Van de {number.format(totals.scannedTickets)} gescande tickets is bij {number.format(joined)} het ticket
        gevonden.
        {totals.unplaced > 0 && ` ${number.format(totals.unplaced)} hebben geen plaats op de plattegrond gekregen.`}
        {totals.elsewhere > 0 && ` ${number.format(totals.elsewhere)} horen bij een vak buiten de plattegrond, zoals parkeren.`}
        {totals.failedScans > 0 && ` ${number.format(totals.failedScans)} scans mislukten.`}
      </p>
      <p>
        {replay.layoutSource
          ? `De stoelen komen uit de stoelenkaart van ${replay.layoutSource}; alleen de plek van het vak klopt met het stadion, binnen een vak staan rij en stoelnummer als raster.`
          : "Er is geen stoelenkaart van een komende thuiswedstrijd gevonden: alleen plaatsen met een kaart staan op de plattegrond."}
      </p>
    </div>
  );
}

function Progress({ status }: { status: InstroomStatus }) {
  const stream = (rows: number, complete: boolean) =>
    `${number.format(rows)} rijen gelezen${complete ? ", klaar" : ""}`;
  return (
    <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-xs font-heading uppercase tracking-wide text-muted-foreground">Verkoop</dt>
        <dd className="tabular-nums">{stream(status.salesRead, status.salesComplete)}</dd>
        <dd className="text-xs text-muted-foreground tabular-nums">
          {number.format(status.tickets)} tickets van deze wedstrijd
        </dd>
      </div>
      <div>
        <dt className="text-xs font-heading uppercase tracking-wide text-muted-foreground">Scans</dt>
        <dd className="tabular-nums">{stream(status.attendanceRead, status.attendanceComplete)}</dd>
        <dd className="text-xs text-muted-foreground tabular-nums">
          {number.format(status.scans)} scans van deze wedstrijd
        </dd>
      </div>
    </dl>
  );
}

/** De keuzelijst: een gespeelde thuiswedstrijd van dit seizoen, en de knop die het inlezen start. */
function MatchPicker({
  status,
  disabled,
  onStart,
}: {
  status: InstroomStatus;
  disabled: boolean;
  onStart: (productId: string) => void;
}) {
  const current = status.match?.productId ?? "";
  const [chosen, setChosen] = useState(current || status.matches[0]?.productId || "");
  const replaces = Boolean(current) && chosen !== current;

  if (status.matches.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm">
          {status.known === 0
            ? "De lijst met wedstrijden uit Ringside is er nog niet: de verkoop per dag is nog met zijn eerste doorloop bezig. Probeer het daarna opnieuw."
            : `Er staan geen gespeelde thuiswedstrijden van seizoen ${status.season} in Ringside.`}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="form-group min-w-[16rem] flex-1 sm:max-w-md">
            <label htmlFor="instroom-wedstrijd" className="form-label">
              Wedstrijd ({status.season})
            </label>
            <select
              id="instroom-wedstrijd"
              value={chosen}
              onChange={(event) => setChosen(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {status.matches.map((match) => (
                <option key={match.productId} value={match.productId}>
                  {match.name} · {formatEventDate(match.eventDate)}
                  {match.productId === current ? " (gekozen)" : ""}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => onStart(chosen)} disabled={disabled || !chosen || chosen === current}>
            {replaces ? "Vervang en lees in" : "Lees scans in"}
          </Button>
        </div>
        <p className="max-w-3xl text-xs text-muted-foreground">
          {replaces
            ? `Er is plaats voor één wedstrijd tegelijk: dit vervangt ${status.match?.name}. `
            : ""}
          Ringside kan niet op wedstrijd filteren. De tool leest daarom één keer alle verkoop en alle scans door en
          bewaart alleen wat bij de gekozen wedstrijd hoort. Dat duurt een paar uur.
          {status.running ? " Er loopt nu een run; kiezen kan zodra die klaar is." : ""}
        </p>
      </CardContent>
    </Card>
  );
}

export function StadionInstroom() {
  const [payload, setPayload] = useState<InstroomPayload | null>(null);
  const [demo, setDemo] = useState<Replay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"start" | "demo" | null>(null);

  const fetchPayload = useCallback(async (query = ""): Promise<InstroomPayload> => {
    const res = await fetch(`/api/ticketing-stadion/instroom${query}`, { cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? `De server gaf ${res.status}.`);
    return body as InstroomPayload;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPayload(await fetchPayload());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [fetchPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  // Zolang het inlezen loopt: alleen de voortgang bijwerken. De afspeeldata
  // blijft staan, anders springt het stadion terug naar het begin terwijl je kijkt.
  const status = payload?.status ?? null;
  const reading = Boolean(status && (status.started || status.running) && !status.complete);
  useEffect(() => {
    if (!reading) return;
    const timer = setInterval(async () => {
      try {
        const next = await fetchPayload("?status=1");
        setPayload((current) => (current ? { ...current, status: next.status } : current));
      } catch {
        // De volgende ronde probeert het opnieuw.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [fetchPayload, reading]);

  /** Start of hervat het inlezen. Met een `productId` wordt dat de wedstrijd. */
  async function startIngest(productId?: string) {
    setBusy("start");
    try {
      const query = productId ? `?productId=${encodeURIComponent(productId)}` : "";
      // Een run duurt minuten; we wachten alleen tot hij gestart is.
      await fetch(`/api/ringside/instroom${query}`, { cache: "no-store", signal: AbortSignal.timeout(4000) }).catch(
        () => null
      );
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function showDemo() {
    setBusy("demo");
    try {
      setDemo((await fetchPayload("?demo=1")).replay);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }

  const back = (
    <Link
      href="/dashboard/ticketing-stadion"
      className="inline-flex items-center gap-1.5 text-xs font-heading uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Ticketing Stadion
    </Link>
  );

  const replay = payload?.replay ?? null;
  const hasScans = Boolean(replay && replay.totals.scannedTickets > 0);
  const matchName = status?.match?.name ?? "de wedstrijd";

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {back}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl">Instroom</h1>
          <span className="tag tag--gold">Ringside</span>
          <span className="tag tag--outlined">Eerste versie</span>
        </div>
        <p className="max-w-3xl text-muted-foreground">
          Hoe het Philips Stadion volloopt: elke stoel licht op het moment dat de kaart bij de ingang is gescand. De scans
          worden alleen op verzoek opgehaald: kies een gespeelde thuiswedstrijd en lees hem in.
          {status?.match ? ` Nu: ${status.match.name}, ${formatEventDate(status.match.eventDate)}.` : ""}
        </p>
      </div>

      {error && (
        <Card>
          <CardContent className="flex items-start gap-2 p-6 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-primary" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {loading && !payload && !demo && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laden…
        </div>
      )}

      {demo ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Legend />
            <Button variant="outline" size="sm" onClick={() => setDemo(null)}>
              Sluit het voorbeeld
            </Button>
          </div>
          <StadionInstroomPlayer replay={demo} />
          <ReplayNotes replay={demo} />
        </>
      ) : (
        <>
          {status && (
            <MatchPicker
              key={status.match?.productId ?? "geen"}
              status={status}
              disabled={busy !== null || status.running}
              onStart={(productId) => startIngest(productId)}
            />
          )}

          {!hasScans && (status?.match || error || status) && (
            <Card>
              <CardContent className="space-y-4 p-6">
                {status?.match &&
                  (!status.complete ? (
                    <p className="max-w-3xl text-sm">
                      Het inlezen van {matchName} {status.running ? "loopt" : "staat stil"}. Er zijn nog geen scans van
                      deze wedstrijd gevonden; die kunnen overal in de stroom staan. Het gaat op de achtergrond door;
                      je kunt deze pagina sluiten.
                    </p>
                  ) : (
                    <p className="max-w-3xl text-sm">
                      Alles is ingelezen, maar er zijn geen scans van {matchName} gevonden.
                    </p>
                  ))}

                {status?.started && <Progress status={status} />}

                <div className="flex flex-wrap gap-3">
                  {status?.match && !status.complete && !status.running && (
                    <Button onClick={() => startIngest()} disabled={busy !== null}>
                      {busy === "start" && <Loader2 className="h-4 w-4 animate-spin" />}
                      Ga verder met inlezen
                    </Button>
                  )}
                  <Button variant="outline" onClick={showDemo} disabled={busy !== null}>
                    {busy === "demo" && <Loader2 className="h-4 w-4 animate-spin" />}
                    Bekijk een voorbeeld
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {replay && hasScans && status && (
            <>
              {!status.complete && (
                <div className="alert alert--warning space-y-3 text-sm">
                  <p>
                    Het inlezen is nog niet klaar: het stadion is nog niet compleet. Vernieuw de pagina om te zien wat er
                    inmiddels bij is gekomen.
                  </p>
                  <Progress status={status} />
                  {!status.running && (
                    <Button size="sm" onClick={() => startIngest()} disabled={busy !== null}>
                      {busy === "start" && <Loader2 className="h-4 w-4 animate-spin" />}
                      Ga verder met inlezen
                    </Button>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Legend />
                <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Vernieuwen
                </Button>
              </div>
              <StadionInstroomPlayer replay={replay} />
              <ReplayNotes replay={replay} />
            </>
          )}
        </>
      )}

      {status?.lastError && !demo && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-primary" />
          De vorige run gaf een fout: {status.lastError}. Stand van {formatDateTime(status.updatedAt)}.
        </p>
      )}

      <p className="max-w-3xl text-xs text-muted-foreground">
        Zoomen: de knoppen rechtsboven, of in volledig scherm het muiswiel (anders Ctrl of Cmd erbij). Sleep om te
        schuiven, dubbelklik om terug te gaan. Spatie start en pauzeert.
      </p>
    </div>
  );
}
