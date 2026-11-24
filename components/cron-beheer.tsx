"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Pause, Play, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Beheer > Crons: welke crons er zijn en wat ze nu doen, met knoppen om de
 * lange inleesroutes van Ringside te stoppen, te hervatten of opnieuw te laten
 * beginnen. Ververst zichzelf elke 15 seconden. Zie `app/api/beheer/crons`.
 */

interface ControlledJob {
  id: "ringside-verkoop" | "ringside-stoelen";
  name: string;
  path: string;
  schedule: string;
  description: string;
  canRestart: boolean;
  paused: { paused: boolean; by: string | null; at: string | null } | null;
  running: boolean;
  runningUntil: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  runs: number;
  status: { busy: boolean; summary: string; detail: string };
  checks: { label: string; value: number; ok: boolean; hint: string }[];
  phases: { name: string; read: number; complete: boolean }[];
}

interface OtherJob {
  id: string;
  name: string;
  path: string;
  schedule: string;
  description: string;
}

interface CronData {
  controlled: ControlledJob[];
  other: OtherJob[];
}

const REFRESH_MS = 15_000;

const number = new Intl.NumberFormat("nl-NL");

function formatMoment(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function api<T>(init?: RequestInit): Promise<T> {
  const res = await fetch("/api/beheer/crons", {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Er ging iets mis. Probeer het opnieuw.");
  return data as T;
}

/** De toestand in één woord, met een kleur. */
function StateTag({ job }: { job: ControlledJob }) {
  if (job.paused?.paused && job.running) return <span className="tag tag--black">Stopt na deze run</span>;
  if (job.paused?.paused) return <span className="tag tag--black">Gestopt</span>;
  if (job.running) return <span className="tag">Bezig</span>;
  if (job.lastError) return <span className="tag tag--outlined">Fout bij laatste run</span>;
  return <span className="tag tag--gold">Wacht op volgende beurt</span>;
}

function JobCard({
  job,
  busy,
  onAction,
}: {
  job: ControlledJob;
  busy: string | null;
  onAction: (job: ControlledJob["id"], action: "stop" | "resume" | "restart") => void;
}) {
  const paused = Boolean(job.paused?.paused);
  const acting = busy?.startsWith(`${job.id}:`) ?? false;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg">{job.name}</h3>
            <StateTag job={job} />
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">{job.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {paused ? (
            <Button size="sm" disabled={acting} onClick={() => onAction(job.id, "resume")} className="gap-1.5">
              <Play className="h-3.5 w-3.5" />
              Hervatten
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={acting}
              onClick={() => onAction(job.id, "stop")}
              className="gap-1.5"
            >
              <Pause className="h-3.5 w-3.5" />
              Stoppen
            </Button>
          )}
          {!paused && !job.running && (
            <Button
              size="sm"
              variant="outline"
              disabled={acting}
              onClick={() => onAction(job.id, "resume")}
              className="gap-1.5"
            >
              <Play className="h-3.5 w-3.5" />
              Nu draaien
            </Button>
          )}
          {job.canRestart && (
            <Button
              size="sm"
              variant="outline"
              disabled={acting}
              onClick={() => {
                if (
                  window.confirm(
                    "Opnieuw beginnen leest de hele verkoopstroom opnieuw in (een paar uur). De pagina's houden zolang de huidige cijfers. Doorgaan?"
                  )
                ) {
                  onAction(job.id, "restart");
                }
              }}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Opnieuw beginnen
            </Button>
          )}
          {acting && <Loader2 className="h-4 w-4 animate-spin self-center text-muted-foreground" />}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        <div>
          <p className="label text-xs text-muted-foreground">Nu</p>
          <p className="font-medium">{job.status.summary}</p>
          {job.status.detail && <p className="text-xs text-muted-foreground">{job.status.detail}</p>}
        </div>
        <div>
          <p className="label text-xs text-muted-foreground">Schema</p>
          <p>{job.schedule}</p>
          <p className="text-xs text-muted-foreground">
            {job.running ? `Deze run loopt tot uiterlijk ${formatMoment(job.runningUntil)}` : `Laatste run ${formatMoment(job.lastRunAt)}`}
          </p>
        </div>
        <div>
          <p className="label text-xs text-muted-foreground">Gedraaid</p>
          <p className="tabular-nums">{number.format(job.runs)} runs</p>
          {paused && job.paused?.at && (
            <p className="text-xs text-muted-foreground">
              Gestopt {formatMoment(job.paused.at)}
              {job.paused.by ? ` door ${job.paused.by}` : ""}
            </p>
          )}
        </div>
      </div>

      {job.phases.length > 0 && (
        <div className="space-y-1.5">
          <p className="label text-xs text-muted-foreground">Rondes</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {job.phases.map((phase) => (
              <li key={phase.name} className="inline-flex items-center gap-1.5">
                {phase.complete ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Loader2 className={`h-3.5 w-3.5 ${job.running ? "animate-spin" : ""} text-muted-foreground`} />
                )}
                <span>{phase.name}</span>
                <span className="text-muted-foreground tabular-nums">{number.format(phase.read)} rijen</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {job.checks.map((check) => (
        <p key={check.label} className="text-xs text-muted-foreground inline-flex items-start gap-1.5">
          {check.ok ? (
            <Check className="h-3.5 w-3.5 mt-0.5 text-success shrink-0" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-error shrink-0" />
          )}
          <span>
            {check.label}: <span className="tabular-nums">{number.format(check.value)}</span>. {check.hint}
          </span>
        </p>
      ))}

      {job.lastError && (
        <div className="alert alert--error text-sm">
          <span className="font-medium">Laatste fout:</span> {job.lastError}
        </div>
      )}
    </Card>
  );
}

export function CronBeheer() {
  const [data, setData] = useState<CronData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<CronData>());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function act(job: ControlledJob["id"], action: "stop" | "resume" | "restart") {
    setBusy(`${job}:${action}`);
    setMessage(null);
    setError(null);
    try {
      const result = await api<CronData & { message: string }>({ method: "POST", body: JSON.stringify({ job, action }) });
      setData({ controlled: result.controlled, other: result.other });
      setMessage(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-3xl">
          De crons die op de achtergrond data inlezen. Stoppen is veilig: een run die bezig is, maakt zijn werk af en slaat
          op, en hervatten gaat verder waar hij was. Per cron loopt nooit meer dan één run tegelijk, dus twee runs lezen
          nooit hetzelfde stuk.
        </p>
        <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Verversen
        </Button>
      </div>

      {message && <div className="alert alert--success text-sm">{message}</div>}
      {error && <div className="alert alert--error text-sm">{error}</div>}

      {!data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laden…
        </div>
      ) : (
        <>
          {data.controlled.map((job) => (
            <JobCard key={job.id} job={job} busy={busy} onAction={act} />
          ))}

          <Card className="p-5 space-y-3">
            <h3 className="text-lg">Overige crons</h3>
            <p className="text-sm text-muted-foreground">Korte taken op een vast moment; die hebben geen knoppen nodig.</p>
            <ul className="divide-y divide-border">
              {data.other.map((job) => (
                <li key={job.id} className="py-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div>
                    <p className="font-medium text-sm">{job.name}</p>
                    <p className="text-xs text-muted-foreground">{job.description}</p>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">{job.schedule}</p>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
