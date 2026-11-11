"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PlayableTestReport, ReadResult, ScopeResult } from "@/lib/playable-api-test/run";
import type { SpecOperation } from "@/lib/playable-api-test/spec";

/**
 * Tijdelijke testpagina (beta tool): wat kan PSV Tools met de API van
 * Playable? De vraag erachter: kan een tool de HTML, CSS en JS van een
 * campagnepagina zelf ophalen (en later terugzetten), of moet een collega die
 * blijven kopiëren en plakken?
 */

function formatSize(chars: number): string {
  if (chars < 1000) return `${chars} tekens`;
  return `${(chars / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} k tekens`;
}

function GrantBadge({ granted }: { granted: boolean | null }) {
  if (granted === true) return <Badge variant="success" className="whitespace-nowrap">Toegestaan</Badge>;
  if (granted === false) return <Badge variant="destructive" className="whitespace-nowrap">Niet toegestaan</Badge>;
  return <Badge variant="warning" className="whitespace-nowrap">Onbekend</Badge>;
}

function scopeKind(s: ScopeResult): string {
  if (s.personal) return "Persoonsgegevens";
  if (s.write) return "Wijzigen";
  if (s.read) return "Lezen";
  return "Overig";
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-heading uppercase text-xl mb-3">{children}</h2>;
}

function Conclusion({ report }: { report: PlayableTestReport }) {
  const { conclusion } = report;
  const writeExplain = (name: string, granted: boolean | null) =>
    granted === true
      ? `De sleutels krijgen ${name}. Welke endpoints daarbij horen staat onderaan.`
      : granted === false
        ? `De sleutels krijgen ${name} niet. Daarvoor is een aanpassing bij Playable nodig.`
        : `Niet vast te stellen of ${name} werkt; zie de melding bij de rechten.`;

  return (
    <Card className="p-6">
      <SectionTitle>Conclusie</SectionTitle>
      <p className="text-sm text-muted-foreground mb-4">
        Campagne <span className="font-semibold text-foreground">{report.campaign.id}</span>
        {report.campaign.name && <> · {report.campaign.name}</>}
        {report.campaign.demoUrl && (
          <>
            {" · "}
            <a className="text-primary underline" href={report.campaign.demoUrl} target="_blank" rel="noopener noreferrer">
              demo
            </a>
          </>
        )}
        {report.campaign.liveUrl && (
          <>
            {" · "}
            <a className="text-primary underline" href={report.campaign.liveUrl} target="_blank" rel="noopener noreferrer">
              live
            </a>
          </>
        )}
      </p>

      {conclusion.codeFound ? (
        <div className="alert alert--success">
          <p className="font-semibold">
            De API geeft pagina-code terug{conclusion.psvkFound ? ", met de klassen van de PSV Campaign Kit (psvk-)" : ""}.
          </p>
          <ul className="mt-2 list-disc pl-5 font-mono text-xs">
            {conclusion.codeLocations.map((loc) => (
              <li key={loc}>{loc}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="alert alert--warning">
          <p className="font-semibold">Geen pagina-code gevonden in wat de API teruggeeft.</p>
          <p className="mt-1">
            Dan kan PSV Tools de huidige HTML, CSS en JS niet zelf ophalen, en moet een collega die de eerste
            keer plakken. Kijk hieronder of er velden zijn die zo heten maar leeg zijn.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["campaigns.modify", conclusion.modify],
            ["campaigns.copy", conclusion.copy],
          ] as const
        ).map(([name, granted]) => (
          <div key={name} className="border border-border p-4">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-mono text-sm">{name}</span>
              <GrantBadge granted={granted} />
            </div>
            <p className="text-sm text-muted-foreground">{writeExplain(name, granted)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ScopesTable({ report }: { report: PlayableTestReport }) {
  return (
    <Card className="p-6">
      <SectionTitle>Rechten van de sleutels</SectionTitle>
      <p className="text-sm text-muted-foreground mb-4">
        {report.scopeMethod === "alles-tegelijk"
          ? "Alle rechten in één keer aangevraagd en gekregen."
          : "Niet alles tegelijk gekregen, dus per recht getest."}{" "}
        Opgehaald met een token met alleen: <span className="font-mono">{report.readScopes.join(", ")}</span>.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-4 font-heading uppercase tracking-wide">Recht</th>
              <th className="py-2 pr-4 font-heading uppercase tracking-wide">Soort</th>
              <th className="py-2 pr-4 font-heading uppercase tracking-wide">Resultaat</th>
              <th className="py-2 font-heading uppercase tracking-wide">Toelichting</th>
            </tr>
          </thead>
          <tbody>
            {report.scopes.map((s) => (
              <tr key={s.name} className="border-b border-border align-top">
                <td className="py-2 pr-4 font-mono">
                  {s.name}
                  {!s.inSpec && <span className="block text-xs text-muted-foreground">niet in de beschrijving</span>}
                </td>
                <td className="py-2 pr-4">{scopeKind(s)}</td>
                <td className="py-2 pr-4">
                  <GrantBadge granted={s.granted} />
                </td>
                <td className="py-2 text-muted-foreground">{s.message ?? s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ReadDetails({ read }: { read: ReadResult }) {
  const codeCount = read.codeFields.filter((f) => f.signals.some((s) => s !== "veldnaam")).length;
  return (
    <details className="accordion">
      <summary className="!text-base !normal-case gap-3">
        <span className="min-w-0 flex-1 font-mono break-all">GET {read.path}</span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge variant={read.ok ? "success" : "destructive"}>{read.status || "fout"}</Badge>
          {codeCount > 0 && <Badge variant="info">{codeCount} met code</Badge>}
        </span>
      </summary>
      <div className="accordion__content space-y-3 text-sm">
        {read.summary && <p className="text-muted-foreground">{read.summary}</p>}
        <p className="text-muted-foreground">
          {formatSize(read.size)}
          {read.truncated && " · te groot om helemaal te tonen"}
          {read.error && ` · ${read.error}`}
        </p>
        {read.codeFields.length > 0 && (
          <ul className="space-y-2">
            {read.codeFields.map((f) => (
              <li key={f.path} className="border border-border p-3">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-mono text-xs break-all">{f.path}</span>
                  {f.signals.map((s) => (
                    <Badge key={s} variant={s === "psvk" ? "default" : "outline"}>
                      {s}
                    </Badge>
                  ))}
                  <span className="text-xs text-muted-foreground">{formatSize(f.length)}</span>
                </div>
                {f.preview && <p className="font-mono text-xs text-muted-foreground break-all">{f.preview}</p>}
              </li>
            ))}
          </ul>
        )}
        <pre className="max-h-96 overflow-auto bg-muted p-3 text-xs">
          {read.json !== undefined ? JSON.stringify(read.json, null, 2) : read.text ?? ""}
        </pre>
      </div>
    </details>
  );
}

/** Eén endpoint uit de API-beschrijving, met de bron uitklapbaar. */
function OperationDetails({ op }: { op: SpecOperation }) {
  return (
    <details className="border-b border-border py-2 text-sm">
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={cn(
            "w-14 shrink-0 font-mono uppercase",
            op.method === "get" ? "text-muted-foreground" : "text-primary"
          )}
        >
          {op.method}
        </span>
        <span className="min-w-0 flex-1 font-mono break-all">{op.path}</span>
        {op.summary && <span className="text-muted-foreground">{op.summary}</span>}
      </summary>
      <div className="mt-2 space-y-2">
        {op.scopes.length > 0 && (
          <p className="font-mono text-xs text-muted-foreground">Rechten: {op.scopes.join(", ")}</p>
        )}
        <pre className="max-h-96 overflow-auto bg-muted p-3 text-xs">
          {op.source ?? "Geen bron in de API-beschrijving."}
        </pre>
      </div>
    </details>
  );
}

export function PlayableApiTest() {
  const [campaign, setCampaign] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<PlayableTestReport | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    setReport(null);
    setCopied(false);
    try {
      const res = await fetch("/api/playable-api-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign }),
      });
      const data = await res.json().catch(() => ({ error: `Onverwacht antwoord (${res.status}).` }));
      if (!res.ok) throw new Error(data.error ?? `Test mislukt (${res.status}).`);
      setReport(data as PlayableTestReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function copyReport() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Kopiëren lukte niet. Selecteer de tekst handmatig.");
    }
  }

  const writeOps = report?.spec.operations.filter((op) => op.method !== "get") ?? [];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <form onSubmit={run} className="space-y-4">
          <div className="form-group !mb-0">
            <label htmlFor="playable-campaign" className="form-label">
              Campagne-ID of adres
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                id="playable-campaign"
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                placeholder="189777 of https://…"
                autoComplete="off"
                disabled={running}
              />
              <Button type="submit" disabled={running || campaign.trim() === ""} className="shrink-0">
                {running ? <Loader2 className="animate-spin" /> : <Play />}
                {running ? "Bezig…" : "Test uitvoeren"}
              </Button>
            </div>
            <p className="form-hint">
              Neem bij voorkeur een campagne die met de PSV Campaign Kit is gebouwd. De test leest alleen: hij
              verandert niets in Playable en slaat registraties en andere persoonsgegevens over. Duurt tot een
              minuut.
            </p>
          </div>
        </form>
      </Card>

      {error && <div className="alert alert--error">{error}</div>}

      {report && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Uitgevoerd {new Date(report.ranAt).toLocaleString("nl-NL")}
            </p>
            <Button variant="outline" size="sm" onClick={copyReport}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Gekopieerd" : "Kopieer rapport"}
            </Button>
          </div>

          <Conclusion report={report} />
          <ScopesTable report={report} />

          <Card className="p-6">
            <SectionTitle>Opgehaald voor deze campagne</SectionTitle>
            {report.reads.length === 0 ? (
              <p className="text-sm text-muted-foreground">Er waren geen endpoints om op te halen.</p>
            ) : (
              report.reads.map((read) => <ReadDetails key={read.path} read={read} />)
            )}
            {report.skipped.length > 0 && (
              <div className="mt-4 text-sm">
                <p className="form-label">Overgeslagen</p>
                <ul className="space-y-1">
                  {report.skipped.map((s) => (
                    <li key={`${s.method} ${s.path}`} className="text-muted-foreground">
                      <span className="font-mono">
                        {s.method.toUpperCase()} {s.path}
                      </span>{" "}
                      · {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <SectionTitle>API-beschrijving</SectionTitle>
            {report.spec.loaded ? (
              <p className="text-sm text-muted-foreground mb-4">
                Ingelezen uit{" "}
                <a className="text-primary underline" href={report.spec.url} target="_blank" rel="noopener noreferrer">
                  {report.spec.url}
                </a>
                : {report.spec.operations.length} endpoints, waarvan {writeOps.length} die iets veranderen.
              </p>
            ) : (
              <div className="alert alert--warning">
                {report.spec.error ?? "De API-beschrijving is niet ingelezen."} Getest met de endpoints die we al
                kennen.
              </div>
            )}

            {report.conclusion.writeOperations.length > 0 && (
              <div className="mb-4">
                <p className="form-label">Bij campaigns.modify en campaigns.copy</p>
                <p className="form-hint !mt-0 mb-2">
                  Klap open om te zien welke velden je mag meesturen.
                </p>
                <div className="border-t border-border">
                  {report.conclusion.writeOperations.map((op) => (
                    <OperationDetails key={`${op.method} ${op.path}`} op={op} />
                  ))}
                </div>
              </div>
            )}

            <details className="accordion">
              <summary className="!text-base">Alle endpoints ({report.spec.operations.length})</summary>
              <div className="accordion__content">
                {report.spec.operations.map((op) => (
                  <OperationDetails key={`${op.method} ${op.path}`} op={op} />
                ))}
              </div>
            </details>
          </Card>
        </>
      )}
    </div>
  );
}
