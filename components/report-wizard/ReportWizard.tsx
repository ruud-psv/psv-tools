"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, Link2, ExternalLink, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { stripName } from "@/lib/dm-share";
import type { PeriodConfig, ReportInput, ReportRecord, ReportSources } from "@/lib/reports";
import {
  PAGE_SELECT_LIMIT, PRESETS_BY_SOURCE, SOURCE_ALLOWS_CUSTOM, SOURCE_META, TICKET_CATEGORIES,
  WEB_SITES, periodLabel, type SourceKey,
} from "./constants";
import { StepIndicator } from "./StepIndicator";
import { PeriodPicker, resolvePeriodValue, type PeriodValue } from "./PeriodPicker";
import { ItemChecklist } from "./ItemChecklist";

/* ---------- Werk-state ---------- */

interface WizardState {
  title: string;
  intro: string;
  dm: { enabled: boolean; period: PeriodValue; queries: string[] };
  ticketing: { enabled: boolean; period: PeriodValue; category: string; queries: string[] };
  web: { enabled: boolean; period: PeriodValue; sites: WebSiteState[] };
  fanstore: { enabled: boolean; period: PeriodValue; products: string[] };
}

/** Eén aangevinkte site met zijn pagina-selectie; leeg = alle pagina's. */
interface WebSiteState {
  site: string;
  paths: string[];
}

const DEFAULT_WEB_SITE = "psv";

const DEFAULT_PERIOD: PeriodValue = { preset: "30d", customFrom: "", customTo: "" };

function periodValueFromConfig(config: PeriodConfig | undefined, fallbackPreset: string): PeriodValue {
  if (!config) return { preset: fallbackPreset, customFrom: "", customTo: "" };
  return {
    preset: config.preset,
    customFrom: config.from ?? "",
    customTo: config.to ?? "",
  };
}

/** Sites uit een bestaand rapport. De API normaliseert oude rapporten al naar
 *  `sites`; de legacy-tak vangt records op die daar nog langs komen. */
function initialWebSites(web: ReportSources["web"] | undefined): WebSiteState[] {
  const list = (web?.sites ?? []).filter((s) => !!s?.site).map((s) => ({ site: s.site, paths: s.paths ?? [] }));
  if (list.length > 0) return list;
  const legacy = web as unknown as { site?: string; paths?: string[] } | undefined;
  if (legacy?.site) return [{ site: legacy.site, paths: legacy.paths ?? [] }];
  return [{ site: DEFAULT_WEB_SITE, paths: [] }];
}

function initialState(initial: ReportRecord | null): WizardState {
  const s = initial?.sources;
  const tk = s?.ticketing;
  return {
    title: initial?.title ?? "",
    intro: initial?.intro ?? "",
    dm: {
      enabled: !!s?.dm?.enabled,
      period: periodValueFromConfig(s?.dm?.period, "30d"),
      queries: s?.dm?.queries ?? [],
    },
    ticketing: {
      enabled: !!tk?.enabled,
      period: tk?.mode === "period"
        ? periodValueFromConfig(tk.period, "30d")
        : { preset: "current", customFrom: "", customTo: "" },
      category: tk?.category ?? "all",
      queries: tk?.queries ?? [],
    },
    web: {
      enabled: !!s?.web?.enabled,
      period: periodValueFromConfig(s?.web?.period, "30d"),
      sites: initialWebSites(s?.web),
    },
    fanstore: {
      enabled: !!s?.fanstore?.enabled,
      period: periodValueFromConfig(s?.fanstore?.period, "30d"),
      products: s?.fanstore?.products ?? [],
    },
  };
}

function toPeriodConfig(p: PeriodValue): PeriodConfig {
  if (p.preset === "custom") return { preset: "custom", from: p.customFrom, to: p.customTo };
  return { preset: p.preset };
}

function buildSources(state: WizardState): ReportSources {
  const sources: ReportSources = {};
  if (state.dm.enabled) {
    sources.dm = {
      enabled: true,
      period: toPeriodConfig(state.dm.period),
      ...(state.dm.queries.length > 0 && { queries: state.dm.queries }),
    };
  }
  if (state.ticketing.enabled) {
    const isPeriod = state.ticketing.period.preset !== "current";
    sources.ticketing = {
      enabled: true,
      mode: isPeriod ? "period" : "current",
      ...(isPeriod && { period: toPeriodConfig(state.ticketing.period) }),
      ...(state.ticketing.queries.length > 0 && { queries: state.ticketing.queries }),
      ...(state.ticketing.category !== "all" && { category: state.ticketing.category }),
    };
  }
  if (state.web.enabled) {
    sources.web = {
      enabled: true,
      period: toPeriodConfig(state.web.period),
      sites: state.web.sites.map((s) => ({
        site: s.site,
        ...(s.paths.length > 0 && { paths: s.paths }),
      })),
    };
  }
  if (state.fanstore.enabled) {
    sources.fanstore = {
      enabled: true,
      period: toPeriodConfig(state.fanstore.period),
      ...(state.fanstore.products.length > 0 && { products: state.fanstore.products }),
    };
  }
  return sources;
}

function periodComplete(p: PeriodValue): boolean {
  if (p.preset === "custom") return !!(p.customFrom && p.customTo);
  return true;
}

/* ---------- Loaders voor de keuzelijsten ---------- */

async function loadMailings(range: { from: string; to: string }, signal: AbortSignal): Promise<string[]> {
  const res = await fetch(`/api/maileon?from=${range.from}&to=${range.to}`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  const mailings = (json.mailings ?? []) as { name?: string; subject?: string }[];
  const names = new Set<string>();
  for (const m of mailings) {
    const stripped = stripName(m.name ?? "");
    if (stripped) names.add(stripped);
    if (m.subject) names.add(m.subject);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "nl"));
}

async function loadEvents(category: string, signal: AbortSignal): Promise<string[]> {
  const res = await fetch("/api/ticket-feed", { signal });
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  const events = (json.events ?? []) as { eventName?: string; category?: string }[];
  const names = new Set<string>();
  for (const e of events) {
    const n = e.eventName?.trim();
    if (!n) continue;
    const lower = n.toLowerCase();
    if (lower.startsWith("package") || lower.startsWith("fietsenstalling") || lower.startsWith("psv direct")) continue;
    if (category && category !== "all" && e.category !== category) continue;
    names.add(n);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "nl"));
}

/** Alle pagina's per site binnen het exacte datumbereik — niet alleen de top 10,
 *  zodat elke pagina selecteerbaar is. */
async function fetchPagesByRange(range: { from: string; to: string }): Promise<Record<string, string[]>> {
  const params = new URLSearchParams({
    from: range.from,
    to: range.to,
    pageLimit: String(PAGE_SELECT_LIMIT),
  });
  const res = await fetch(`/api/analytics?${params}`);
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  const sites = (json.sites ?? {}) as Record<string, { topPages?: { path: string }[] } | undefined>;
  const bySite: Record<string, string[]> = {};
  for (const [key, data] of Object.entries(sites)) {
    bySite[key] = [...new Set((data?.topPages ?? []).map((p) => p.path).filter(Boolean))];
  }
  return bySite;
}

/** Eén analytics-call levert álle sites. De pagina-lijsten van de aangevinkte
 *  sites delen daarom per datumbereik dezelfde request. */
const pagesByRange = new Map<string, Promise<Record<string, string[]>>>();

function loadPagesByRange(range: { from: string; to: string }): Promise<Record<string, string[]>> {
  const key = `${range.from}|${range.to}`;
  let inflight = pagesByRange.get(key);
  if (!inflight) {
    inflight = fetchPagesByRange(range).catch((err) => {
      pagesByRange.delete(key); // een fout niet blijvend cachen
      throw err;
    });
    pagesByRange.set(key, inflight);
  }
  return inflight;
}

async function loadPages(site: string, range: { from: string; to: string }, signal: AbortSignal): Promise<string[]> {
  const bySite = await loadPagesByRange(range);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return bySite[site] ?? [];
}

async function loadProducts(range: { from: string; to: string }, signal: AbortSignal): Promise<string[]> {
  const res = await fetch(`/api/fanstore-analytics?startDate=${range.from}&endDate=${range.to}&limit=100`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  const products = (json.topProducts ?? []) as { name?: string }[];
  return [...new Set(products.map((p) => p.name?.trim()).filter((n): n is string => !!n))];
}

/* ---------- Wizard ---------- */

const STEPS = [
  { key: "report", label: "Rapport" },
  { key: "sources", label: "Inzichten" },
  { key: "configure", label: "Configureren" },
  { key: "review", label: "Controleren" },
];

export function ReportWizard({
  initial, onSaved, onClose,
}: {
  initial: ReportRecord | null;
  onSaved: (report: ReportRecord) => void;
  onClose: () => void;
}) {
  const isEditing = initial !== null;
  const [state, setState] = useState<WizardState>(() => initialState(initial));
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [activeSource, setActiveSource] = useState<SourceKey>("dm");

  const [submitStatus, setSubmitStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  const enabledSources = useMemo(
    () => SOURCE_META.filter((m) => state[m.key].enabled),
    [state]
  );

  // Validatie per stap.
  const stepValid = useMemo(() => {
    switch (step) {
      case 0: return state.title.trim().length > 0;
      case 1: return enabledSources.length > 0;
      case 2: return enabledSources.every((m) => periodComplete(state[m.key].period))
        && (!state.web.enabled || state.web.sites.length > 0);
      default: return true;
    }
  }, [step, state, enabledSources]);

  function patch<K extends SourceKey>(key: K, value: Partial<WizardState[K]>) {
    setState((s) => ({ ...s, [key]: { ...s[key], ...value } }));
  }

  function toggleSource(key: SourceKey) {
    setState((s) => ({ ...s, [key]: { ...s[key], enabled: !s[key].enabled } }));
  }

  function goNext() {
    if (!stepValid) return;
    // Bij binnenkomst configureer-stap: focus eerste ingeschakelde bron.
    if (step === 1 && enabledSources.length > 0) {
      setActiveSource(enabledSources[0].key);
    }
    const next = Math.min(step + 1, STEPS.length - 1);
    setStep(next);
    setFurthest((f) => Math.max(f, next));
  }

  function goBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  function goToStep(i: number) {
    if (i <= furthest) setStep(i);
  }

  async function handleSubmit() {
    setSubmitStatus("loading");
    setError("");
    const payload: ReportInput = {
      title: state.title.trim(),
      ...(state.intro.trim() && { intro: state.intro.trim() }),
      sources: buildSources(state),
    };
    try {
      const res = await fetch(isEditing ? `/api/reports/${initial.id}` : "/api/reports", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Opslaan rapport mislukt.");
        setSubmitStatus("error");
        return;
      }
      const report = data.report as ReportRecord;
      const url = `${window.location.origin}/share/rapportage?id=${report.id}`;
      setShareUrl(url);
      setSubmitStatus("success");
      onSaved(report);
      try {
        await navigator.clipboard.writeText(url);
        setCopyStatus("copied");
      } catch { /* clipboard kan falen buiten secure context */ }
    } catch {
      setError("Kon de server niet bereiken. Probeer het opnieuw.");
      setSubmitStatus("error");
    }
  }

  /* ---------- Succes ---------- */
  if (submitStatus === "success" && shareUrl) {
    return (
      <Card className="max-w-2xl">
        <CardContent className="pt-6 pb-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
              <Check className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-heading uppercase tracking-wide">
                {isEditing ? "Rapport bijgewerkt" : "Rapport aangemaakt"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Deel deze link — de pagina ververst de data automatisch.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <Link2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <code className="flex-1 truncate text-xs">{shareUrl}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => {
              navigator.clipboard.writeText(shareUrl).then(() => setCopyStatus("copied")).catch(() => {});
            }}>
              {copyStatus === "copied" ? "Gekopieerd" : "Kopieer"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                <ExternalLink className="h-4 w-4" /> Open rapport
              </a>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Terug naar overzicht
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-xl font-heading uppercase tracking-wide">
          {isEditing ? "Rapport bewerken" : "Nieuw rapport"}
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
          <X className="h-4 w-4" /> Sluiten
        </Button>
      </div>

      <StepIndicator steps={STEPS} current={step} furthest={furthest} onStepClick={goToStep} />

      {/* Stap 1 — Rapport */}
      {step === 0 && (
        <div className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-sm font-heading uppercase tracking-wide">Titel</Label>
            <Input
              id="title"
              value={state.title}
              onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
              placeholder="Bijv. Voorverkoop seizoenkaarten 2026/27"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="intro" className="text-sm font-heading uppercase tracking-wide">
              Korte introductie <span className="font-normal normal-case text-muted-foreground">(optioneel)</span>
            </Label>
            <Textarea
              id="intro"
              value={state.intro}
              onChange={(e) => setState((s) => ({ ...s, intro: e.target.value }))}
              placeholder="Korte toelichting die bovenaan het rapport verschijnt."
              rows={3}
              maxLength={1000}
            />
          </div>
        </div>
      )}

      {/* Stap 2 — Inzichten */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Kies welke inzichten in dit rapport komen.</p>
          {SOURCE_META.map((m) => {
            const active = state[m.key].enabled;
            const Icon = m.icon;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => toggleSource(m.key)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md border p-4 text-left transition-colors",
                  active ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/50 hover:bg-accent/30"
                )}
              >
                <span className={cn(
                  "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm border",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-input"
                )}>
                  {active && <Check className="h-3.5 w-3.5" />}
                </span>
                <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", active ? "text-primary" : "text-muted-foreground")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-heading uppercase tracking-wide">{m.label}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{m.description}</span>
                </span>
              </button>
            );
          })}
          {enabledSources.length === 0 && (
            <p className="text-xs text-destructive">Kies minstens één inzicht.</p>
          )}
        </div>
      )}

      {/* Stap 3 — Configureren */}
      {step === 2 && (
        <div className="space-y-4">
          {enabledSources.length > 1 && (
            <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
              {enabledSources.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setActiveSource(m.key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-heading uppercase tracking-wide transition-colors",
                      activeSource === m.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" /> {m.short}
                  </button>
                );
              })}
            </div>
          )}
          {enabledSources.map((m) => (
            <div key={m.key} className={cn(activeSource === m.key ? "block" : "hidden", "space-y-5")}>
              <SourceConfigPanel sourceKey={m.key} state={state} patch={patch} />
            </div>
          ))}
        </div>
      )}

      {/* Stap 4 — Controleren */}
      {step === 3 && (
        <ReviewStep state={state} enabledSources={enabledSources} error={error} />
      )}

      {/* Navigatie */}
      <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={step === 0 ? onClose : goBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> {step === 0 ? "Annuleren" : "Terug"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={goNext} disabled={!stepValid} className="gap-1.5">
            Volgende <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" onClick={handleSubmit} disabled={submitStatus === "loading"}>
            {submitStatus === "loading" ? "Opslaan…" : isEditing ? "Wijzigingen opslaan" : "Maak rapport"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------- Per-bron configuratie-paneel ---------- */

function SourceConfigPanel({
  sourceKey, state, patch,
}: {
  sourceKey: SourceKey;
  state: WizardState;
  patch: WizardPatch;
}) {
  const meta = SOURCE_META.find((m) => m.key === sourceKey)!;
  const Icon = meta.icon;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-psv-red-primary" />
        <h3 className="text-base font-heading uppercase tracking-wide">{meta.label}</h3>
      </div>

      {/* Periode */}
      <div className="space-y-1.5">
        <Label className="text-sm font-heading uppercase tracking-wide">Periode</Label>
        <PeriodPicker
          value={state[sourceKey].period}
          onChange={(next) => patch(sourceKey, { period: next } as Partial<WizardState[typeof sourceKey]>)}
          presets={PRESETS_BY_SOURCE[sourceKey]}
          allowCustom={SOURCE_ALLOWS_CUSTOM[sourceKey]}
          hint={sourceKey === "ticketing" ? "Historische verkoop is dagelijks bijgehouden, maximaal 30 dagen terug." : undefined}
        />
      </div>

      {sourceKey === "dm" && <DmConfig state={state} patch={patch} />}
      {sourceKey === "ticketing" && <TicketingConfig state={state} patch={patch} />}
      {sourceKey === "web" && <WebConfig state={state} patch={patch} />}
      {sourceKey === "fanstore" && <FanstoreConfig state={state} patch={patch} />}
    </div>
  );
}

function DmConfig({ state, patch }: { state: WizardState; patch: WizardPatch }) {
  const range = resolvePeriodValue(state.dm.period);
  const depKey = `dm:${range?.from ?? ""}:${range?.to ?? ""}`;
  return (
    <ItemChecklist
      label="Mailings"
      depKey={depKey}
      disabled={!range}
      disabledHint="Kies eerst een geldige periode om mailings te laden."
      load={(signal) => loadMailings(range!, signal)}
      values={state.dm.queries}
      onChange={(next) => patch("dm", { queries: next })}
      searchPlaceholder="Zoek mailing op naam of onderwerp…"
      emptyAllHint="Leeg = alle mailings in deze periode."
    />
  );
}

function TicketingConfig({ state, patch }: { state: WizardState; patch: WizardPatch }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-sm font-heading uppercase tracking-wide">Categorie</Label>
        <Select value={state.ticketing.category} onValueChange={(v) => patch("ticketing", { category: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {TICKET_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <ItemChecklist
        label="Events"
        depKey={`tk:${state.ticketing.category}`}
        load={(signal) => loadEvents(state.ticketing.category, signal)}
        values={state.ticketing.queries}
        onChange={(next) => patch("ticketing", { queries: next })}
        searchPlaceholder="Zoek event…"
        emptyAllHint="Leeg = alle events in deze categorie."
      />
    </>
  );
}

function WebConfig({ state, patch }: { state: WizardState; patch: WizardPatch }) {
  const range = resolvePeriodValue(state.web.period);
  const selected = state.web.sites;

  // WEB_SITES plus eventuele onbekende sites uit een bestaand rapport, zodat een
  // bestaande selectie nooit stil verdwijnt.
  const siteOptions = useMemo(() => [
    ...WEB_SITES,
    ...selected
      .filter((s) => !WEB_SITES.some((w) => w.value === s.site))
      .map((s) => ({ value: s.site, label: s.site })),
  ], [selected]);

  // Vaste weergave-volgorde, onafhankelijk van de aanvinkvolgorde.
  const activeOptions = siteOptions.filter((o) => selected.some((s) => s.site === o.value));

  function toggleSite(site: string) {
    const next = selected.some((s) => s.site === site)
      ? selected.filter((s) => s.site !== site)
      : [...selected, { site, paths: [] }];
    patch("web", { sites: next });
  }

  function setPaths(site: string, paths: string[]) {
    patch("web", { sites: selected.map((s) => (s.site === site ? { ...s, paths } : s)) });
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-sm font-heading uppercase tracking-wide">Sites</Label>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {siteOptions.map((o) => {
            const active = selected.some((s) => s.site === o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggleSite(o.value)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:border-primary/50 hover:bg-accent/30"
                )}
              >
                <span className={cn(
                  "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm border",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-input"
                )}>
                  {active && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
        {selected.length === 0 ? (
          <p className="text-xs text-destructive">Kies minstens één site.</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Per site kies je hieronder de pagina&apos;s. Alle sites gebruiken dezelfde periode.
          </p>
        )}
      </div>

      {activeOptions.map((o) => (
        <ItemChecklist
          key={o.value}
          label={`Pagina's — ${o.label}`}
          depKey={`web:${o.value}:${range?.from ?? ""}:${range?.to ?? ""}`}
          disabled={!range}
          disabledHint="Kies eerst een geldige periode om pagina's te laden."
          load={(signal) => loadPages(o.value, range!, signal)}
          values={selected.find((s) => s.site === o.value)?.paths ?? []}
          onChange={(next) => setPaths(o.value, next)}
          searchPlaceholder="Zoek pagina-pad…"
          emptyAllHint={`Leeg = alle pagina's van ${o.label}.`}
        />
      ))}
    </>
  );
}

function FanstoreConfig({ state, patch }: { state: WizardState; patch: WizardPatch }) {
  const range = resolvePeriodValue(state.fanstore.period);
  const depKey = `fs:${range?.from ?? ""}:${range?.to ?? ""}`;
  return (
    <ItemChecklist
      label="Producten"
      depKey={depKey}
      disabled={!range}
      disabledHint="Kies eerst een geldige periode om producten te laden."
      load={(signal) => loadProducts(range!, signal)}
      values={state.fanstore.products}
      onChange={(next) => patch("fanstore", { products: next })}
      searchPlaceholder="Zoek product…"
      emptyAllHint="Leeg = de hele winkel."
    />
  );
}

type WizardPatch = <K extends SourceKey>(key: K, value: Partial<WizardState[K]>) => void;

/* ---------- Controleren-stap ---------- */

function ReviewStep({
  state, enabledSources, error,
}: {
  state: WizardState;
  enabledSources: typeof SOURCE_META;
  error: string;
}) {
  function selectionSummary(key: SourceKey): string {
    if (key === "dm") return state.dm.queries.length > 0 ? `${state.dm.queries.length} mailings` : "Alle mailings";
    if (key === "ticketing") return state.ticketing.queries.length > 0 ? `${state.ticketing.queries.length} events` : "Alle events";
    if (key === "web") {
      const paths = state.web.sites.reduce((total, s) => total + s.paths.length, 0);
      return paths > 0 ? `${paths} pagina's` : "Alle pagina's";
    }
    return state.fanstore.products.length > 0 ? `${state.fanstore.products.length} producten` : "Hele winkel";
  }

  function periodSummary(key: SourceKey): string {
    const p = state[key].period;
    return periodLabel(toPeriodConfig(p));
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-lg font-heading uppercase tracking-wide">{state.title || "Naamloos rapport"}</p>
        {state.intro && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{state.intro}</p>}
      </div>

      <div className="space-y-2">
        {enabledSources.map((m) => {
          const Icon = m.icon;
          const extra = m.key === "web"
            ? ` · ${state.web.sites.map((s) => WEB_SITES.find((w) => w.value === s.site)?.label ?? s.site).join(", ")}`
            : m.key === "ticketing" && state.ticketing.category !== "all" ? ` · ${state.ticketing.category}`
            : "";
          return (
            <div key={m.key} className="flex items-center gap-3 rounded-md border px-4 py-3">
              <Icon className="h-5 w-5 flex-shrink-0 text-psv-red-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-heading uppercase tracking-wide">{m.label}</p>
                <p className="text-xs text-muted-foreground">
                  {periodSummary(m.key)}{extra} · {selectionSummary(m.key)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">{error}</p>
      )}
    </div>
  );
}
