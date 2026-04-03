"use client";

import { useState, useMemo } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function UtmBuilderForm() {
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [term, setTerm] = useState("");
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);

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

  async function handleCopy() {
    if (!isValid) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    setUrl("");
    setSource("");
    setMedium("");
    setCampaign("");
    setTerm("");
    setContent("");
    setCopied(false);
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
          <Input
            id="source"
            placeholder="bijv. google, nieuwsbrief, facebook"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Waar komt het verkeer vandaan?
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="medium">
            Campagnemedium (utm_medium) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="medium"
            placeholder="bijv. cpc, email, social, banner"
            value={medium}
            onChange={(e) => setMedium(e.target.value)}
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

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          type="button"
          onClick={handleCopy}
          disabled={!isValid}
          className="flex-1 gap-2"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Gekopieerd!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Kopieer link
            </>
          )}
        </Button>
        <Button type="button" variant="outline" onClick={handleReset}>
          Wissen
        </Button>
      </div>
    </div>
  );
}
