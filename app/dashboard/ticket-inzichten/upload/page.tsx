"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  FileUp,
  Loader2,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COLUMN_LABELS,
  createAggregator,
  detectColumns,
  detectDelimiter,
  type AggregateReport,
  type AggregatedEvent,
  type Aggregator,
  type ColumnDetection,
  type ColumnMap,
} from "@/lib/ticket-sales-aggregate";
import type { SeasonMeta } from "@/lib/historical-ticket-sales";

/**
 * Beheerpagina voor de historische verkoopcijfers achter "Vergelijk met het
 * verleden".
 *
 * Het samenvatten gebeurt hier in de browser, niet op de server: een export van
 * één seizoen is ~450.000 regels (60-90 MB) en een serverless function neemt
 * maximaal ~4,5 MB request body aan. De browser leest het bestand streamend en
 * stuurt alleen het resultaat op — gemeten enkele tientallen kB.
 *
 * Bijkomend voordeel, en geen kleine: de export bevat per regel een `Eigenaar
 * CRM ID` en een `gekocht door`, plus stoel- en prijsgegevens. Die kolommen
 * worden niet gelezen en verlaten dit apparaat niet; alleen aantallen per dag
 * gaan over de lijn.
 */

const SEASON_SUGGESTIONS = ["24/25", "25/26"];

type Encoding = "auto" | "utf-8" | "windows-1252";

interface ParseState {
  status: "idle" | "reading" | "done" | "error";
  progress: number;
  rows: number;
  error?: string;
}

/**
 * Kiest de tekstcodering op inhoud in plaats van op goed vertrouwen.
 *
 * Excel schrijft "Tekst (tab gescheiden)" op Windows als Windows-1252 zonder
 * BOM, terwijl "CSV UTF-8" juist een BOM meegeeft. UTF-8 is zelfvalidersend, dus
 * we proberen een stukje strikt te decoderen: lukt dat, dan is het UTF-8; faalt
 * het, dan is Windows-1252 de verstandige aanname. Zonder deze stap sneuvelen
 * namen als "Fenerbahçe" én splitsen ze in twee losse wedstrijden.
 */
async function sniffEncoding(file: File): Promise<"utf-8" | "windows-1252"> {
  const sample = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
  if (sample[0] === 0xef && sample[1] === 0xbb && sample[2] === 0xbf) return "utf-8";
  // De laatste bytes kunnen een afgekapt meerbyte-teken zijn; die laten we weg
  // zodat een geldige UTF-8-tekst niet onterecht afkeurt.
  const trimmed = sample.subarray(0, Math.max(0, sample.length - 4));
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(trimmed);
    return "utf-8";
  } catch {
    return "windows-1252";
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${bytes} B`;
}

function formatDate(value: string): string {
  const [date] = value.split("T");
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Aflopend op aantal. De prijstypes bepalen straks de filtervinkjes, dus die
 * lijst wordt niet afgekapt op een handvol — je wil hier zien wat er is.
 */
function topEntries(counts: Record<string, number>, limit = 8): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => `${key}: ${value.toLocaleString("nl-NL")}`)
    .join(" · ");
}

export default function HistorischeDataUploadPage() {
  const [season, setSeason] = useState("");
  const [encoding, setEncoding] = useState<Encoding>("auto");
  const [file, setFile] = useState<File | null>(null);
  const [parse, setParse] = useState<ParseState>({ status: "idle", progress: 0, rows: 0 });
  const [detection, setDetection] = useState<ColumnDetection | null>(null);
  const [usedEncoding, setUsedEncoding] = useState<string>("");
  const [events, setEvents] = useState<AggregatedEvent[] | null>(null);
  const [report, setReport] = useState<AggregateReport | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [seasons, setSeasons] = useState<Record<string, SeasonMeta>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSeasons = useCallback(() => {
    fetch("/api/ticket-history/historical", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { seasons?: Record<string, SeasonMeta> }) => setSeasons(d.seasons ?? {}))
      .catch(() => setSeasons({}));
  }, []);

  useEffect(loadSeasons, [loadSeasons]);

  const payloadSize = useMemo(() => {
    if (!events) return 0;
    return new Blob([JSON.stringify({ season, events })]).size;
  }, [events, season]);

  const reset = useCallback(() => {
    setEvents(null);
    setReport(null);
    setDetection(null);
    setSaved(null);
    setSaveError(null);
    setParse({ status: "idle", progress: 0, rows: 0 });
  }, []);

  /**
   * Het seizoen zit in de event-id's verwerkt, dus een resultaat dat met een
   * ander seizoen is ingelezen mag niet blijven staan: opnieuw inlezen.
   */
  const changeSeason = useCallback(
    (next: string) => {
      setSeason(next);
      setFile(null);
      reset();
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [reset]
  );

  const handleFile = useCallback(
    async (picked: File) => {
      setFile(picked);
      reset();
      setParse({ status: "reading", progress: 0, rows: 0 });

      try {
        const chosen = encoding === "auto" ? await sniffEncoding(picked) : encoding;
        setUsedEncoding(chosen);

        // Zelf decoderen in plaats van via `TextDecoderStream`: zo tellen we de
        // ruwe bytes direct mee voor de voortgangsbalk, zonder extra stream.
        const reader = picked.stream().getReader();
        const decoder = new TextDecoder(chosen);

        const parsed: { columns: ColumnDetection | null; aggregator: Aggregator | null } = {
          columns: null,
          aggregator: null,
        };
        let carry = "";
        let bytesRead = 0;
        let rowsSeen = 0;
        let lastPaint = 0;

        const consume = (line: string) => {
          if (!line.trim()) return;
          if (!parsed.columns) {
            const delimiter = detectDelimiter(line);
            const columns = detectColumns(line, delimiter);
            parsed.columns = columns;
            parsed.aggregator = createAggregator({
              season: season.trim(),
              columns: columns.columns,
              delimiter,
            });
            // Was de eerste regel een koptekst, dan is het geen ticket.
            if (columns.hasHeader) return;
          }
          parsed.aggregator?.addLine(line);
          rowsSeen++;
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytesRead += value.byteLength;
          carry += decoder.decode(value, { stream: true });
          const lines = carry.split(/\r?\n/);
          // De laatste kan halverwege een chunkgrens afgebroken zijn.
          carry = lines.pop() ?? "";
          for (const line of lines) consume(line);

          // Niet elke chunk een render: bij een bestand van 90 MB zijn dat
          // duizenden updates en dan staat de UI stil.
          const now = Date.now();
          if (now - lastPaint > 200) {
            lastPaint = now;
            setParse({
              status: "reading",
              progress: picked.size ? bytesRead / picked.size : 0,
              rows: rowsSeen,
            });
            await new Promise((r) => setTimeout(r, 0));
          }
        }
        carry += decoder.decode();
        if (carry) consume(carry);

        if (!parsed.aggregator || !parsed.columns) {
          setParse({ status: "error", progress: 0, rows: 0, error: "Het bestand is leeg." });
          return;
        }

        const result = parsed.aggregator.finish();
        setDetection(parsed.columns);
        setEvents(result.events);
        setReport(result.report);
        setParse({ status: "done", progress: 1, rows: result.report.rowsRead });
      } catch (err) {
        setParse({
          status: "error",
          progress: 0,
          rows: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [encoding, reset, season]
  );

  const handleSave = useCallback(async () => {
    if (!events || !report) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/ticket-history/historical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season: season.trim(),
          rowsRead: report.rowsRead,
          rowsSkipped: report.rowsSkipped,
          events,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Fout ${res.status}`);
      setSaved(
        `${data.eventCount} wedstrijden opgeslagen voor seizoen ${data.season}` +
          (data.replaced ? ` (${data.replaced} eerdere vervangen)` : "")
      );
      loadSeasons();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [events, report, season, loadSeasons]);

  const handleDelete = useCallback(
    async (target: string) => {
      if (!confirm(`Seizoen ${target} verwijderen uit de vergelijkingsdata?`)) return;
      try {
        const res = await fetch(
          `/api/ticket-history/historical?season=${encodeURIComponent(target)}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Fout ${res.status}`);
        }
        loadSeasons();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err));
      }
    },
    [loadSeasons]
  );

  const seasonExists = Boolean(season.trim() && seasons[season.trim()]);
  const canSave = Boolean(events?.length && season.trim() && !saving);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <Link
        href="/dashboard/ticket-inzichten"
        className="inline-flex items-center gap-1.5 text-xs font-heading uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Terug naar ticket inzichten
      </Link>

      <h1 className="text-3xl mb-2">Historische verkoopdata</h1>
      <p className="text-muted-foreground mb-6">
        Voeg de transactie-export van een seizoen toe, zodat je wedstrijden uit dat seizoen kunt
        gebruiken in &ldquo;Vergelijk met het verleden&rdquo;. Het bestand wordt in je browser
        samengevat naar verkopen per dag — de losse transactieregels worden niet verstuurd of
        opgeslagen.
      </p>

      {/* Stap 1: seizoen en bestand */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">1. Seizoen en bestand</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-heading uppercase tracking-wide text-muted-foreground">
              Seizoen
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={season}
                onChange={(e) => changeSeason(e.target.value)}
                placeholder="bv. 24/25"
                className="w-40"
              />
              {SEASON_SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => changeSeason(s)}>
                  {s}
                </Button>
              ))}
            </div>
            {seasonExists && (
              <p className="text-xs text-warning">
                Seizoen {season.trim()} staat er al met{" "}
                {seasons[season.trim()].eventCount.toLocaleString("nl-NL")} wedstrijden. Opslaan
                vervangt die volledig.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-heading uppercase tracking-wide text-muted-foreground">
              Tekstcodering
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {(["auto", "utf-8", "windows-1252"] as Encoding[]).map((enc) => (
                <Button
                  key={enc}
                  variant={encoding === enc ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEncoding(enc)}
                >
                  {enc === "auto" ? "Automatisch" : enc}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Automatisch werkt vrijwel altijd. Kloppen accenten in namen niet, kies dan
              handmatig en lees het bestand opnieuw in.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-heading uppercase tracking-wide text-muted-foreground">
              Bestand
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".tsv,.csv,.txt,text/plain,text/csv,text/tab-separated-values"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) handleFile(picked);
              }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={parse.status === "reading" || !season.trim()}
              >
                <FileUp className="h-4 w-4" />
                Bestand kiezen
              </Button>
              {file && (
                <span className="text-sm text-muted-foreground">
                  {file.name} · {formatBytes(file.size)}
                </span>
              )}
            </div>
            {!season.trim() && (
              // Het seizoen zit in het event-id verwerkt, en dat id belandt in
              // share-links. Inlezen zonder seizoen zou dus onstabiele id's
              // opleveren die na een herhaalde upload niet meer matchen.
              <p className="text-xs text-warning">Vul eerst een seizoen in.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Sla de Excel eerst op als <span className="font-medium">Tekst (tab gescheiden)</span>{" "}
              of CSV. Er is geen limiet aan de bestandsgrootte: het bestand wordt in stukjes
              gelezen en verlaat je computer niet.
            </p>
          </div>

          {parse.status === "reading" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {parse.rows.toLocaleString("nl-NL")} regels gelezen…
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.round(parse.progress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {parse.status === "error" && (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
              Inlezen mislukt: {parse.error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stap 2: controleren */}
      {report && detection && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">2. Controleren</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                { label: "Regels gelezen", value: report.rowsRead.toLocaleString("nl-NL") },
                { label: "Overgeslagen", value: report.rowsSkipped.toLocaleString("nl-NL") },
                { label: "Wedstrijden", value: report.events.length.toLocaleString("nl-NL") },
                { label: "Verzendt", value: formatBytes(payloadSize) },
              ].map((kpi) => (
                <div key={kpi.label}>
                  <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground">
                    {kpi.label}
                  </p>
                  <p className="text-2xl font-heading">{kpi.value}</p>
                </div>
              ))}
            </div>

            {report.rowsSkipped > 0 && (
              <div className="text-xs text-muted-foreground">
                Reden van overslaan:{" "}
                {Object.entries(report.skippedByReason)
                  .filter(([, n]) => n > 0)
                  .map(([reason, n]) => `${reason} (${n.toLocaleString("nl-NL")})`)
                  .join(" · ")}
              </div>
            )}

            {/* Kolommapping — hier zichtbaar zodat de aanname te controleren is. */}
            <div>
              <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-2">
                Kolommen{" "}
                <span className="normal-case tracking-normal font-normal">
                  ({detection.hasHeader ? "op koptekst herkend" : "geen koptekst — op positie"},
                  codering {usedEncoding})
                </span>
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                {(Object.keys(COLUMN_LABELS) as (keyof ColumnMap)[]).map((key) => {
                  const header = detection.hasHeader
                    ? detection.cells[detection.columns[key]]
                    : "";
                  return (
                    <span
                      key={key}
                      className="rounded border border-border bg-muted/40 px-2 py-1"
                    >
                      {COLUMN_LABELS[key]}: kolom {detection.columns[key] + 1}
                      {header && <span className="text-foreground"> &ldquo;{header}&rdquo;</span>}
                      <span className="text-muted-foreground"> ({detection.source[key]})</span>
                    </span>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground mb-2">
                Per wedstrijd
              </p>
              <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-heading uppercase tracking-wide">Wedstrijd</th>
                      <th className="px-3 py-2 font-heading uppercase tracking-wide">Datum</th>
                      <th className="px-3 py-2 font-heading uppercase tracking-wide text-right">
                        Tickets
                      </th>
                      <th className="px-3 py-2 font-heading uppercase tracking-wide text-right">
                        Orders
                      </th>
                      <th className="px-3 py-2 font-heading uppercase tracking-wide text-right">
                        Gratis
                      </th>
                      <th className="px-3 py-2 font-heading uppercase tracking-wide">Venster</th>
                      <th className="px-3 py-2 font-heading uppercase tracking-wide">Types</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.events.map((event) => (
                      <tr key={event.id} className="border-t border-border">
                        <td className="px-3 py-2">{event.name}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          {formatDate(event.date)}
                        </td>
                        <td className="px-3 py-2 text-right font-heading">
                          {event.totalTickets.toLocaleString("nl-NL")}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {event.totalOrders.toLocaleString("nl-NL")}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {event.freeTickets.toLocaleString("nl-NL")}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          D-{event.firstOffset} …{" "}
                          {event.lastOffset >= 0 ? `D-${event.lastOffset}` : `D+${-event.lastOffset}`}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {topEntries(event.byTicketType)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Leg deze totalen naast de bekende bezoekcijfers voordat je opslaat. Abonnementhouders
                verschijnen niet als transactie, dus een wedstrijd kan hier lager uitkomen dan de
                werkelijke bezetting.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stap 3: opslaan */}
      {events && events.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">3. Opslaan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleSave} disabled={!canSave}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {seasonExists ? "Seizoen vervangen" : "Toevoegen aan dataset"}
              </Button>
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  {saved}
                </span>
              )}
            </div>
            {saveError && (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
                {saveError}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Wat er nu in de dataset zit */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Opgeslagen seizoenen</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(seasons).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nog geen historische data. Voeg hierboven een seizoen toe.
            </p>
          ) : (
            <div className="space-y-2">
              {Object.entries(seasons)
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([name, meta]) => (
                  <div
                    key={name}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-heading uppercase">{name}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {meta.eventCount.toLocaleString("nl-NL")} wedstrijden ·{" "}
                        {meta.rowsRead.toLocaleString("nl-NL")} regels verwerkt
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(name)}>
                      <Trash2 className="h-4 w-4" />
                      Verwijderen
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
