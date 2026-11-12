"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calculator, Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatEventDate, number, share, Stat } from "@/components/ticketing-stadion-parts";
import { parseAmsterdamDateTime, parseRelationNumbers } from "@/lib/aangrenzende-stoelen/effect-input";
import type { EffectNeighbor, EffectRelation, EffectResult, Outcome } from "@/lib/aangrenzende-stoelen/effect";

/**
 * Het effect van een mail over aangrenzende stoelen: welke vrije buurstoelen
 * na de mail verkocht zijn, en aan wie. Zie `lib/aangrenzende-stoelen/effect.ts`.
 */

/** Zolang het inlezen loopt, kijken we zo vaak hoe ver het is. */
const POLL_MS = 30_000;

interface Match {
  productId: string;
  name: string;
  eventDate: string;
}

interface EffectStatus {
  matches: Match[];
  season: string;
  known: number;
  target: { productId: string; name: string | null; eventDate: string | null } | null;
  ingest: {
    running: boolean;
    salesComplete: boolean;
    salesRead: number;
    tickets: number;
    runs: number;
    updatedAt: string | null;
    lastError: string | null;
  };
  ready: Record<string, { name: string; eventDate: string; tickets: number; caughtUpAt: string }>;
  hasList: boolean;
}

interface EffectResponse {
  match: Match;
  mailMoment: string;
  result: EffectResult;
  csv: string;
  seatMap: { name: string | null; eventDate: string | null; own: boolean } | null;
  caughtUpAt: string;
  listUploadedAt: string;
}

/** Volgorde in de tabel en de tellers: van "het werkte" naar "niets te meten". */
const OUTCOME_ORDER: Outcome[] = [
  "zelf gekocht",
  "zelf gekocht, andere stoel",
  "door ander gekocht",
  "verkocht, koper onbekend",
  "niet verkocht",
  "geen vrije buurstoel",
  "niet in de lijst",
];

const OUTCOME_HINTS: Record<Outcome, string> = {
  "zelf gekocht": "kocht na de mail zelf een vrije buurstoel",
  "zelf gekocht, andere stoel": "kocht na de mail zelf een kaart, maar niet de buurstoel",
  "door ander gekocht": "de vrije buurstoel is na de mail door iemand anders gekocht",
  "verkocht, koper onbekend": "verkocht, maar de eigenaar van de seizoenkaart is niet bekend",
  "niet verkocht": "de vrije buurstoel is na de mail niet verkocht",
  "geen vrije buurstoel": "bij de mail was er (niet meer) een vrije buurstoel",
  "niet in de lijst": "relatienummer staat niet in de lijst seizoenkaarthouders",
};

const time = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatSeconds(seconds: number): string {
  return time.format(new Date(seconds * 1000));
}

/** De aftrap uit de productenlijst (`2026-11-08 14:30:00`) in dezelfde vorm als een `datetime-local`. */
function kickoffKey(eventDate: string): string {
  return eventDate.replace(" ", "T").slice(0, 16);
}

function responseError(res: Response, data: { error?: string }): string {
  if (data.error) return data.error;
  if (res.status === 502 || res.status === 504) {
    return "De server deed er te lang over of liep vast. Probeer het over een minuut opnieuw.";
  }
  return `Status ${res.status}`;
}

function downloadCsv(csv: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function fileNameFor(response: EffectResponse): string {
  const slug = response.match.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `effect-mail-${slug}-${response.mailMoment.slice(0, 10)}.csv`;
}

function seatLabel(seat: { area: string; row: number; seat: number }): string {
  return `${seat.area} ${seat.row}-${seat.seat}`;
}

function neighborText(neighbor: EffectNeighbor): string {
  const where = `${seatLabel(neighbor)} (${neighbor.direction})`;
  if (neighbor.atMail === "net verkocht") {
    return `${where}: al verkocht ${formatSeconds(neighbor.soldAt as number)}, vóór de mail`;
  }
  const resale = neighbor.atMail === "resale" ? ", stond in de resale" : "";
  if (neighbor.soldAt === null) return `${where}: niet verkocht${resale}`;
  const buyer = neighbor.buyer === "zelf" ? "door de houder zelf" : neighbor.buyer === "ander" ? "door iemand anders" : "koper onbekend";
  return `${where}: verkocht ${formatSeconds(neighbor.soldAt)}, ${buyer}${neighbor.viaResale ? ", via de resale" : ""}${
    neighbor.reservation ? " (reservering)" : ""
  }${resale}`;
}

function Progress({ status }: { status: EffectStatus }) {
  const { ingest } = status;
  return (
    <div className="space-y-1 text-sm">
      <p className="tabular-nums">
        {number.format(ingest.salesRead)} regels uit Ringside gelezen · {number.format(ingest.tickets)} van deze wedstrijd
      </p>
      {ingest.running ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Bezig. Dit duurt een paar uur en gaat vanzelf door; de teller wordt na elke ronde van ongeveer vier minuten
          bijgewerkt.
        </p>
      ) : (
        <p className="text-muted-foreground">Op dit moment loopt er geen ronde.</p>
      )}
    </div>
  );
}

function Results({ response }: { response: EffectResponse }) {
  const { result } = response;
  const { totals, diagnostics } = result;
  const withFree =
    totals.relations - totals.byOutcome["geen vrije buurstoel"] - totals.byOutcome["niet in de lijst"];
  const relations = useMemo(
    () =>
      [...result.relations].sort(
        (a, b) =>
          OUTCOME_ORDER.indexOf(a.outcome) - OUTCOME_ORDER.indexOf(b.outcome) ||
          a.relationNumber.localeCompare(b.relationNumber, "nl", { numeric: true })
      ),
    [result.relations]
  );
  const ownerUnknown = result.relations.filter(
    (relation: EffectRelation) => relation.outcome !== "niet in de lijst" && !relation.ownerKnown
  ).length;

  return (
    <div className="space-y-5 border-t border-border pt-5">
      <div className="space-y-1">
        <h3 className="text-base font-heading uppercase">
          {response.match.name} · mail van {formatSeconds(result.mailAt)}
        </h3>
        <p className="text-sm text-muted-foreground max-w-3xl">
          {number.format(totals.relations)} relatienummers, waarvan {number.format(withFree)} bij de mail een vrije
          buurstoel hadden.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {OUTCOME_ORDER.map((outcome) => (
          <Stat
            key={outcome}
            label={outcome}
            value={number.format(totals.byOutcome[outcome])}
            hint={OUTCOME_HINTS[outcome]}
          />
        ))}
        <Stat
          label="Extra kaarten zelf"
          value={number.format(totals.extraTicketsSelf)}
          hint="kaarten die de gemailde houders na de mail zelf kochten, waar dan ook"
        />
      </div>

      <div className="space-y-1 rounded-md border border-border p-4 text-sm max-w-3xl">
        <p>
          Van de <span className="font-medium">{number.format(totals.freeNeighborSeats)}</span> vrije buurstoelen bij
          de mail
          {totals.freeNeighborFromResale > 0 && ` (waarvan ${number.format(totals.freeNeighborFromResale)} in de resale)`}{" "}
          zijn er <span className="font-medium">{number.format(totals.soldNeighborSeats)}</span> daarna verkocht (
          {share(totals.soldNeighborSeats, totals.freeNeighborSeats)}). {number.format(totals.soldNeighborSeatsSelf)}{" "}
          daarvan kocht een gemailde houder ernaast zelf; {number.format(totals.soldNeighborSeatsWithin24h)} gingen
          binnen 24 uur.
        </p>
        <p className="text-muted-foreground">
          Ter vergelijking: van de {number.format(totals.otherFreeSeats)} andere vrije stoelen in het stadion is na de
          mail {share(totals.otherSoldSeats, totals.otherFreeSeats)} verkocht ({number.format(totals.otherSoldSeats)}).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => downloadCsv(response.csv, fileNameFor(response))}>
          <Download className="h-4 w-4" />
          Download CSV
        </Button>
        <span className="text-xs text-muted-foreground">
          Eén regel per buurstoel · verkoop ingelezen tot {formatDateTime(response.caughtUpAt)} · lijst
          seizoenkaarthouders van {formatDateTime(response.listUploadedAt)}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground max-w-3xl">
        {response.seatMap ? (
          !response.seatMap.own && (
            <p>
              Welke stoelen er zijn en welke geblokkeerd, komt uit de stoelenkaart van {response.seatMap.name} (
              {formatEventDate(response.seatMap.eventDate)}): van een gespeelde wedstrijd bewaart Ringside die niet. Een
              geblokkeerde stoel kan per wedstrijd verschillen.
            </p>
          )
        ) : (
          <p className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-primary" />
            Er is geen stoelenkaart gevonden. Alleen stoelen waar ooit een kaart op zat, tellen mee; vrije stoelen die
            nooit verkocht zijn, ontbreken dus.
          </p>
        )}
        {ownerUnknown > 0 && (
          <p>
            Bij {number.format(ownerUnknown)} relatienummers is de eigenaar van de seizoenkaart niet bekend; daar staat de
            koper als onbekend.
          </p>
        )}
        {diagnostics.endsWithoutSeat > 0 && (
          <p>
            {number.format(diagnostics.endsWithoutSeat)} retouren of annuleringen hebben geen stoel. Een stoel die vóór de
            mail is teruggegeven, kan daardoor ten onrechte als bezet tellen.
          </p>
        )}
        <p>
          &ldquo;Zelf&rdquo; betekent: hetzelfde klantaccount in Ringside als de seizoenkaart. Kocht een huisgenoot met
          een eigen account, dan staat het als iemand anders.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-normal">Relatienummer</th>
              <th className="py-1 pr-3 font-normal">Uitkomst</th>
              <th className="py-1 pr-3 font-normal">Eigen stoel</th>
              <th className="py-1 pr-3 font-normal">Buurstoelen</th>
              <th className="py-1 font-normal text-right">Extra zelf</th>
            </tr>
          </thead>
          <tbody>
            {relations.map((relation) => (
              <tr key={relation.relationNumber} className="border-t border-border align-top">
                <td className="py-1.5 pr-3 tabular-nums">{relation.relationNumber}</td>
                <td className="py-1.5 pr-3">{relation.outcome}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{relation.seats.map(seatLabel).join(", ")}</td>
                <td className="py-1.5 pr-3">
                  {relation.neighbors.length === 0 ? (
                    <span className="text-muted-foreground">–</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {relation.neighbors.map((neighbor) => (
                        <li key={seatLabel(neighbor)}>{neighborText(neighbor)}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">{relation.extraTickets || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AangrenzendeStoelenEffect() {
  const [status, setStatus] = useState<EffectStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mailMoment, setMailMoment] = useState("");
  const [productId, setProductId] = useState("");
  const [pickedMatch, setPickedMatch] = useState(false);
  const [numbers, setNumbers] = useState("");

  const [starting, setStarting] = useState(false);
  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [response, setResponse] = useState<EffectResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/aangrenzende-stoelen/effect", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(responseError(res, data));
      setStatus(data);
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const relationNumbers = useMemo(() => parseRelationNumbers(numbers), [numbers]);
  const mailValid = parseAmsterdamDateTime(mailMoment) !== null;

  // De eerste thuiswedstrijd na het moment van de mail, zolang er nog niet zelf
  // een gekozen is. Zonder moment: de wedstrijd die wordt ingelezen, of de laatste.
  const suggested = useMemo(() => {
    const matches = status?.matches ?? [];
    if (mailValid) {
      const after = matches
        .filter((match) => kickoffKey(match.eventDate) > mailMoment)
        .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
      if (after[0]) return after[0].productId;
    }
    return status?.target?.productId ?? matches[0]?.productId ?? "";
  }, [status, mailMoment, mailValid]);

  useEffect(() => {
    if (!pickedMatch) setProductId(suggested);
  }, [suggested, pickedMatch]);

  const ready = status?.ready[productId];
  const isTarget = status?.target?.productId === productId;
  const reading = Boolean(isTarget && status && !status.ingest.salesComplete);
  const otherReading =
    status?.target && !isTarget && !status.ingest.salesComplete && status.ingest.runs > 0 ? status.target : null;

  // Zolang er iets wordt ingelezen, de voortgang bijhouden.
  useEffect(() => {
    if (!status || !(status.ingest.running || (status.target && !status.ingest.salesComplete))) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [status, load]);

  /**
   * Start het inlezen. Een run duurt minuten en zet zichzelf door; we wachten
   * alleen tot het verzoek vertrokken is en halen daarna de voortgang op.
   */
  async function startIngest() {
    setStarting(true);
    try {
      await fetch(`/api/aangrenzende-stoelen/effect/inlezen?productId=${encodeURIComponent(productId)}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      }).catch(() => null);
      await load();
    } finally {
      setStarting(false);
    }
  }

  async function compute() {
    setComputing(true);
    setComputeError(null);
    setResponse(null);
    try {
      const res = await fetch("/api/aangrenzende-stoelen/effect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, mailMoment, relationNumbers: numbers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(responseError(res, data));
      setResponse(data);
    } catch (caught) {
      setComputeError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setComputing(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div>
          <h2 className="text-xl">Effect van een mail</h2>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Achteraf kijken wat een mail over aangrenzende stoelen opleverde. Per relatienummer: welke buurstoelen bij
            de mail vrij waren, of die daarna verkocht zijn, en of de houder hem zelf kocht of iemand anders. Daarvoor
            wordt de verkoop van de wedstrijd met het moment van aankoop uit Ringside ingelezen.
          </p>
        </div>

        {loadError && (
          <p className="flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
            Het overzicht kon niet worden geladen: {loadError}
          </p>
        )}

        {status && (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <div className="form-group w-56">
                <label htmlFor="effect-moment" className="form-label">
                  Moment van de mail
                </label>
                <Input
                  id="effect-moment"
                  type="datetime-local"
                  value={mailMoment}
                  onChange={(e) => {
                    setMailMoment(e.target.value);
                    setResponse(null);
                  }}
                />
              </div>
              <div className="form-group min-w-[16rem] flex-1 max-w-xl">
                <label htmlFor="effect-wedstrijd" className="form-label">
                  Wedstrijd ({status.season})
                </label>
                <select
                  id="effect-wedstrijd"
                  value={productId}
                  onChange={(e) => {
                    setProductId(e.target.value);
                    setPickedMatch(true);
                    setResponse(null);
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {status.matches.length === 0 && <option value="">Geen thuiswedstrijden gevonden</option>}
                  {status.matches.map((match) => (
                    <option key={match.productId} value={match.productId}>
                      {match.name} · {formatEventDate(match.eventDate)}
                      {status.ready[match.productId] ? " (ingelezen)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {status.matches.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {status.known === 0
                  ? "De lijst met wedstrijden uit Ringside is er nog niet: de verkoop per dag is nog met zijn eerste doorloop bezig."
                  : `Er staan geen thuiswedstrijden van seizoen ${status.season} in Ringside.`}
              </p>
            )}

            {productId && (
              <div className="space-y-3 rounded-md border border-border p-4">
                <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground">
                  Verkoop van deze wedstrijd
                </p>
                {ready && !reading ? (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span>
                      Ingelezen: {number.format(ready.tickets)} ticketregels, bijgewerkt tot{" "}
                      {formatDateTime(ready.caughtUpAt)}.
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={startIngest}
                      disabled={starting || status.ingest.running || Boolean(otherReading)}
                    >
                      {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Bijwerken
                    </Button>
                  </div>
                ) : reading ? (
                  <div className="space-y-2">
                    <Progress status={status} />
                    {!status.ingest.running && (
                      <Button variant="outline" size="sm" onClick={startIngest} disabled={starting}>
                        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Ga verder
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <p className="text-muted-foreground max-w-3xl">
                      Nog niet ingelezen. Ringside kan niet per wedstrijd filteren, dus de hele verkoophistorie wordt één
                      keer doorgelezen. Dat duurt een paar uur en gaat vanzelf door; je kunt deze pagina sluiten.
                    </p>
                    {otherReading && (
                      <p className="flex items-start gap-2 text-muted-foreground">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                        Nu wordt {otherReading.name ?? "een andere wedstrijd"} ingelezen. Wacht tot dat klaar is of
                        stilstaat; starten met deze wedstrijd vervangt het dan.
                      </p>
                    )}
                    <Button variant="outline" size="sm" onClick={startIngest} disabled={starting || status.ingest.running}>
                      {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Lees verkoop in
                    </Button>
                  </div>
                )}
                {status.ingest.lastError && isTarget && (
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
                    Vorige ronde gaf een fout: {status.ingest.lastError}
                  </p>
                )}
              </div>
            )}

            <div className="form-group max-w-3xl">
              <label htmlFor="effect-relaties" className="form-label">
                Relatienummers die de mail kregen
              </label>
              <Textarea
                id="effect-relaties"
                rows={5}
                placeholder="Plak de relatienummers, met komma's, spaties of elk op een eigen regel"
                value={numbers}
                onChange={(e) => {
                  setNumbers(e.target.value);
                  setResponse(null);
                }}
              />
              <p className="form-hint">{number.format(relationNumbers.length)} unieke relatienummers</p>
            </div>

            {!status.hasList && (
              <p className="text-sm text-muted-foreground">
                Er staat nog geen lijst seizoenkaarthouders; die is nodig om relatienummers aan stoelen te koppelen.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={compute}
                disabled={computing || !ready || !mailValid || relationNumbers.length === 0 || !status.hasList}
              >
                {computing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                Bereken effect
              </Button>
              {!ready && productId && (
                <span className="text-xs text-muted-foreground">Kan zodra de verkoop van deze wedstrijd is ingelezen.</span>
              )}
            </div>

            {computeError && (
              <p className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
                {computeError}
              </p>
            )}

            {response && <Results response={response} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}
