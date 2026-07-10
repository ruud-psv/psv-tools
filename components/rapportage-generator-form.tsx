"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mail, Ticket, Globe, ShoppingBag, Link2, Check, ExternalLink, X,
  Pencil, Trash2, Copy, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getDateRange, stripName, periodForRange, formatDateTime } from "@/lib/dm-share";
import type { ReportRecord } from "@/lib/reports";

const PRESETS: { value: string; label: string }[] = [
  { value: "7d", label: "Laatste 7 dagen" },
  { value: "30d", label: "Laatste 30 dagen" },
  { value: "90d", label: "Laatste 90 dagen" },
  { value: "6m", label: "Laatste 6 maanden" },
  { value: "1y", label: "Laatste jaar" },
  { value: "seizoen2425", label: "Seizoen 2024/25" },
  { value: "seizoen2526", label: "Seizoen 2025/26" },
  { value: "custom", label: "Aangepaste periode" },
];

const TICKET_CATEGORIES = [
  { value: "all", label: "Alle categorieën" },
  { value: "Wedstrijden", label: "Wedstrijden" },
  { value: "Tours", label: "Tours" },
  { value: "Museum", label: "Museum" },
  { value: "Jeugd", label: "Jeugd" },
  { value: "Evenementen", label: "Evenementen" },
];

const WEB_SITES = [
  { value: "psv", label: "psv.nl" },
  { value: "ticketshop", label: "ticketshop.psv.nl" },
  { value: "fanstore", label: "psvfanstore.nl" },
  { value: "acties", label: "acties.psv.nl" },
];

const SOURCE_LABELS: { key: keyof SourceState; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "dm", label: "DM", icon: Mail },
  { key: "ticketing", label: "Ticketing", icon: Ticket },
  { key: "web", label: "Web", icon: Globe },
  { key: "fanstore", label: "Fanstore", icon: ShoppingBag },
];

interface SourceState {
  dm: { enabled: boolean; queries: string[] };
  ticketing: { enabled: boolean; queries: string[]; category: string };
  web: { enabled: boolean; site: string; paths: string[] };
  fanstore: { enabled: boolean; products: string[] };
}

const INITIAL_SOURCES: SourceState = {
  dm: { enabled: true, queries: [] },
  ticketing: { enabled: false, queries: [], category: "all" },
  web: { enabled: false, site: "psv", paths: [] },
  fanstore: { enabled: false, products: [] },
};

function sourcesFromRecord(record: ReportRecord): SourceState {
  return {
    dm: { enabled: !!record.sources.dm?.enabled, queries: record.sources.dm?.queries ?? [] },
    ticketing: {
      enabled: !!record.sources.ticketing?.enabled,
      queries: record.sources.ticketing?.queries ?? [],
      category: record.sources.ticketing?.category ?? "all",
    },
    web: { enabled: !!record.sources.web?.enabled, site: record.sources.web?.site ?? "psv", paths: record.sources.web?.paths ?? [] },
    fanstore: { enabled: !!record.sources.fanstore?.enabled, products: record.sources.fanstore?.products ?? [] },
  };
}

function TagMultiInput({
  id, listId, values, onChange, suggestions, placeholder,
}: {
  id: string;
  listId: string;
  values: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(raw: string) {
    const v = raw.trim();
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  }

  function remove(target: string) {
    onChange(values.filter((x) => x !== target));
  }

  return (
    <div
      className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background"
      onClick={() => inputRef.current?.focus()}
    >
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary"
        >
          <span className="max-w-[14rem] truncate">{v}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); remove(v); }}
            className="rounded hover:bg-primary/20"
            aria-label={`Verwijder ${v}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
            e.preventDefault();
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => { if (draft.trim()) commit(draft); }}
        placeholder={values.length === 0 ? placeholder : ""}
        autoComplete="off"
        className="flex-1 min-w-[12rem] bg-transparent outline-none placeholder:text-muted-foreground"
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()))
          .map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}

function SourceToggle({
  active, label, description, icon: Icon, onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-md border p-4 text-left transition-colors w-full",
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-background hover:border-primary/50 hover:bg-accent/30"
      )}
    >
      <div className={cn(
        "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm border",
        active ? "border-primary bg-primary text-primary-foreground" : "border-input"
      )}>
        {active && <Check className="h-3.5 w-3.5" />}
      </div>
      <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", active ? "text-primary" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-heading uppercase tracking-wide">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  );
}

/* ---------- Rapport formulier ---------- */

function ReportForm({
  initial, onSaved, onCancelEdit,
}: {
  initial: ReportRecord | null;
  onSaved: (report: ReportRecord) => void;
  onCancelEdit: () => void;
}) {
  const isEditing = initial !== null;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [intro, setIntro] = useState(initial?.intro ?? "");
  const initialPreset = initial ? (initial.preset ?? "custom") : "30d";
  const [preset, setPreset] = useState(initialPreset);
  const [customFrom, setCustomFrom] = useState(initial && initialPreset === "custom" ? initial.from : "");
  const [customTo, setCustomTo] = useState(initial && initialPreset === "custom" ? initial.to : "");
  const [sources, setSources] = useState<SourceState>(initial ? sourcesFromRecord(initial) : INITIAL_SOURCES);

  const [submitStatus, setSubmitStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  const anySourceEnabled =
    sources.dm.enabled || sources.ticketing.enabled || sources.web.enabled || sources.fanstore.enabled;
  const customRangeValid = preset !== "custom" || (customFrom && customTo);
  const canSubmit = title.trim().length > 0 && anySourceEnabled && customRangeValid;

  const previewRange = useMemo(() => {
    if (preset === "custom") {
      if (!customFrom || !customTo) return null;
      return { from: customFrom, to: customTo };
    }
    return getDateRange(preset);
  }, [preset, customFrom, customTo]);

  // Autocomplete suggestions
  const [mailingSuggestions, setMailingSuggestions] = useState<string[]>([]);
  const [eventSuggestions, setEventSuggestions] = useState<string[]>([]);
  const [pageSuggestions, setPageSuggestions] = useState<string[]>([]);
  const [productSuggestions, setProductSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (!sources.dm.enabled || !previewRange) { setMailingSuggestions([]); return; }
    const ctrl = new AbortController();
    fetch(`/api/maileon?from=${previewRange.from}&to=${previewRange.to}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        const mailings = (json.mailings ?? []) as { name?: string; subject?: string }[];
        const names = new Set<string>();
        for (const m of mailings) {
          const stripped = stripName(m.name ?? "");
          if (stripped) names.add(stripped);
          if (m.subject) names.add(m.subject);
        }
        setMailingSuggestions([...names].sort((a, b) => a.localeCompare(b, "nl")));
      })
      .catch(() => { /* ignore aborts and errors — suggestions are best-effort */ });
    return () => ctrl.abort();
  }, [sources.dm.enabled, previewRange]);

  useEffect(() => {
    if (!sources.ticketing.enabled) { setEventSuggestions([]); return; }
    const ctrl = new AbortController();
    fetch("/api/ticket-feed", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        const events = (json.events ?? []) as { eventName?: string; category?: string }[];
        const cat = sources.ticketing.category;
        const names = new Set<string>();
        for (const e of events) {
          const n = e.eventName?.trim();
          if (!n) continue;
          if (n.toLowerCase().startsWith("package")) continue;
          if (n.toLowerCase().startsWith("fietsenstalling")) continue;
          if (n.toLowerCase().startsWith("psv direct")) continue;
          if (cat && cat !== "all" && e.category !== cat) continue;
          names.add(n);
        }
        setEventSuggestions([...names].sort((a, b) => a.localeCompare(b, "nl")));
      })
      .catch(() => { /* ignore */ });
    return () => ctrl.abort();
  }, [sources.ticketing.enabled, sources.ticketing.category]);

  useEffect(() => {
    if (!sources.web.enabled || !previewRange) { setPageSuggestions([]); return; }
    const ctrl = new AbortController();
    const period = periodForRange(previewRange.from, previewRange.to);
    fetch(`/api/analytics?period=${period}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        const site = json.sites?.[sources.web.site] as { topPages?: { path: string }[] } | undefined;
        const paths = (site?.topPages ?? []).map((p) => p.path).filter(Boolean);
        setPageSuggestions([...new Set(paths)]);
      })
      .catch(() => { /* ignore */ });
    return () => ctrl.abort();
  }, [sources.web.enabled, sources.web.site, previewRange]);

  useEffect(() => {
    if (!sources.fanstore.enabled || !previewRange) { setProductSuggestions([]); return; }
    const ctrl = new AbortController();
    fetch(`/api/fanstore-analytics?startDate=${previewRange.from}&endDate=${previewRange.to}&limit=100`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        const products = (json.topProducts ?? []) as { name?: string }[];
        const names = products.map((p) => p.name?.trim()).filter((n): n is string => !!n);
        setProductSuggestions([...new Set(names)]);
      })
      .catch(() => { /* ignore */ });
    return () => ctrl.abort();
  }, [sources.fanstore.enabled, previewRange]);

  function toggleSource<K extends keyof SourceState>(key: K) {
    setSources((s) => ({ ...s, [key]: { ...s[key], enabled: !s[key].enabled } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitStatus("loading");
    setError("");
    setShareUrl("");
    setCopyStatus("idle");

    const range = previewRange ?? getDateRange("30d");
    const payload = {
      title: title.trim(),
      ...(intro.trim() && { intro: intro.trim() }),
      preset,
      from: range.from,
      to: range.to,
      sources: {
        ...(sources.dm.enabled && {
          dm: { enabled: true as const, ...(sources.dm.queries.length > 0 && { queries: sources.dm.queries }) },
        }),
        ...(sources.ticketing.enabled && {
          ticketing: {
            enabled: true as const,
            ...(sources.ticketing.queries.length > 0 && { queries: sources.ticketing.queries }),
            ...(sources.ticketing.category !== "all" && { category: sources.ticketing.category }),
          },
        }),
        ...(sources.web.enabled && {
          web: {
            enabled: true as const,
            site: sources.web.site,
            ...(sources.web.paths.length > 0 && { paths: sources.web.paths }),
          },
        }),
        ...(sources.fanstore.enabled && {
          fanstore: {
            enabled: true as const,
            ...(sources.fanstore.products.length > 0 && { products: sources.fanstore.products }),
          },
        }),
      },
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
      } catch {
        // clipboard write can fail in non-secure contexts; user can still copy manually
      }
    } catch {
      setError("Kon de server niet bereiken. Probeer het opnieuw.");
      setSubmitStatus("error");
    }
  }

  function copyUrl() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => setCopyStatus("copied")).catch(() => {});
  }

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
            <Button type="button" variant="outline" size="sm" onClick={copyUrl}>
              {copyStatus === "copied" ? "Gekopieerd" : "Kopieer"}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                <ExternalLink className="h-4 w-4" />
                Open rapport
              </a>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onCancelEdit}>
              Nieuw rapport maken
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {isEditing && (
        <div className="flex items-center justify-between rounded-md border border-psv-gold/40 bg-psv-gold/10 px-4 py-2.5">
          <p className="text-sm">
            <span className="font-heading uppercase tracking-wide text-xs">Bewerken:</span>{" "}
            {initial.title}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit}>
            Annuleren
          </Button>
        </div>
      )}

      {/* Titel */}
      <div className="space-y-1.5">
        <Label htmlFor="title" className="text-sm font-heading uppercase tracking-wide">
          Titel
        </Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Bijv. Voorverkoop seizoenkaarten 2026/27"
          required
        />
      </div>

      {/* Introductie */}
      <div className="space-y-1.5">
        <Label htmlFor="intro" className="text-sm font-heading uppercase tracking-wide">
          Korte introductie <span className="font-normal normal-case text-muted-foreground">(optioneel)</span>
        </Label>
        <Textarea
          id="intro"
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          placeholder="Korte toelichting die bovenaan het rapport verschijnt, bijv. context van de campagne of wat de lezer moet weten."
          rows={3}
          maxLength={1000}
        />
      </div>

      {/* Periode */}
      <div className="space-y-1.5">
        <Label className="text-sm font-heading uppercase tracking-wide">Periode</Label>
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="space-y-1">
              <Label htmlFor="custom-from" className="text-xs text-muted-foreground">Van</Label>
              <Input
                id="custom-from"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="custom-to" className="text-xs text-muted-foreground">Tot</Label>
              <Input
                id="custom-to"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          </div>
        )}
        {previewRange && (
          <p className="text-xs text-muted-foreground">{previewRange.from} t/m {previewRange.to}</p>
        )}
      </div>

      {/* Bronnen */}
      <div className="space-y-3">
        <Label className="text-sm font-heading uppercase tracking-wide">Inzichten in dit rapport</Label>

        <SourceToggle
          active={sources.dm.enabled}
          label="DM Performance"
          description="Mailings, open rates, click rates en uitschrijvingen uit Maileon."
          icon={Mail}
          onClick={() => toggleSource("dm")}
        />
        {sources.dm.enabled && (
          <div className="ml-8 space-y-1.5">
            <Label htmlFor="dm-query" className="text-xs text-muted-foreground">
              Selecteer mailings op naam/onderwerp <span className="font-normal">(optioneel, meerdere mogelijk)</span>
            </Label>
            <TagMultiInput
              id="dm-query"
              listId="dm-suggestions"
              values={sources.dm.queries}
              onChange={(next) => setSources((s) => ({ ...s, dm: { ...s.dm, queries: next } }))}
              suggestions={mailingSuggestions}
              placeholder={mailingSuggestions.length > 0 ? "Typ en kies, of druk Enter" : "Bijv. seizoenkaart"}
            />
            {mailingSuggestions.length > 0 && (
              <p className="text-xs text-muted-foreground">{mailingSuggestions.length} mailings beschikbaar in deze periode</p>
            )}
          </div>
        )}

        <SourceToggle
          active={sources.ticketing.enabled}
          label="Ticketing"
          description="Actuele beschikbaarheid en verkoop van events uit de ticketshop."
          icon={Ticket}
          onClick={() => toggleSource("ticketing")}
        />
        {sources.ticketing.enabled && (
          <div className="ml-8 grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ticket-query" className="text-xs text-muted-foreground">
                Filter eventnaam <span className="font-normal">(optioneel, meerdere mogelijk)</span>
              </Label>
              <TagMultiInput
                id="ticket-query"
                listId="ticket-suggestions"
                values={sources.ticketing.queries}
                onChange={(next) => setSources((s) => ({ ...s, ticketing: { ...s.ticketing, queries: next } }))}
                suggestions={eventSuggestions}
                placeholder={eventSuggestions.length > 0 ? "Typ en kies, of druk Enter" : "Bijv. PSV - Ajax"}
              />
              {eventSuggestions.length > 0 && (
                <p className="text-xs text-muted-foreground">{eventSuggestions.length} events beschikbaar</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Categorie</Label>
              <Select
                value={sources.ticketing.category}
                onValueChange={(v) => setSources((s) => ({ ...s, ticketing: { ...s.ticketing, category: v } }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <SourceToggle
          active={sources.web.enabled}
          label="Web verkeer"
          description="Sessies, gebruikers en pageviews uit Google Analytics."
          icon={Globe}
          onClick={() => toggleSource("web")}
        />
        {sources.web.enabled && (
          <div className="ml-8 space-y-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Site</Label>
              <Select
                value={sources.web.site}
                onValueChange={(v) => setSources((s) => ({ ...s, web: { ...s.web, site: v, paths: [] } }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEB_SITES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="web-paths" className="text-xs text-muted-foreground">
                Selecteer specifieke pagina&apos;s <span className="font-normal">(optioneel, meerdere mogelijk — pad of pad-prefix)</span>
              </Label>
              <TagMultiInput
                id="web-paths"
                listId="web-page-suggestions"
                values={sources.web.paths}
                onChange={(next) => setSources((s) => ({ ...s, web: { ...s.web, paths: next } }))}
                suggestions={pageSuggestions}
                placeholder={pageSuggestions.length > 0 ? "Typ en kies, of druk Enter" : "Bijv. /seizoenkaart"}
              />
              {pageSuggestions.length > 0 && (
                <p className="text-xs text-muted-foreground">Suggesties op basis van de best bezochte pagina&apos;s</p>
              )}
            </div>
          </div>
        )}

        <SourceToggle
          active={sources.fanstore.enabled}
          label="Fanstore"
          description="Omzet, transacties en productverkoop uit de PSV Fanstore."
          icon={ShoppingBag}
          onClick={() => toggleSource("fanstore")}
        />
        {sources.fanstore.enabled && (
          <div className="ml-8 space-y-1.5">
            <Label htmlFor="fanstore-products" className="text-xs text-muted-foreground">
              Selecteer producten <span className="font-normal">(optioneel, meerdere mogelijk — leeg = hele winkel)</span>
            </Label>
            <TagMultiInput
              id="fanstore-products"
              listId="fanstore-product-suggestions"
              values={sources.fanstore.products}
              onChange={(next) => setSources((s) => ({ ...s, fanstore: { ...s.fanstore, products: next } }))}
              suggestions={productSuggestions}
              placeholder={productSuggestions.length > 0 ? "Typ en kies, of druk Enter" : "Bijv. Thuisshirt 2026/27"}
            />
            {productSuggestions.length > 0 && (
              <p className="text-xs text-muted-foreground">{productSuggestions.length} producten met verkoop in deze periode</p>
            )}
          </div>
        )}

        {!anySourceEnabled && (
          <p className="text-xs text-destructive">Kies minstens één inzicht voor het rapport.</p>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">
          {error}
        </p>
      )}

      <Button type="submit" disabled={!canSubmit || submitStatus === "loading"} className="w-full">
        {submitStatus === "loading"
          ? "Rapport opslaan..."
          : isEditing ? "Wijzigingen opslaan" : "Maak rapport"}
      </Button>
    </form>
  );
}

/* ---------- Lijst van aangemaakte rapporten ---------- */

function ReportList({
  reports, loading, error, onRefresh, onEdit, onDeleted,
}: {
  reports: ReportRecord[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onEdit: (report: ReportRecord) => void;
  onDeleted: (id: string) => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  function shareUrlFor(report: ReportRecord): string {
    return `${window.location.origin}/share/rapportage?id=${report.id}`;
  }

  function copyLink(report: ReportRecord) {
    navigator.clipboard.writeText(shareUrlFor(report))
      .then(() => {
        setCopiedId(report.id);
        setTimeout(() => setCopiedId((cur) => (cur === report.id ? null : cur)), 2000);
      })
      .catch(() => {});
  }

  async function handleDelete(report: ReportRecord) {
    setDeletingId(report.id);
    setDeleteError("");
    try {
      const res = await fetch(`/api/reports/${report.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error ?? "Verwijderen mislukt.");
        return;
      }
      onDeleted(report.id);
    } catch {
      setDeleteError("Kon de server niet bereiken. Probeer het opnieuw.");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-heading uppercase tracking-wide">Aangemaakte rapporten</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Vernieuwen
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">
          {error}
        </p>
      )}
      {deleteError && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">
          {deleteError}
        </p>
      )}

      {!error && !loading && reports.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-md border border-dashed px-4 py-6 text-center">
          Nog geen rapporten aangemaakt. Maak hierboven je eerste rapport.
        </p>
      )}

      {loading && reports.length === 0 && (
        <p className="text-sm text-muted-foreground px-1">Rapporten laden…</p>
      )}

      <div className="space-y-3">
        {reports.map((report) => {
          const activeSources = SOURCE_LABELS.filter(({ key }) => !!report.sources[key]?.enabled);
          return (
            <Card key={report.id}>
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-heading uppercase tracking-wide truncate">{report.title}</p>
                    {report.intro && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{report.intro}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {report.from} t/m {report.to} · door {report.createdBy} · {formatDateTime(report.createdAt)}
                      {report.updatedAt !== report.createdAt && " · bewerkt"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {activeSources.map(({ key, label, icon: Icon }) => (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary"
                      >
                        <Icon className="h-3 w-3" />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => copyLink(report)} className="gap-1.5">
                    <Copy className="h-3.5 w-3.5" />
                    {copiedId === report.id ? "Gekopieerd" : "Kopieer link"}
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`/share/rapportage?id=${report.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="gap-1.5"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </a>
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => onEdit(report)} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" />
                    Bewerk
                  </Button>
                  {confirmDeleteId === report.id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(report)}
                        disabled={deletingId === report.id}
                      >
                        {deletingId === report.id ? "Verwijderen…" : "Bevestig verwijderen"}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                        Annuleren
                      </Button>
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => { setConfirmDeleteId(report.id); setDeleteError(""); }}
                      className="gap-1.5 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Verwijder
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Hoofdcomponent ---------- */

export function RapportageGenerator() {
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [editing, setEditing] = useState<ReportRecord | null>(null);
  const [formKey, setFormKey] = useState(0);

  const loadReports = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const res = await fetch("/api/reports");
      const data = await res.json();
      if (!res.ok) {
        setListError(data.error ?? "Ophalen van rapporten mislukt.");
        return;
      }
      setReports(data.reports ?? []);
    } catch {
      setListError("Kon de server niet bereiken. Probeer het opnieuw.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  function startEdit(report: ReportRecord) {
    setEditing(report);
    setFormKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditing(null);
    setFormKey((k) => k + 1);
  }

  function handleSaved(report: ReportRecord) {
    setReports((prev) => {
      const without = prev.filter((r) => r.id !== report.id);
      return [report, ...without].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  function handleDeleted(id: string) {
    setReports((prev) => prev.filter((r) => r.id !== id));
    if (editing?.id === id) resetForm();
  }

  return (
    <div className="space-y-10">
      <ReportForm
        key={`${editing?.id ?? "new"}-${formKey}`}
        initial={editing}
        onSaved={handleSaved}
        onCancelEdit={resetForm}
      />
      <ReportList
        reports={reports}
        loading={listLoading}
        error={listError}
        onRefresh={loadReports}
        onEdit={startEdit}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
