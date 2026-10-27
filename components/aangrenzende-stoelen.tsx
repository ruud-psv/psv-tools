"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FileUp, Loader2, RefreshCw, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StadiumMap, type AreaNumbers } from "@/components/stadium-map";
import { isPsvHomeMatch } from "@/lib/aangrenzende-stoelen/events";
import { maileonName } from "@/lib/aangrenzende-stoelen/maileon";
import { defaultDmid } from "@/lib/maileon/contact-filters";
import type { FreeGroups } from "@/lib/aangrenzende-stoelen/neighbors";
import type { SeatMaps } from "@/lib/aangrenzende-stoelen/seat-map";

interface IngestStatus {
  manifestsComplete: boolean;
  salesComplete: boolean;
  manifestsRead: number;
  salesRead: number;
  caughtUpAt: string | null;
  running: boolean;
  runs: number;
  updatedAt: string | null;
  lastError: string | null;
}

interface EventEntry {
  eventId: string;
  name: string | null;
  eventDate: string | null;
  seats: number;
  sellable: number;
  tickets: number;
}

interface ListMeta {
  uploadedAt: string;
  uploadedBy: string;
  fileName: string;
  rowsRead: number;
  seats: number;
  relations: number;
  invalidRows: { count: number; examples: number[] };
  duplicateSeats: { count: number; examples: number[] };
  excludedAreaSeats: number;
}

interface Overview {
  ingest: IngestStatus;
  events: EventEntry[];
  list: ListMeta | null;
  canUpload: boolean;
}

interface ListResult {
  event: { eventId: string; name: string | null; eventDate: string | null };
  count: number;
  stats: {
    freeSeats: number;
    freeFromResale: number;
    freeGroups: FreeGroups;
    freeGroupsByArea: Record<string, FreeGroups>;
    freeByArea: Record<string, number>;
    freeFromResaleByArea?: Record<string, number>;
    listedSeatsByArea?: Record<string, number>;
    holderSeatsUnknown: number;
    skippedOwnResale: number;
    skippedTooManySeats: number;
  };
  seatMaps: SeatMaps;
  csv: string;
  includeSeatColumns: boolean;
  maxSeatsPerRelation: number | null;
  dataAsOf: string | null;
  catchUp: "bijgewerkt" | "overgeslagen" | "mislukt";
}

interface MaileonPush {
  name: string;
  contactFilterId: number;
  filterUrl: string;
  pushed: number;
}

const number = new Intl.NumberFormat("nl-NL");

/** Vandaag als `yyyy-mm-dd`, in Nederlandse tijd. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}

function formatDateTime(value: string | null): string {
  if (!value) return "onbekend";
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatEventDate(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value.replace(" ", "T"));
  if (isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileNameFor(result: ListResult): string {
  const slug = (result.event.name ?? "wedstrijd")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const date = (result.event.eventDate ?? "").slice(0, 10);
  return `aangrenzende-stoelen-${slug}${date ? `-${date}` : ""}.csv`;
}

function downloadCsv(result: ListResult) {
  const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileNameFor(result);
  link.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-heading">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AangrenzendeStoelen() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [eventId, setEventId] = useState("");
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [maxSeats, setMaxSeats] = useState("");
  const [making, setMaking] = useState(false);
  const [makeError, setMakeError] = useState<string | null>(null);
  const [result, setResult] = useState<ListResult | null>(null);

  const [sendDate, setSendDate] = useState(today);
  const [dmid, setDmid] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushed, setPushed] = useState<MaileonPush | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/aangrenzende-stoelen", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setOverview(data);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Standaard alleen thuiswedstrijden van het eerste elftal; de rest blijft
  // bereikbaar voor het geval een wedstrijd ooit anders heet.
  const visibleEvents = useMemo(
    () => (overview?.events ?? []).filter((event) => showAllEvents || isPsvHomeMatch(event.name)),
    [overview, showAllEvents]
  );

  // Valt de gekozen wedstrijd buiten de lijst (of is er nog niets gekozen),
  // neem dan de eerstvolgende.
  useEffect(() => {
    if (!visibleEvents.some((event) => event.eventId === eventId)) {
      setEventId(visibleEvents[0]?.eventId ?? "");
      setResult(null);
    }
  }, [visibleEvents, eventId]);

  const ingest = overview?.ingest;
  const ready = Boolean(ingest?.manifestsComplete && ingest?.salesComplete);

  // Zolang de eerste vulling loopt, de voortgang bijhouden.
  useEffect(() => {
    if (!overview || ready) return;
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [overview, ready, load]);

  // Een nieuwe lijst begint zonder Maileon-uitkomst.
  useEffect(() => {
    setPushed(null);
    setPushError(null);
  }, [result]);

  async function pushToMaileon() {
    if (!result) return;
    setPushing(true);
    setPushError(null);
    try {
      const res = await fetch("/api/aangrenzende-stoelen/maileon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: result.event.eventId,
          maxSeatsPerRelation: result.maxSeatsPerRelation,
          sendDate,
          dmid: dmid.trim() || defaultDmid(sendDate),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setPushed(data);
    } catch (caught) {
      setPushError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPushing(false);
    }
  }

  async function makeList() {
    setMaking(true);
    setMakeError(null);
    setResult(null);
    try {
      const res = await fetch("/api/aangrenzende-stoelen/lijst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, maxSeatsPerRelation: maxSeats ? Number(maxSeats) : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setResult(data);
    } catch (caught) {
      setMakeError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setMaking(false);
    }
  }

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    setUploaded(false);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/aangrenzende-stoelen/seizoenkaarthouders", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setOverview((current) => (current ? { ...current, list: data.list } : current));
      setUploaded(true);
      setResult(null);
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  /**
   * Start de ingest. De run zelf duurt minuten en zet zichzelf door; we wachten
   * alleen tot het verzoek vertrokken is en halen daarna de voortgang op.
   */
  async function startIngest() {
    setStarting(true);
    try {
      await fetch("/api/ringside/stoelen", { cache: "no-store", signal: AbortSignal.timeout(3000) }).catch(() => null);
      await load();
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Laden…
      </div>
    );
  }

  if (error || !overview) {
    return (
      <Card>
        <CardContent className="p-6 flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
          <span>Het overzicht kon niet worden geladen: {error}</span>
        </CardContent>
      </Card>
    );
  }

  const list = overview.list;
  // Per vak: vrij, waarvan in de resale, en hoeveel stoelen op de lijst staan.
  const areaNumbers: Record<string, AreaNumbers> = {};
  if (result) {
    const { freeByArea, freeFromResaleByArea = {}, listedSeatsByArea = {}, freeGroupsByArea } = result.stats;
    for (const area of new Set([...Object.keys(freeByArea), ...Object.keys(listedSeatsByArea)])) {
      areaNumbers[area] = {
        free: freeByArea[area] ?? 0,
        resale: freeFromResaleByArea[area] ?? 0,
        listed: listedSeatsByArea[area] ?? 0,
        groups: freeGroupsByArea[area],
      };
    }
  }

  return (
    <div className="space-y-6">
      {/* Lijst maken */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <h2 className="text-xl">Lijst maken</h2>
            <p className="text-sm text-muted-foreground max-w-3xl">
              Kies een wedstrijd. De tool haalt eerst de nieuwste stand uit Ringside op en zoekt daarna
              de seizoenkaarthouders die links, rechts, voor of achter een vrije stoel zitten.
            </p>
          </div>

          {!ready ? (
            <p className="text-sm text-muted-foreground">
              De stoelstatus wordt nog voor het eerst ingelezen. Zodra dat klaar is, kun je hier een lijst
              maken.
            </p>
          ) : overview.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Er zijn geen komende wedstrijden met een stoelenkaart.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5 min-w-[18rem] flex-1 max-w-xl">
                  <label
                    htmlFor="wedstrijd"
                    className="text-xs font-heading uppercase tracking-wide text-muted-foreground"
                  >
                    Wedstrijd
                  </label>
                  <select
                    id="wedstrijd"
                    value={eventId}
                    onChange={(e) => {
                      setEventId(e.target.value);
                      setResult(null);
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {visibleEvents.length === 0 && <option value="">Geen thuiswedstrijden gevonden</option>}
                    {visibleEvents.map((event) => (
                      <option key={event.eventId} value={event.eventId}>
                        {event.name ?? "Onbekende wedstrijd"} · {formatEventDate(event.eventDate)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 w-56">
                  <label
                    htmlFor="max-stoelen"
                    className="text-xs font-heading uppercase tracking-wide text-muted-foreground"
                  >
                    Max. stoelen per relatie
                  </label>
                  <Input
                    id="max-stoelen"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    placeholder="Geen grens"
                    value={maxSeats}
                    onChange={(e) => setMaxSeats(e.target.value)}
                  />
                </div>
                <Button onClick={makeList} disabled={making || !eventId || !list}>
                  {making ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                  Maak lijst
                </Button>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showAllEvents}
                  onChange={(e) => setShowAllEvents(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Toon alle evenementen, niet alleen thuiswedstrijden van PSV
              </label>
            </div>
          )}

          {ready && !list && (
            <p className="text-sm text-muted-foreground">
              Er staat nog geen lijst seizoenkaarthouders. Upload die hieronder.
            </p>
          )}

          {makeError && (
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
              {makeError}
            </p>
          )}

          {result && (
            <div className="space-y-4 border-t border-border pt-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Stat label="Op de lijst" value={number.format(result.count)} hint="relatienummers" />
                <Stat
                  label="Vrije stoelen"
                  value={number.format(result.stats.freeSeats)}
                  hint={`waarvan ${number.format(result.stats.freeFromResale)} in de resale`}
                />
                <Stat
                  label="Zelf aanbieder"
                  value={number.format(result.stats.skippedOwnResale)}
                  hint="relatienummers niet benaderd: hebben zelf een kaart in de resale"
                />
                <Stat
                  label="Boven de grens"
                  value={number.format(result.stats.skippedTooManySeats)}
                  hint={
                    result.maxSeatsPerRelation
                      ? `relatienummers met meer dan ${result.maxSeatsPerRelation} stoelen`
                      : "geen grens ingesteld"
                  }
                />
                <Stat
                  label="Eén stoel"
                  value={number.format(result.stats.freeGroups.one)}
                  hint="losse vrije stoelen, geen vrije stoel ernaast in de rij"
                />
                <Stat
                  label="Twee stoelen"
                  value={number.format(result.stats.freeGroups.two)}
                  hint={`keer twee vrije stoelen naast elkaar (${number.format(2 * result.stats.freeGroups.two)} stoelen)`}
                />
                <Stat
                  label="Drie of meer stoelen"
                  value={number.format(result.stats.freeGroups.threeOrMore)}
                  hint={`groepjes vrije stoelen naast elkaar (samen ${number.format(result.stats.freeGroups.seatsInThreeOrMore)} stoelen)`}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => downloadCsv(result)} disabled={result.count === 0}>
                  <Download className="h-4 w-4" />
                  Download CSV
                </Button>
                <span className="text-xs text-muted-foreground">
                  {result.includeSeatColumns ? "Relatienummer, vak, rij en stoel" : "Alleen relatienummers"} ·
                  stoelstatus van {formatDateTime(result.dataAsOf)}
                  {result.catchUp === "overgeslagen" && " (er liep al een update; dit is de stand daarvoor)"}
                  {result.catchUp === "mislukt" && " (bijwerken mislukte; dit is de vorige stand)"}
                </span>
              </div>

              <div className="space-y-3 rounded-md border border-border p-4">
                <div>
                  <h3 className="text-base font-heading">Doorzetten naar Maileon</h3>
                  <p className="text-xs text-muted-foreground max-w-3xl">
                    Maakt in Maileon een contactfilter op relatienummer (MEMBERNUMBERPRIOR). De lijst wordt
                    daarvoor opnieuw uitgerekend met de nieuwste stand. Er komt nog geen doelgroep: de regel voor
                    de preference Ticketing (&ldquo;PSV Kaartverkoop thuiswedstrijden&rdquo;) voeg je in Maileon
                    zelf toe, want de API van Maileon accepteert die regel niet.
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1.5 w-44">
                    <label
                      htmlFor="verzenddatum"
                      className="text-xs font-heading uppercase tracking-wide text-muted-foreground"
                    >
                      Verzenddatum
                    </label>
                    <Input
                      id="verzenddatum"
                      type="date"
                      value={sendDate}
                      onChange={(e) => setSendDate(e.target.value)}
                      disabled={pushing || Boolean(pushed)}
                    />
                  </div>
                  <div className="space-y-1.5 w-44">
                    <label htmlFor="dmid" className="text-xs font-heading uppercase tracking-wide text-muted-foreground">
                      DMID
                    </label>
                    <Input
                      id="dmid"
                      placeholder={defaultDmid(sendDate || today())}
                      value={dmid}
                      onChange={(e) => setDmid(e.target.value)}
                      disabled={pushing || Boolean(pushed)}
                    />
                  </div>
                  <Button onClick={pushToMaileon} disabled={pushing || Boolean(pushed) || result.count === 0 || !sendDate}>
                    {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Doorzetten naar Maileon
                  </Button>
                </div>
                {!pushed && sendDate && (
                  <p className="text-xs text-muted-foreground break-words">
                    Naam:{" "}
                    {maileonName({
                      sendDate,
                      eventName: result.event.name ?? "",
                      dmid: dmid.trim() || defaultDmid(sendDate),
                    })}
                  </p>
                )}
                {pushError && (
                  <p className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
                    {pushError}
                  </p>
                )}
                {pushed && (
                  <div className="space-y-3 text-sm">
                    <div className="space-y-1">
                      <p>
                        Filter {pushed.contactFilterId} gemaakt:{" "}
                        <span className="font-medium break-words select-all">{pushed.name}</span>
                      </p>
                      <p className="text-muted-foreground">{number.format(pushed.pushed)} relatienummers</p>
                    </div>
                    <div className="space-y-2 rounded-md border border-primary/40 p-3">
                      <p className="flex items-start gap-2 font-medium">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                        Nog doen in Maileon, vóór je mailt
                      </p>
                      <ol className="list-decimal space-y-1 pl-5">
                        <li>
                          <a
                            href={pushed.filterUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 underline underline-offset-2"
                          >
                            Open het filter in Maileon
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                          .
                        </li>
                        <li>
                          Voeg onderaan een regel toe die alleen de contacten overhoudt met de preference{" "}
                          <span className="font-medium">Email › Ticketing = ja</span>.
                        </li>
                        <li>Maak een doelgroep op dit filter, met dezelfde naam.</li>
                      </ol>
                      <p className="text-xs text-muted-foreground">
                        Zonder stap 2 krijgen ook mensen die nee zeiden tegen mail over kaartverkoop deze mailing.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {result.stats.holderSeatsUnknown > 0 && (
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
                  {number.format(result.stats.holderSeatsUnknown)} stoelen uit de lijst seizoenkaarthouders
                  staan niet in de stoelenkaart van deze wedstrijd.
                </p>
              )}

              <StadiumMap numbers={areaNumbers} seatMaps={result.seatMaps} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seizoenkaarthouders */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-xl">Seizoenkaarthouders</h2>
            <p className="text-sm text-muted-foreground max-w-3xl">
              De lijst van Digital Marketing met relatienummer, vak, rij en stoel. Hij blijft staan tot er een
              nieuwe versie wordt geüpload.
            </p>
          </div>

          {list ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">{number.format(list.seats)}</span> stoelen van{" "}
                <span className="font-medium">{number.format(list.relations)}</span> relatienummers · bijgewerkt{" "}
                {formatDateTime(list.uploadedAt)} door {list.uploadedBy}
              </p>
              {(list.invalidRows.count > 0 || list.duplicateSeats.count > 0) && (
                <p className="flex items-start gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
                  <span>
                    {list.invalidRows.count > 0 &&
                      `${number.format(list.invalidRows.count)} regels overgeslagen (bijv. regel ${list.invalidRows.examples.join(", ")}). `}
                    {list.duplicateSeats.count > 0 &&
                      `${number.format(list.duplicateSeats.count)} dubbele stoelen genegeerd (bijv. regel ${list.duplicateSeats.examples.join(", ")}).`}
                  </span>
                </p>
              )}
              {uploaded && <p className="text-muted-foreground">Nieuwe lijst opgeslagen.</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Er is nog geen lijst geüpload.</p>
          )}

          {overview.canUpload && (
            <div className="space-y-2">
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) upload(picked);
                }}
              />
              <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {list ? "Nieuwe lijst uploaden" : "Lijst uploaden"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Excel (.xlsx) of CSV met de kolommen CRM ID, Vak, Rij en Stoel. Andere kolommen worden
                genegeerd.
              </p>
              {uploadError && (
                <p className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
                  {uploadError}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stoelstatus */}
      {ingest && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl">Stoelstatus uit Ringside</h2>
                <p className="text-sm text-muted-foreground max-w-3xl">
                  {ready
                    ? `Bijgehouden voor ${overview.events.length} komende evenementen. Laatst helemaal bij: ${formatDateTime(ingest.caughtUpAt)}.`
                    : "De eerste keer wordt de hele historie van stoelen en verkoop doorgelezen. Dat duurt een paar uur en gaat vanzelf door."}
                </p>
              </div>
              {!ready && !ingest.running && (
                <Button variant="outline" size="sm" onClick={startIngest} disabled={starting}>
                  {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {ingest.runs > 0 ? "Ga verder" : "Start"}
                </Button>
              )}
            </div>
            {!ready && (
              <div className="space-y-1">
                <p className="text-sm">
                  Stoelen: {number.format(ingest.manifestsRead)} rijen gelezen
                  {ingest.manifestsComplete ? " (klaar)" : ""} · verkoop: {number.format(ingest.salesRead)} rijen
                  gelezen{ingest.salesComplete ? " (klaar)" : ""}
                </p>
                {ingest.running && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Bezig. De tellers worden na elke ronde van ongeveer vier minuten bijgewerkt; deze pagina
                    ververst vanzelf.
                  </p>
                )}
              </div>
            )}
            {ingest.lastError && (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
                Vorige ronde gaf een fout: {ingest.lastError}. De volgende ronde probeert het opnieuw.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
