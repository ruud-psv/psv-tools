"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Monitor,
  Smartphone,
  Download,
  Copy,
  Check,
  Upload,
  AlertCircle,
  Moon,
  EyeOff,
  Mail,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TEMPLATE_BLOCKS } from "@/lib/mail-builder/blocks";
import { mailProblemen } from "@/lib/mail-builder/validate";
import type { MailRecord } from "@/lib/mail-builder/mails";
import { CollapsibleCard } from "@/components/mail-builder/shared/collapsible-card";
import { HeroBlock } from "@/components/mail-builder/blocks/HeroBlock";
import { TextBlocksEditor } from "@/components/mail-builder/blocks/TextBlocksEditor";
import { FooterBlock } from "@/components/mail-builder/blocks/FooterBlock";
import { FanstoreNavBlock } from "@/components/mail-builder/blocks/FanstoreNavBlock";
import { PsvPlayBlock } from "@/components/mail-builder/blocks/PsvPlayBlock";
import { BusinessSponsorBlock } from "@/components/mail-builder/blocks/BusinessSponsorBlock";
import { EnqueteCtaBlock } from "@/components/mail-builder/blocks/EnqueteCtaBlock";
import { PhoxyCtaBlock } from "@/components/mail-builder/blocks/PhoxyCtaBlock";
import { PrematchBlocksBlock } from "@/components/mail-builder/blocks/PrematchBlocksBlock";

import {
  DEVICE_PRESETS,
  applySimulations,
  generateEmailHTML,
  makeInitialState,
  migrateState,
} from "@/lib/mail-builder/html";
import type {
  DevicePreset,
  MailBuilderState,
  Simulation,
  Template,
} from "@/lib/mail-builder/html";

// De generator staat in lib/mail-builder/html.ts; deze namen blijven hier ook
// beschikbaar voor bestanden die ze al uit de Mail Builder importeerden.
export {
  BLOCK_BG_CONFIG,
  PREMATCH_BG_CONFIG,
  generateEmailHTML,
  makeInitialState,
  newBlock,
  newPrematchBlock,
  newPsvPlayItem,
} from "@/lib/mail-builder/html";
export type {
  BlockBg,
  BodyBlock,
  MailBuilderState,
  PrematchBg,
  PrematchBlock,
  PsvPlayItem,
  Template,
} from "@/lib/mail-builder/html";

export function RichTextEditor({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={() => onChange(ref.current?.innerHTML ?? "")}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        const html = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>");
        document.execCommand("insertHTML", false, html);
        onChange(ref.current?.innerHTML ?? "");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          document.execCommand("insertHTML", false, "<br>");
          onChange(ref.current?.innerHTML ?? "");
        } else if (e.metaKey || e.ctrlKey) {
          const cmdMap: Record<string, string> = { b: "bold", i: "italic", u: "underline" };
          const cmd = cmdMap[e.key.toLowerCase()];
          if (cmd) {
            e.preventDefault();
            document.execCommand(cmd, false);
            onChange(ref.current?.innerHTML ?? "");
          }
        }
      }}
      className={cn(
        "min-h-[80px] text-xs rounded-md border border-input bg-background px-3 py-2 overflow-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[2px]"
        )}
      />
    </button>
  );
}


// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const PREVIEW_HEIGHT = 820;

// Kaartverkoop is in okt 2026 opnieuw opgebouwd naar het Maileon-template; een
// concept van de oude versie hoort daar niet in terug te komen.
function draftKey(t: Template): string {
  return `mail-builder-draft-${t === "kaartverkoop" ? "kaartverkoop-2026-10" : t}`;
}

export function MailBuilderForm({
  onOpgeslagen,
}: {
  onOpgeslagen?: (mail: MailRecord) => void;
} = {}) {
  const [state, setState] = useState<MailBuilderState>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(draftKey("prematch"));
        if (saved) return migrateState(JSON.parse(saved));
      } catch {}
    }
    return makeInitialState("prematch");
  });

  const problemen = useMemo(() => mailProblemen(state), [state]);
  const [previewHtml, setPreviewHtml] = useState("");
  const [device, setDevice] = useState<DevicePreset>("desktop");
  const [simulations, setSimulations] = useState<Set<Simulation>>(new Set());
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [opslaanError, setOpslaanError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const uploadCallbackRef = useRef<((url: string) => void) | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Persist draft
  useEffect(() => {
    try {
      localStorage.setItem(draftKey(state.template), JSON.stringify(state));
    } catch {}
  }, [state]);

  // Debounced preview rebuild
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const raw = generateEmailHTML(state, false).replace("<head>", "<head><base target=\"_blank\">");
      setPreviewHtml(applySimulations(raw, simulations));
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [state, simulations]);

  function set<K extends keyof MailBuilderState>(key: K, value: MailBuilderState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSim(sim: Simulation) {
    setSimulations((prev) => {
      const next = new Set(prev);
      if (next.has(sim)) next.delete(sim);
      else next.add(sim);
      return next;
    });
  }

  function handleTemplateChange(t: Template) {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(draftKey(t));
        if (saved) {
          setState(migrateState(JSON.parse(saved)));
          return;
        }
      } catch {}
    }
    setState(makeInitialState(t));
  }

  function handleReset() {
    if (!window.confirm(`Weet je zeker dat je alle wijzigingen voor "${state.template}" wilt wissen en terugzetten naar standaard?`)) return;
    setState(makeInitialState(state.template));
    try { localStorage.removeItem(draftKey(state.template)); } catch {}
  }

  function handleDownload() {
    const html = generateEmailHTML(state, true);
    const stateJson = JSON.stringify(state).replace(/-->/g, "--\\u003E");
    const htmlWithState = html + `\n<!-- mailbuilder-state:${stateJson} -->`;
    const blob = new Blob([htmlWithState], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().split("T")[0];
    a.download = `psv-mail-${state.template}-${date}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
    void registreerMail();
  }

  /** Zet de gedownloade mail in het gedeelde overzicht onder de builder. */
  async function registreerMail() {
    setOpslaanError(null);
    try {
      const res = await fetch("/api/mail-builder/mails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dmid: state.dmid ?? "",
          naam: state.mailNaam ?? "",
          template: state.template,
          previewTekst: state.preheaderTekst ?? "",
          aantalBlokken:
            state.template === "prematch" || state.template === "prematchvrouwen"
              ? state.prematchBlocks.length
              : state.blocks.length,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOpslaanError(data.error ?? "De mail is gedownload, maar staat niet in het overzicht.");
        return;
      }
      if (data.mail) onOpgeslagen?.(data.mail as MailRecord);
    } catch {
      setOpslaanError("De mail is gedownload, maar het overzicht kon niet worden bijgewerkt.");
    }
  }

  function handleImportClick() {
    setImportError(null);
    importFileInputRef.current?.click();
  }

  function handleImportFile(file: File) {
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== "string") {
        setImportError("Kon het bestand niet lezen.");
        return;
      }
      const match = text.match(/<!--\s*mailbuilder-state:([\s\S]*?)\s*-->/);
      if (!match) {
        setImportError("Dit HTML-bestand bevat geen opgeslagen staat. Gebruik alleen bestanden geëxporteerd vanuit de Mail Builder.");
        return;
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(match[1]);
      } catch {
        setImportError("De opgeslagen staat kon niet worden gelezen (ongeldige JSON).");
        return;
      }
      if (!window.confirm("Weet je zeker dat je het huidige ontwerp wilt overschrijven met de inhoud van dit bestand?")) return;
      try {
        setState(migrateState(parsed));
      } catch {
        setImportError("De staat in dit bestand is niet compatibel met de huidige versie.");
      }
    };
    reader.onerror = () => setImportError("Fout bij het lezen van het bestand.");
    reader.readAsText(file, "utf-8");
  }

  async function handleCopy() {
    const html = generateEmailHTML(state, true);
    await navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function triggerUpload(fieldKey: string, onSuccess: (url: string) => void) {
    setUploadError(null);
    uploadCallbackRef.current = onSuccess;
    setUploadingField(fieldKey);
    fileInputRef.current?.click();
  }

  async function handleImageUpload(file: File) {
    setUploadError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/bunny-upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "Onbekende fout bij uploaden.");
        return;
      }
      uploadCallbackRef.current?.(data.url);
    } catch {
      setUploadError("Verbindingsfout — is de server bereikbaar?");
    } finally {
      setUploadingField(null);
      uploadCallbackRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const blockProps = {
    state,
    onChange: (partial: Partial<MailBuilderState>) => setState((prev) => ({ ...prev, ...partial })),
    triggerUpload,
    uploadingField,
    uploadError,
  };

  const preset = DEVICE_PRESETS[device];
  const scaledWidth = Math.round(600 * preset.scale);
  const scaledHeight = Math.round(PREVIEW_HEIGHT * preset.scale);

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImageUpload(file);
        }}
      />
      <input
        ref={importFileInputRef}
        type="file"
        accept=".html,text/html"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImportFile(file);
          if (importFileInputRef.current) importFileInputRef.current.value = "";
        }}
      />
      {/* ---- Left column: form cards ---- */}
      <div className="w-full xl:w-[440px] xl:flex-shrink-0 space-y-4">

        {/* BASIS */}
        <CollapsibleCard title="Basis" defaultOpen>
            <div className="space-y-2">
              <Label htmlFor="dmid">DMID</Label>
              <Input
                id="dmid"
                placeholder="DMID26-19542"
                value={state.dmid ?? ""}
                onChange={(e) => set("dmid", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mailNaam">Mailnaam</Label>
              <Input
                id="mailNaam"
                placeholder="2026.09.18 PSV Vrouwen - Tickets Fortuna Hjørring"
                value={state.mailNaam ?? ""}
                onChange={(e) => set("mailNaam", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Waaronder de mail in het overzicht hieronder komt te staan.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={state.template} onValueChange={(v) => handleTemplateChange(v as Template)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* De overige templates staan tijdelijk uit; de code blijft staan.
                      Terugzetten is een regel per template. */}
                  <SelectItem value="prematch">PSV 1 Pre-match</SelectItem>
                  <SelectItem value="prematchvrouwen">PSV Vrouwen Pre-match</SelectItem>
                  <SelectItem value="kaartverkoop">PSV Kaartverkoop</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="preheaderTekst">Preview-tekst</Label>
              <Input
                id="preheaderTekst"
                placeholder="Support jij woensdag PSV Vrouwen vanaf de tribune?"
                value={state.preheaderTekst ?? ""}
                onChange={(e) => set("preheaderTekst", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Staat in de inbox naast het onderwerp. Blijft dit leeg, dan gebruikt de export het
                Maileon-token en moet je de tekst in Maileon bij Basic settings invullen.
              </p>
            </div>

            {state.template !== "prematch" && state.template !== "prematchvrouwen" && state.template !== "psvplay" && (
              <div className="space-y-2">
                <Label>UTM-campagne</Label>
                <Input
                  placeholder="bijv. seizoen2526-finale"
                  value={state.utmCampaign}
                  onChange={(e) => set("utmCampaign", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Wordt als <code>utm_campaign</code> toegevoegd aan alle links bij export.
                </p>
              </div>
            )}
        </CollapsibleCard>

        {/* Block-gebaseerde secties via registry */}
        {TEMPLATE_BLOCKS[state.template].map((blockType) => {
          switch (blockType) {
            case "hero":             return <HeroBlock key="hero" {...blockProps} />;
            case "greeting":         return null;
            case "text-blocks":      return <TextBlocksEditor key="text-blocks" state={blockProps.state} onChange={blockProps.onChange} />;
            case "footer":           return <FooterBlock key="footer" state={blockProps.state} onChange={blockProps.onChange} />;
            case "fanstore-nav":     return <FanstoreNavBlock key="fanstore-nav" state={blockProps.state} onChange={blockProps.onChange} />;
            case "psvplay-video":    return <PsvPlayBlock key="psvplay-video" {...blockProps} />;
            case "business-sponsor": return <BusinessSponsorBlock key="business-sponsor" {...blockProps} />;
            case "enquete-cta":      return <EnqueteCtaBlock key="enquete-cta" {...blockProps} />;
            case "phoxy-cta":        return <PhoxyCtaBlock key="phoxy-cta" {...blockProps} />;
            case "prematch-blocks":  return <PrematchBlocksBlock key="prematch-blocks" {...blockProps} />;
            default:                 return null;
          }
        })}
      </div>

      {/* ---- Right column: preview ---- */}
      <div className="w-full xl:flex-1 xl:sticky xl:top-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <CardTitle>Preview</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">

                {/* Device toggle */}
                <div className="flex rounded-md border border-input overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDevice("desktop")}
                    title="Desktop (600px)"
                    className={cn(
                      "p-2 transition-colors",
                      device === "desktop"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background hover:bg-accent"
                    )}
                  >
                    <Monitor className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDevice("mobile")}
                    title="Mobiel (390px)"
                    className={cn(
                      "p-2 transition-colors",
                      device === "mobile"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background hover:bg-accent"
                    )}
                  >
                    <Smartphone className="h-4 w-4" />
                  </button>
                </div>

                {/* Simulation toggles */}
                <div className="flex rounded-md border border-input overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSim("dark")}
                    title="Dark mode simulatie"
                    className={cn(
                      "p-2 transition-colors",
                      simulations.has("dark")
                        ? "bg-primary text-primary-foreground"
                        : "bg-background hover:bg-accent"
                    )}
                  >
                    <Moon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSim("images-off")}
                    title="Simuleer afbeeldingen geblokkeerd"
                    className={cn(
                      "p-2 transition-colors",
                      simulations.has("images-off")
                        ? "bg-primary text-primary-foreground"
                        : "bg-background hover:bg-accent"
                    )}
                  >
                    <EyeOff className="h-4 w-4" />
                  </button>
                </div>

                {/* Actions */}
                <Button size="sm" variant="outline" onClick={handleReset} className="gap-1.5" title="Zet terug naar standaard">
                  <RotateCcw className="h-4 w-4" />Standaard
                </Button>
                <Button size="sm" variant="outline" onClick={handleImportClick} className="gap-1.5" title="Laad een eerder geëxporteerd HTML-bestand">
                  <Upload className="h-4 w-4" />Importeren
                </Button>
                <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5">
                  {copied ? (
                    <><Check className="h-4 w-4" />Gekopieerd!</>
                  ) : (
                    <><Mail className="h-4 w-4" />Kopiëren</>
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={handleDownload}
                  disabled={problemen.length > 0}
                  title={problemen.length > 0 ? "Vul eerst de ontbrekende velden in" : undefined}
                  className="gap-1.5"
                >
                  {downloaded ? (
                    <><Check className="h-4 w-4" />Opgeslagen!</>
                  ) : (
                    <><Download className="h-4 w-4" />Download</>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          {problemen.length > 0 && (
            <div className="px-6 pb-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Nog {problemen.length} {problemen.length === 1 ? "punt" : "punten"} voordat je kunt downloaden
              </p>
              <ul className="mt-1.5 space-y-0.5 pl-5 text-xs text-muted-foreground list-disc">
                {problemen.map((p: string) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {opslaanError && (
            <div className="px-6 pb-3">
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {opslaanError}
              </p>
            </div>
          )}
          {importError && (
            <div className="px-6 pb-3">
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {importError}
              </p>
            </div>
          )}
          <CardContent className="p-0">
            <div className="border-t border-border">
              {device === "desktop" ? (
                <iframe
                  srcDoc={previewHtml}
                  title="E-mail preview"
                  sandbox="allow-same-origin allow-popups"
                  style={{
                    width: "100%",
                    height: `${PREVIEW_HEIGHT}px`,
                    border: "none",
                    display: "block",
                  }}
                />
              ) : (
                <div className="flex justify-center bg-muted/20 py-4">
                  <div
                    style={{
                      width: `${scaledWidth}px`,
                      height: `${scaledHeight}px`,
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    <iframe
                      srcDoc={previewHtml}
                      title="E-mail preview mobiel"
                      sandbox="allow-same-origin allow-popups"
                      style={{
                        width: "600px",
                        height: `${PREVIEW_HEIGHT}px`,
                        border: "none",
                        display: "block",
                        transform: `scale(${preset.scale})`,
                        transformOrigin: "top left",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
