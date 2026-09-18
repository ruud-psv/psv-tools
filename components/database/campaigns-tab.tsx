"use client";

import { useCallback, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarRange,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseExport, type ParseResult } from "@/lib/database/csv";
import { toBytes } from "@/lib/database/index-format";
import type { Campaign } from "@/lib/database/types";
import {
  AXIS_PROPS,
  GRID_PROPS,
  Notice,
  OUTCOME_COLORS,
  StatTile,
  TOOLTIP_PROPS,
  formatDate,
  formatNumber,
  formatPercent,
} from "@/components/database/shared";

interface Props {
  campaigns: Campaign[];
  activeVersionId: string | null;
  hasSource: boolean;
  onChanged: () => Promise<void>;
}

export function CampaignsTab({
  campaigns,
  activeVersionId,
  hasSource,
  onChanged,
}: Props) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-6">
      {!hasSource && (
        <Notice tone="warning" title="Nog geen bronbestand">
          Upload eerst de SSO-export op het tabblad <strong>Bron</strong>. Een campagne
          kan wel worden opgeslagen, maar er valt dan nog niets te vergelijken.
        </Notice>
      )}

      {adding ? (
        <NewCampaignForm
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await onChanged();
          }}
        />
      ) : (
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          Campagne toevoegen
        </Button>
      )}

      {campaigns.length === 0 && !adding && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nog geen campagnes. Voeg er één toe om te zien hoeveel deelnemers nieuw waren.
          </CardContent>
        </Card>
      )}

      {campaigns.map((campaign) => (
        <CampaignCard
          key={campaign.id}
          campaign={campaign}
          stale={
            !campaign.analysis ||
            !activeVersionId ||
            campaign.analysis.sourceVersionId !== activeVersionId
          }
          hasSource={hasSource}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

/* ---------- Toevoegen ---------- */

function NewCampaignForm({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readFile = useCallback(async (picked: File) => {
    setFile(picked);
    setResult(null);
    setError(null);
    setReading(true);
    setProgress(0);
    try {
      setResult(
        await parseExport(picked, {
          onProgress: ({ fraction }) => setProgress(fraction),
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReading(false);
    }
  }, []);

  const save = useCallback(async () => {
    if (!result || !file) return;
    setSaving(true);
    setError(null);
    setWarning(null);
    try {
      const form = new FormData();
      form.append(
        "meta",
        JSON.stringify({
          title,
          startDate,
          endDate,
          fileName: file.name,
          // Bruikbare regels: unieke deelnemers plus de dubbele van dezelfde
          // persoon. Overgeslagen regels tellen niet als deelname.
          participations: result.index.count + result.report.duplicates,
          rowsSkipped: result.report.rowsSkipped,
        })
      );
      form.append("index", new Blob([toBytes(result.index)]), "index.bin");

      const res = await fetch("/api/database/campaigns", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Opslaan mislukt.");
      if (data.warning) {
        setWarning(data.warning as string);
        setSaving(false);
        return;
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }, [endDate, file, onSaved, result, startDate, title]);

  const complete = title.trim() && startDate && endDate && result && !reading;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Nieuwe campagne</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Label htmlFor="campaign-title" className="mb-1.5 block">
              Titel
            </Label>
            <Input
              id="campaign-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bijvoorbeeld: Winactie shirt thuiswedstrijd"
            />
          </div>
          <div>
            <Label htmlFor="campaign-start" className="mb-1.5 block">
              Start campagne
            </Label>
            <Input
              id="campaign-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="campaign-end" className="mb-1.5 block">
              Einde campagne
            </Label>
            <Input
              id="campaign-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="campaign-file" className="mb-1.5 block">
              Deelnemers (CSV)
            </Label>
            <Input
              id="campaign-file"
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              disabled={reading}
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) void readFile(picked);
              }}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Deelnemers tellen als <strong>nieuw</strong> wanneer hun account is aangemaakt
          op of ná de startdatum. Ligt de aanmaakdatum ervoor, dan kenden we die persoon
          al.
        </p>

        {reading && (
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-psv-red-primary transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}

        {result && (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Deelnames"
              value={formatNumber(result.index.count + result.report.duplicates)}
            />
            <StatTile
              label="Unieke deelnemers"
              value={formatNumber(result.index.count)}
              accent="#e82026"
            />
            <StatTile
              label="Overgeslagen regels"
              value={formatNumber(result.report.rowsSkipped)}
              sub={result.report.rowsSkipped ? "zonder ID of datum" : "alles bruikbaar"}
            />
          </div>
        )}

        {error && (
          <Notice tone="error" title="Mislukt">
            {error}
          </Notice>
        )}
        {warning && (
          <Notice tone="warning" title="Campagne opgeslagen, maar niet geanalyseerd">
            {warning}
          </Notice>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()} disabled={!complete || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Opslaan en analyseren
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            <X className="h-4 w-4" />
            Annuleren
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Eén campagne ---------- */

function CampaignCard({
  campaign,
  stale,
  hasSource,
  onChanged,
}: {
  campaign: Campaign;
  stale: boolean;
  hasSource: boolean;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(campaign.title);
  const [startDate, setStartDate] = useState(campaign.startDate);
  const [endDate, setEndDate] = useState(campaign.endDate);
  const [busy, setBusy] = useState<"save" | "analyze" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(
    async (action: "save" | "analyze" | "delete", run: () => Promise<Response>) => {
      setBusy(action);
      setError(null);
      try {
        const res = await run();
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Actie mislukt.");
        setEditing(false);
        await onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [onChanged]
  );

  const analysis = campaign.analysis;
  const dailyRows =
    analysis?.daily.map((point) => ({
      label: formatDate(point.date),
      Nieuw: point.isNew,
      Bestaand: point.existing,
      Onbekend: point.unknown,
    })) ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{campaign.title}</CardTitle>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5" />
              {formatDate(campaign.startDate)} t/m {formatDate(campaign.endDate)}
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing((v) => !v)}
              aria-label="Campagne bewerken"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasSource || busy !== null}
              onClick={() =>
                void call("analyze", () =>
                  fetch(`/api/database/campaigns/${campaign.id}/analyze`, { method: "POST" })
                )
              }
              aria-label="Opnieuw analyseren"
            >
              {busy === "analyze" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                if (!confirm(`"${campaign.title}" verwijderen?`)) return;
                void call("delete", () =>
                  fetch(`/api/database/campaigns/${campaign.id}`, { method: "DELETE" })
                );
              }}
              aria-label="Campagne verwijderen"
            >
              {busy === "delete" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {editing && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <Label className="mb-1.5 block text-xs">Titel</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Start</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Einde</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Een andere periode betekent een andere uitkomst; de analyse draait daarna
              opnieuw.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  void call("save", () =>
                    fetch(`/api/database/campaigns/${campaign.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ title, startDate, endDate }),
                    })
                  )
                }
              >
                {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}
                Opslaan
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTitle(campaign.title);
                  setStartDate(campaign.startDate);
                  setEndDate(campaign.endDate);
                  setEditing(false);
                }}
              >
                Annuleren
              </Button>
            </div>
          </div>
        )}

        {error && (
          <Notice tone="error" title="Mislukt">
            {error}
          </Notice>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile label="Deelnames" value={formatNumber(campaign.participations)} />
          <StatTile
            label="Unieke deelnemers"
            value={formatNumber(campaign.uniqueParticipants)}
            sub={
              campaign.participations > campaign.uniqueParticipants
                ? `${formatNumber(campaign.participations - campaign.uniqueParticipants)} herhaalde deelnames`
                : "iedereen één keer"
            }
          />
          {analysis ? (
            <>
              <StatTile
                label="Nieuw"
                value={formatNumber(analysis.isNew)}
                sub={`${formatPercent(analysis.isNew, campaign.uniqueParticipants)} van de deelnemers`}
                accent={OUTCOME_COLORS.isNew}
              />
              <StatTile
                label="Bestaand"
                value={formatNumber(analysis.existing)}
                sub={formatPercent(analysis.existing, campaign.uniqueParticipants)}
              />
              <StatTile
                label="Onbekend"
                value={formatNumber(analysis.unknown)}
                sub={
                  analysis.unknown
                    ? "niet in de bron gevonden"
                    : "alles teruggevonden"
                }
                accent={analysis.unknown ? OUTCOME_COLORS.unknown : undefined}
              />
            </>
          ) : (
            <div className="sm:col-span-2 lg:col-span-3">
              <Notice tone="info">
                Deze campagne is nog niet geanalyseerd.
              </Notice>
            </div>
          )}
        </div>

        {stale && analysis && (
          <Notice tone="warning" title="Verouderde uitkomst">
            Deze cijfers zijn geteld tegen een oudere bronversie. Analyseer opnieuw om ze
            bij te werken.
          </Notice>
        )}

        {analysis?.sourceEndsBeforeCampaign && (
          <Notice tone="warning" title="Bronbestand is ouder dan deze campagne">
            Het nieuwste account in de bron is van{" "}
            {formatDate(analysis.sourceLastRecordDate)}, vóór het einde van de campagne op{" "}
            {formatDate(campaign.endDate)}. Deelnemers die zich daarna registreerden staan
            er nog niet in: &ldquo;nieuw&rdquo; is daardoor te laag en
            &ldquo;onbekend&rdquo; te hoog. Upload een verse export en analyseer opnieuw.
          </Notice>
        )}

        {dailyRows.length > 1 && (
          <div>
            <p className="mb-2 font-heading text-xs uppercase tracking-wide text-muted-foreground">
              Deelnames per dag
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyRows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={24} />
                <YAxis {...AXIS_PROPS} width={56} />
                <Tooltip {...TOOLTIP_PROPS} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Nieuw" stackId="a" fill={OUTCOME_COLORS.isNew} />
                <Bar dataKey="Bestaand" stackId="a" fill={OUTCOME_COLORS.existing} />
                <Bar dataKey="Onbekend" stackId="a" fill={OUTCOME_COLORS.unknown} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Bestand: {campaign.fileName} · toegevoegd door {campaign.createdBy}
          {campaign.rowsSkipped > 0 &&
            ` · ${formatNumber(campaign.rowsSkipped)} regels overgeslagen`}
        </p>
      </CardContent>
    </Card>
  );
}
