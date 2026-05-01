"use client";

import { useMemo, useState } from "react";
import { Mail, Ticket, Globe, Link2, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getDateRange } from "@/lib/dm-share";

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

interface SourceState {
  dm: { enabled: boolean; query: string };
  ticketing: { enabled: boolean; query: string; category: string };
  web: { enabled: boolean; site: string; path: string };
}

const INITIAL_SOURCES: SourceState = {
  dm: { enabled: true, query: "" },
  ticketing: { enabled: false, query: "", category: "all" },
  web: { enabled: false, site: "psv", path: "" },
};

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
        "flex items-start gap-3 rounded-md border p-4 text-left transition-colors",
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

export function RapportageGeneratorForm() {
  const [name, setName] = useState("");
  const [preset, setPreset] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sources, setSources] = useState<SourceState>(INITIAL_SOURCES);

  const [submitStatus, setSubmitStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  const anySourceEnabled = sources.dm.enabled || sources.ticketing.enabled || sources.web.enabled;
  const customRangeValid = preset !== "custom" || (customFrom && customTo);
  const canSubmit = name.trim().length > 0 && anySourceEnabled && customRangeValid;

  const previewRange = useMemo(() => {
    if (preset === "custom") {
      if (!customFrom || !customTo) return null;
      return { from: customFrom, to: customTo };
    }
    return getDateRange(preset);
  }, [preset, customFrom, customTo]);

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
      kind: "campaign" as const,
      name: name.trim(),
      from: range.from,
      to: range.to,
      sources: {
        ...(sources.dm.enabled && {
          dm: { enabled: true as const, ...(sources.dm.query.trim() && { query: sources.dm.query.trim() }) },
        }),
        ...(sources.ticketing.enabled && {
          ticketing: {
            enabled: true as const,
            ...(sources.ticketing.query.trim() && { query: sources.ticketing.query.trim() }),
            ...(sources.ticketing.category !== "all" && { category: sources.ticketing.category }),
          },
        }),
        ...(sources.web.enabled && {
          web: {
            enabled: true as const,
            site: sources.web.site,
            ...(sources.web.path.trim() && { path: sources.web.path.trim() }),
          },
        }),
      },
    };

    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Aanmaken rapport mislukt.");
        setSubmitStatus("error");
        return;
      }
      const url = `${window.location.origin}/share/rapportage?token=${data.token}`;
      setShareUrl(url);
      setSubmitStatus("success");
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

  function reset() {
    setSubmitStatus("idle");
    setShareUrl("");
    setCopyStatus("idle");
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
              <p className="text-sm font-heading uppercase tracking-wide">Rapport aangemaakt</p>
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
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              Nieuw rapport maken
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Campagnenaam */}
      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-sm font-heading uppercase tracking-wide">
          Campagnenaam
        </Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bijv. Voorverkoop seizoenkaarten 2026/27"
          required
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
              Filter mailingnaam/onderwerp <span className="font-normal">(optioneel)</span>
            </Label>
            <Input
              id="dm-query"
              value={sources.dm.query}
              onChange={(e) => setSources((s) => ({ ...s, dm: { ...s.dm, query: e.target.value } }))}
              placeholder="Bijv. seizoenkaart"
            />
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
                Filter eventnaam <span className="font-normal">(optioneel)</span>
              </Label>
              <Input
                id="ticket-query"
                value={sources.ticketing.query}
                onChange={(e) => setSources((s) => ({ ...s, ticketing: { ...s.ticketing, query: e.target.value } }))}
                placeholder="Bijv. PSV - Ajax"
              />
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
          <div className="ml-8 grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Site</Label>
              <Select
                value={sources.web.site}
                onValueChange={(v) => setSources((s) => ({ ...s, web: { ...s.web, site: v } }))}
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
              <Label htmlFor="web-path" className="text-xs text-muted-foreground">
                Pad-prefix <span className="font-normal">(optioneel)</span>
              </Label>
              <Input
                id="web-path"
                value={sources.web.path}
                onChange={(e) => setSources((s) => ({ ...s, web: { ...s.web, path: e.target.value } }))}
                placeholder="/seizoenkaart"
              />
            </div>
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
        {submitStatus === "loading" ? "Rapport aanmaken..." : "Maak rapport"}
      </Button>
    </form>
  );
}
