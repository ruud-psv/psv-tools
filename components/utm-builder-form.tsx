"use client";

import { useState, useMemo } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { UtmTaxonomySelect } from "@/components/utm-taxonomy-select";
import { cn } from "@/lib/utils";
import type { UtmLinkRecord, UtmTaxonomy } from "@/lib/utm";

export function UtmBuilderForm({
  taxonomy,
  onAddTaxonomy,
  onSaved,
}: {
  taxonomy: UtmTaxonomy;
  onAddTaxonomy: (
    kind: "source" | "medium",
    value: string
  ) => Promise<{ value: string } | { error: string }>;
  /** Wordt aangeroepen zodra een link in het overzicht is opgeslagen. */
  onSaved: (link: UtmLinkRecord) => void;
}) {
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [term, setTerm] = useState("");
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const generatedUrl = useMemo(() => {
    if (!url) return "";

    let base = url.trim();
    if (!base.startsWith("http://") && !base.startsWith("https://")) {
      base = "https://" + base;
    }

    try {
      const parsed = new URL(base);
      if (source) parsed.searchParams.set("utm_source", source.trim());
      if (medium) parsed.searchParams.set("utm_medium", medium.trim());
      if (campaign) parsed.searchParams.set("utm_campaign", campaign.trim());
      if (term) parsed.searchParams.set("utm_term", term.trim());
      if (content) parsed.searchParams.set("utm_content", content.trim());
      return parsed.toString();
    } catch {
      return "";
    }
  }, [url, source, medium, campaign, term, content]);

  const isValid = generatedUrl !== "" && source !== "" && medium !== "" && campaign !== "";

  /** Kopieert de link én bewaart hem in het overzicht. */
  async function handleCopy() {
    if (!isValid || saving) return;

    setSaveError("");
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setSaveError("Kopiëren naar het klembord lukte niet. Selecteer de link hierboven handmatig.");
    }

    setSaving(true);
    try {
      const res = await fetch("/api/utm-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          source,
          medium,
          campaign: campaign.trim(),
          term: term.trim(),
          content: content.trim(),
          generatedUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error ?? "Opslaan in het overzicht mislukt.");
        return;
      }
      if (data.link) onSaved(data.link as UtmLinkRecord);
    } catch {
      setSaveError("Kon de server niet bereiken; de link is niet opgeslagen.");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setUrl("");
    setSource("");
    setMedium("");
    setCampaign("");
    setTerm("");
    setContent("");
    setCopied(false);
    setSaveError("");
  }

  return (
    <div className="space-y-6">
      {/* URL */}
      <div className="space-y-2">
        <Label htmlFor="url">
          Website URL <span className="text-destructive">*</span>
        </Label>
        <Input
          id="url"
          type="url"
          placeholder="https://www.psv.nl/pagina"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      <Separator />

      {/* Required UTM fields */}
      <div className="space-y-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Verplichte parameters
        </p>

        <div className="space-y-2">
          <Label htmlFor="source">
            Campagnebron (utm_source) <span className="text-destructive">*</span>
          </Label>
          <UtmTaxonomySelect
            id="source"
            value={source}
            options={taxonomy.sources}
            placeholder="Kies een bron"
            addLabel="Nieuwe bron toevoegen"
            addPlaceholder="Nieuwe bron, bijv. nieuwsbrief_b2b"
            onChange={setSource}
            onAdd={(value) => onAddTaxonomy("source", value)}
          />
          <p className="text-xs text-muted-foreground">
            Waar komt het verkeer vandaan?
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="medium">
            Campagnemedium (utm_medium) <span className="text-destructive">*</span>
          </Label>
          <UtmTaxonomySelect
            id="medium"
            value={medium}
            options={taxonomy.mediums}
            placeholder="Kies een medium"
            addLabel="Nieuw medium toevoegen"
            addPlaceholder="Nieuw medium, bijv. banner_top"
            onChange={setMedium}
            onAdd={(value) => onAddTaxonomy("medium", value)}
          />
          <p className="text-xs text-muted-foreground">
            Via welk kanaal of medium?
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="campaign">
            Campagnenaam (utm_campaign) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="campaign"
            placeholder="bijv. seizoenskaart_2025, partners_mailing"
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Naam van de specifieke campagne, promotie of mailing.
          </p>
        </div>
      </div>

      <Separator />

      {/* Optional UTM fields */}
      <div className="space-y-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Optionele parameters
        </p>

        <div className="space-y-2">
          <Label htmlFor="term">Campagneterm (utm_term)</Label>
          <Input
            id="term"
            placeholder="bijv. seizoenskaart, psv tickets"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Betaalde zoekwoorden voor zoekcampagnes.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="content">Campagne-inhoud (utm_content)</Label>
          <Input
            id="content"
            placeholder="bijv. logo_link, tekst_link, banner_a"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Onderscheid varianten binnen dezelfde campagne (A/B-testen).
          </p>
        </div>
      </div>

      {/* Preview */}
      {generatedUrl && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Gegenereerde link
            </p>
            <div
              className={cn(
                "rounded-md border bg-muted/50 px-3 py-2.5 text-sm break-all font-mono leading-relaxed",
                !isValid && "text-muted-foreground"
              )}
            >
              {generatedUrl}
            </div>
            {!isValid && (
              <p className="text-xs text-muted-foreground">
                Vul ook bron, medium en campagnenaam in om de link te activeren.
              </p>
            )}
          </div>
        </>
      )}

      {saveError && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">
          {saveError}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          type="button"
          onClick={handleCopy}
          disabled={!isValid || saving}
          className="flex-1 gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Opslaan…
            </>
          ) : copied ? (
            <>
              <Check className="h-4 w-4" />
              Gekopieerd &amp; opgeslagen!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Kopieer &amp; bewaar link
            </>
          )}
        </Button>
        <Button type="button" variant="outline" onClick={handleReset}>
          Wissen
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Elke gekopieerde link wordt bewaard in het overzicht hieronder.
      </p>
    </div>
  );
}
