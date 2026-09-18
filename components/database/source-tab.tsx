"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CheckCircle2,
  Database as DatabaseIcon,
  FileUp,
  Loader2,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COLUMN_LABELS,
  parseExport,
  type ColumnMap,
  type ParseResult,
} from "@/lib/database/csv";
import {
  BYTES_PER_RECORD,
  MAX_PART_BYTES,
  toBytes,
} from "@/lib/database/index-format";
import { newVersionId } from "@/lib/database/ids";
import type { SourceState, SourceVersion } from "@/lib/database/types";
import {
  AXIS_PROPS,
  GRID_PROPS,
  Notice,
  StatTile,
  TOOLTIP_PROPS,
  formatBytes,
  formatDate,
  formatDateTime,
  formatMonth,
  formatNumber,
} from "@/components/database/shared";

type Phase = "idle" | "reading" | "ready" | "uploading" | "saved" | "error";

interface Props {
  state: SourceState;
  onSourceChanged: (state: SourceState) => void;
  onReanalyze: () => Promise<void>;
  staleCount: number;
  reanalyzing: boolean;
}

/**
 * Splitst de gesorteerde index in shards en stuurt ze één voor één omhoog.
 * Serieel en niet parallel: bij een miljoen records zijn het maar drie
 * requests, en zo is de voortgangsbalk eerlijk.
 */
async function uploadIndex(
  versionId: string,
  bytes: Uint8Array,
  onProgress: (fraction: number) => void
): Promise<number> {
  const recordsPerPart = Math.floor(MAX_PART_BYTES / BYTES_PER_RECORD);
  const bytesPerPart = recordsPerPart * BYTES_PER_RECORD;
  const parts = Math.max(1, Math.ceil(bytes.byteLength / bytesPerPart));

  for (let part = 0; part < parts; part++) {
    const start = part * bytesPerPart;
    const chunk = bytes.slice(start, Math.min(bytes.byteLength, start + bytesPerPart));
    const res = await fetch(
      `/api/database/source/chunk?version=${versionId}&part=${part}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Blob([chunk]),
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Deel ${part + 1} van ${parts} mislukt.`);
    }
    onProgress((part + 1) / parts);
  }
  return parts;
}

export function SourceTab({
  state,
  onSourceChanged,
  onReanalyze,
  staleCount,
  reanalyzing,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [rowsSeen, setRowsSeen] = useState(0);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const active = useMemo(
    () => state.versions.find((v) => v.id === state.activeVersionId) ?? null,
    [state]
  );

  const reset = useCallback(() => {
    setFile(null);
    setResult(null);
    setError(null);
    setProgress(0);
    setRowsSeen(0);
    setPhase("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const readFile = useCallback(async (picked: File, columns?: ColumnMap) => {
    setFile(picked);
    setResult(null);
    setError(null);
    setProgress(0);
    setRowsSeen(0);
    setPhase("reading");
    try {
      const parsed = await parseExport(picked, {
        columns,
        onProgress: ({ fraction, rows }) => {
          setProgress(fraction);
          setRowsSeen(rows);
        },
      });
      setResult(parsed);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, []);

  /** Kolom handmatig aanwijzen betekent het bestand opnieuw lezen. */
  const changeColumn = useCallback(
    (key: keyof ColumnMap, index: number) => {
      if (!file || !result) return;
      void readFile(file, { ...result.report.detection.columns, [key]: index });
    },
    [file, readFile, result]
  );

  const save = useCallback(async () => {
    if (!result || !file) return;
    setPhase("uploading");
    setProgress(0);
    setError(null);

    const versionId = newVersionId();
    try {
      const bytes = toBytes(result.index);
      const parts = await uploadIndex(versionId, bytes, setProgress);

      const res = await fetch("/api/database/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId,
          parts,
          fileName: file.name,
          recordCount: result.index.count,
          rowsRead: result.report.rowsRead,
          rowsSkipped: result.report.rowsSkipped,
          duplicates: result.report.duplicates,
          growthByMonth: result.report.growthByMonth,
          firstRecordDate: result.report.firstRecordDate,
          lastRecordDate: result.report.lastRecordDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Opslaan mislukt.");

      onSourceChanged(data.state as SourceState);
      setPhase("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [file, onSourceChanged, result]);

  const removeVersion = useCallback(
    async (version: SourceVersion) => {
      if (
        !confirm(
          `Versie van ${formatDateTime(version.uploadedAt)} verwijderen? De groeigrafiek verliest dit punt.`
        )
      ) {
        return;
      }
      setDeleting(version.id);
      try {
        const res = await fetch(`/api/database/source?version=${version.id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Verwijderen mislukt.");
        onSourceChanged(data.state as SourceState);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setDeleting(null);
      }
    },
    [onSourceChanged]
  );

  /** Nieuwe accounts per maand met het cumulatieve totaal eroverheen. */
  const growthRows = useMemo(() => {
    if (!active) return [];
    let running = 0;
    return Object.keys(active.growthByMonth)
      .sort()
      .map((month) => {
        running += active.growthByMonth[month];
        return {
          month,
          label: formatMonth(month),
          nieuw: active.growthByMonth[month],
          totaal: running,
        };
      });
  }, [active]);

  /** Eén punt per upload, met het verschil ten opzichte van de vorige. */
  const uploadRows = useMemo(() => {
    const chronological = [...state.versions].sort((a, b) =>
      a.uploadedAt.localeCompare(b.uploadedAt)
    );
    return chronological.map((version, i) => ({
      label: formatDate(version.uploadedAt),
      records: version.recordCount,
      groei: i === 0 ? 0 : version.recordCount - chronological[i - 1].recordCount,
    }));
  }, [state.versions]);

  const busy = phase === "reading" || phase === "uploading";

  return (
    <div className="space-y-6">
      {/* Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <DatabaseIcon className="h-5 w-5 text-psv-red-primary" />
            SSO-bronbestand
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {active ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                  label="Records"
                  value={formatNumber(active.recordCount)}
                  sub="unieke SSO-ID's"
                  accent="#e82026"
                />
                <StatTile
                  label="Laatste update"
                  value={formatDate(active.uploadedAt)}
                  sub={`door ${active.uploadedBy}`}
                />
                <StatTile
                  label="Oudste account"
                  value={formatDate(active.firstRecordDate)}
                />
                <StatTile
                  label="Nieuwste account"
                  value={formatDate(active.lastRecordDate)}
                  sub="tot hier is de bron actueel"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Bestand: {active.fileName} · {formatNumber(active.rowsRead)} regels gelezen
                {active.duplicates > 0 &&
                  ` · ${formatNumber(active.duplicates)} dubbele ID's samengevoegd`}
                {active.rowsSkipped > 0 &&
                  ` · ${formatNumber(active.rowsSkipped)} regels overgeslagen`}
              </p>
            </>
          ) : (
            <Notice tone="info" title="Nog geen bron">
              Upload hieronder de export van de SSO-database. Zolang die er niet is,
              kunnen campagnes niet worden geanalyseerd.
            </Notice>
          )}

          {staleCount > 0 && (
            <Notice
              tone="warning"
              title="Campagnes zijn nog niet tegen deze bron geteld"
              action={
                <Button size="sm" onClick={() => void onReanalyze()} disabled={reanalyzing}>
                  {reanalyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {staleCount} campagne{staleCount === 1 ? "" : "s"} opnieuw analyseren
                </Button>
              }
            >
              Een nieuwe bron kan deelnemers laten zien die eerder als onbekend telden.
            </Notice>
          )}
        </CardContent>
      </Card>

      {/* Groei uit de huidige export */}
      {growthRows.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Groei van de database</CardTitle>
            <p className="text-sm text-muted-foreground">
              Uit de aanmaakdatums in de huidige export: nieuwe accounts per maand, met
              het totaal eroverheen.
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={growthRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={24} />
                <YAxis yAxisId="new" {...AXIS_PROPS} width={56} />
                <YAxis yAxisId="total" orientation="right" {...AXIS_PROPS} width={64} />
                <Tooltip {...TOOLTIP_PROPS} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  yAxisId="new"
                  dataKey="nieuw"
                  name="Nieuw in de maand"
                  fill="#e82026"
                  radius={[2, 2, 0, 0]}
                />
                <Line
                  yAxisId="total"
                  type="monotone"
                  dataKey="totaal"
                  name="Totaal accounts"
                  stroke="#09101d"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Groei per upload */}
      {state.versions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Uploads</CardTitle>
            <p className="text-sm text-muted-foreground">
              Hoe de database is gegroeid tussen de bestanden die je hebt geüpload.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {uploadRows.length > 1 && (
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={uploadRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" {...AXIS_PROPS} />
                  <YAxis {...AXIS_PROPS} width={64} domain={["dataMin", "dataMax"]} />
                  <Tooltip {...TOOLTIP_PROPS} />
                  <Line
                    type="monotone"
                    dataKey="records"
                    name="Records"
                    stroke="#e82026"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-4 font-heading text-xs uppercase tracking-wide text-muted-foreground">
                      Geüpload
                    </th>
                    <th className="py-2 pr-4 font-heading text-xs uppercase tracking-wide text-muted-foreground">
                      Bestand
                    </th>
                    <th className="py-2 pr-4 text-right font-heading text-xs uppercase tracking-wide text-muted-foreground">
                      Records
                    </th>
                    <th className="py-2 pr-4 text-right font-heading text-xs uppercase tracking-wide text-muted-foreground">
                      Groei
                    </th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {state.versions.map((version, i) => {
                    // `versions` staat nieuwste eerst, dus de vorige upload is
                    // het volgende element.
                    const previous = state.versions[i + 1];
                    const delta = previous ? version.recordCount - previous.recordCount : null;
                    const isActive = version.id === state.activeVersionId;
                    return (
                      <tr key={version.id} className="border-b border-border/60">
                        <td className="py-2 pr-4">
                          {formatDateTime(version.uploadedAt)}
                          {isActive && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-sm bg-success-bg px-1.5 py-0.5 font-heading text-[10px] uppercase tracking-wide text-success">
                              <CheckCircle2 className="h-3 w-3" />
                              Actief
                            </span>
                          )}
                          <span className="block text-xs text-muted-foreground">
                            {version.uploadedBy}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{version.fileName}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatNumber(version.recordCount)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {delta === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={delta >= 0 ? "text-success" : "text-error"}>
                              {delta >= 0 ? "+" : ""}
                              {formatNumber(delta)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          {!isActive && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void removeVersion(version)}
                              disabled={deleting === version.id}
                              aria-label="Versie verwijderen"
                            >
                              {deleting === version.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {state.versions.length === 1 && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                De groei tussen uploads komt in beeld zodra je een tweede bestand hebt
                geüpload. De grafiek hierboven laat de groei nu al zien op basis van de
                aanmaakdatums in dit ene bestand.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Nieuwe export uploaden</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Een volledig nieuw bestand vervangt de bron. Het bestand wordt in je browser
            gelezen — alleen een onomkeerbare hash van elk SSO-ID met de aanmaakdatum
            gaat naar de server.
          </p>

          <div>
            <Label htmlFor="source-file" className="mb-1.5 block">
              CSV of tab-gescheiden export
            </Label>
            <Input
              id="source-file"
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              disabled={busy}
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) void readFile(picked);
              }}
            />
          </div>

          {file && (
            <p className="text-xs text-muted-foreground">
              {file.name} · {formatBytes(file.size)}
            </p>
          )}

          {busy && (
            <div className="space-y-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-psv-red-primary transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {phase === "reading"
                  ? `Bestand lezen — ${formatNumber(rowsSeen)} regels`
                  : "Index versturen"}
              </p>
            </div>
          )}

          {error && (
            <Notice tone="error" title="Mislukt">
              {error}
            </Notice>
          )}

          {phase === "saved" && (
            <Notice tone="success" title="Bron bijgewerkt">
              De nieuwe export is nu de bron waartegen campagnes worden geteld.
            </Notice>
          )}

          {result && (phase === "ready" || phase === "uploading") && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                  label="Unieke records"
                  value={formatNumber(result.index.count)}
                  accent="#e82026"
                />
                <StatTile
                  label="Regels gelezen"
                  value={formatNumber(result.report.rowsRead)}
                />
                <StatTile
                  label="Overgeslagen"
                  value={formatNumber(result.report.rowsSkipped)}
                  sub={
                    result.report.rowsSkipped
                      ? `${formatNumber(result.report.skippedNoId)} zonder ID · ${formatNumber(result.report.skippedBadDate)} zonder datum`
                      : "alles bruikbaar"
                  }
                />
                <StatTile
                  label="Periode"
                  value={formatDate(result.report.firstRecordDate)}
                  sub={`tot ${formatDate(result.report.lastRecordDate)}`}
                />
              </div>

              {/* Kolomherkenning — zichtbaar en corrigeerbaar, zodat de aanname
                  tegen het bestand te controleren is. */}
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(COLUMN_LABELS) as (keyof ColumnMap)[]).map((key) => (
                  <div key={key}>
                    <Label className="mb-1.5 block text-xs">
                      {COLUMN_LABELS[key]}{" "}
                      <span className="font-sans normal-case tracking-normal text-muted-foreground">
                        ({result.report.detection.source[key] === "header"
                          ? "op koptekst"
                          : "op positie"}
                        )
                      </span>
                    </Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={result.report.detection.columns[key]}
                      disabled={phase === "uploading"}
                      onChange={(e) => changeColumn(key, Number(e.target.value))}
                    >
                      {result.report.detection.cells.map((cell, i) => (
                        <option key={i} value={i}>
                          {i + 1}. {cell || "(leeg)"}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Gelezen als {result.report.encoding}
                {result.report.detection.hasHeader
                  ? ", eerste regel is een koptekst"
                  : ", geen koptekst gevonden"}
                {result.report.duplicates > 0 &&
                  ` · ${formatNumber(result.report.duplicates)} dubbele ID's samengevoegd tot de vroegste datum`}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void save()} disabled={phase === "uploading"}>
                  {phase === "uploading" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Opslaan als bron
                </Button>
                <Button
                  variant="ghost"
                  onClick={reset}
                  disabled={phase === "uploading"}
                >
                  Annuleren
                </Button>
              </div>
            </div>
          )}

          {phase === "saved" && (
            <Button variant="outline" onClick={reset}>
              <FileUp className="h-4 w-4" />
              Nog een bestand uploaden
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
