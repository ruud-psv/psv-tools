"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEMPLATE_BLOCKS, BLOCK_LABELS, type BlockType } from "@/lib/mail-builder/blocks";
import type { Template } from "@/components/mail-builder-form";

// ---------------------------------------------------------------------------
// Template catalogue data
// ---------------------------------------------------------------------------

type BadgeVariant = "default" | "secondary" | "outline" | "gold" | "info" | "success" | "warning" | "destructive";

interface TemplateSpec {
  id: Template;
  name: string;
  category: string;
  variant: BadgeVariant;
  description: string;
}

const TEMPLATES: TemplateSpec[] = [
  { id: "business",     name: "PSV Business",      category: "B2B",       variant: "gold",      description: "Linksuitgelijnd. Sponsorbalk, business footer met adres en contactinfo." },
  { id: "enquete",      name: "PSV Enquête",        category: "Research",  variant: "info",      description: "Eigen CTA-knop met subtekst. Optionele tweede afbeelding. SSO/SCC-filters." },
  { id: "fanstore",     name: "PSV FANstore",       category: "Marketing", variant: "default",   description: "Navigatiebalk met 4 klikbare knoppen. Rode accentbalk." },
  { id: "fcpsvo12",     name: "FC PSV O12",         category: "Youth",     variant: "secondary", description: "Kinderleden FC PSV. Aanhef via voornaam lid. Phoxy-handtekening." },
  { id: "fcpsvo16",     name: "FC PSV O16",         category: "Youth",     variant: "secondary", description: "Ouders van FC PSV-leden (16+). Zelfde layout als O12." },
  { id: "kaartverkoop", name: "PSV Kaartverkoop",   category: "Marketing", variant: "default",   description: "Ticketing-template met primaire knop én secundaire tekstlink per blok." },
  { id: "prematch",     name: "PSV 1 Pre-match",    category: "Content",   variant: "outline",   description: "7 informatieve beelden + footer. Geen vrije blokken — puur beeldgedreven." },
  { id: "partnerships", name: "PSV Partnerships",   category: "B2B",       variant: "gold",      description: "Generieke partner-template. Zelfde opbouw als fan-templates." },
  { id: "phoxy",        name: "Phoxy Club",         category: "Youth",     variant: "secondary", description: "Lichtgrijs thema. Phoxy-social media. Optioneel klikbaar CTA-beeld." },
  { id: "psvplay",      name: "PSV Play",           category: "Content",   variant: "outline",   description: "Video-carrousel met 3 items. Afwisselend links/rechts-layout. Zwart thema." },
  { id: "soccerschool", name: "PSV Soccer School",  category: "Marketing", variant: "default",   description: "3 blokken vooringevuld. Inschrijvingstemplate met features-blok." },
  { id: "tours",        name: "PSV Tours",          category: "Marketing", variant: "default",   description: "3 blokken vooringevuld. KIDStour, stadionrondleidingen." },
];

// ---------------------------------------------------------------------------
// Block catalogue data
// ---------------------------------------------------------------------------

interface BlockSpec {
  type: BlockType;
  description: string;
  hasColorVariants: boolean;
  previewBg: string;
  previewContent: React.ReactNode;
}

const BLOCK_SPECS: BlockSpec[] = [
  {
    type: "hero",
    description: "Volledige-breedte hero-afbeelding met optionele klik-link en alt-tekst.",
    hasColorVariants: false,
    previewBg: "#1a1a1a",
    previewContent: (
      <div className="w-full h-14 rounded bg-gradient-to-r from-red-800 to-red-600 flex items-center justify-center">
        <span className="text-white text-xs font-semibold tracking-wide opacity-70">HERO AFBEELDING</span>
      </div>
    ),
  },
  {
    type: "greeting",
    description: "Aanhef-regel met personalisatie-tokens ({VOORNAAM}, {VOLLEDIGE NAAM}) en optionele afsluitende regel.",
    hasColorVariants: false,
    previewBg: "#ffffff",
    previewContent: (
      <div className="space-y-1 px-1">
        <div className="h-3 w-24 rounded bg-gray-200" />
        <div className="h-2.5 w-40 rounded bg-gray-100" />
      </div>
    ),
  },
  {
    type: "text-blocks",
    description: "Vrij te stapelen inhoudsblokken met rich text, optionele CTA-knop en secundaire tekstlink. Achtergrond: wit, grijs, rood of zwart.",
    hasColorVariants: true,
    previewBg: "#f9f9f9",
    previewContent: (
      <div className="space-y-1.5">
        {(["#ffffff", "#F1F1F1", "#E30613", "#000000"] as const).map((bg, i) => (
          <div key={i} className="h-6 w-full rounded border border-gray-100 flex items-center px-2 gap-1.5" style={{ backgroundColor: bg }}>
            <div className="h-1.5 w-16 rounded" style={{ backgroundColor: bg === "#ffffff" || bg === "#F1F1F1" ? "#ccc" : "#ffffff55" }} />
          </div>
        ))}
      </div>
    ),
  },
  {
    type: "footer",
    description: "Disclaimer-tekst en 'Mis niks van PSV' e-mailadres. Inklapbaar. Vaste footer-HTML per template wordt automatisch toegevoegd.",
    hasColorVariants: false,
    previewBg: "#f5f5f5",
    previewContent: (
      <div className="space-y-1 px-1">
        <div className="h-2 w-32 rounded bg-gray-300" />
        <div className="h-2 w-24 rounded bg-gray-200" />
        <div className="h-2 w-20 rounded bg-gray-200" />
      </div>
    ),
  },
  {
    type: "fanstore-nav",
    description: "Vier configureerbare navigatielinks (Wedstrijd, Training, Nieuw, Sale) in de rode FANstore-balk.",
    hasColorVariants: false,
    previewBg: "#E30613",
    previewContent: (
      <div className="flex gap-2 px-1">
        {["WEDSTRIJD", "TRAINING", "NIEUW", "SALE"].map((label) => (
          <span key={label} className="text-white text-[9px] font-bold tracking-wider">{label}</span>
        ))}
      </div>
    ),
  },
  {
    type: "psvplay-video",
    description: "Introductietekst (rood blok) + CTA-knop + video-items met afwisselende foto-links/rechts-layout en quote-tekst.",
    hasColorVariants: false,
    previewBg: "#000000",
    previewContent: (
      <div className="space-y-1">
        <div className="h-5 w-full rounded bg-red-600 flex items-center justify-center">
          <span className="text-white text-[9px] font-bold">INTRO</span>
        </div>
        <div className="flex gap-1">
          <div className="h-8 w-1/2 rounded bg-gray-700" />
          <div className="h-8 w-1/2 rounded bg-gray-800" />
        </div>
      </div>
    ),
  },
  {
    type: "business-sponsor",
    description: "Seizoensgebonden sponsorbalk-afbeelding (600×80px). Export-URL automatisch afgeleid van preview-URL.",
    hasColorVariants: false,
    previewBg: "#ffffff",
    previewContent: (
      <div className="h-8 w-full rounded border-2 border-dashed border-gray-200 flex items-center justify-center">
        <span className="text-gray-400 text-[9px]">SPONSORBALK 600×80</span>
      </div>
    ),
  },
  {
    type: "enquete-cta",
    description: "CTA-knop met subtekst voor enquête-links. Optioneel tweede afbeelding tonen. SSO/SCC-zichtbaarheid.",
    hasColorVariants: false,
    previewBg: "#ffffff",
    previewContent: (
      <div className="space-y-1.5 px-1">
        <div className="h-6 w-32 rounded bg-red-600 flex items-center justify-center">
          <span className="text-white text-[9px] font-bold">NAAR HET ONDERZOEK</span>
        </div>
        <div className="h-2 w-24 rounded bg-gray-200" />
      </div>
    ),
  },
  {
    type: "phoxy-cta",
    description: "Optionele CTA-afbeelding (60% breedte, links uitgelijnd) met klik-link. Voor Phoxy Club-mails.",
    hasColorVariants: false,
    previewBg: "#F1F1F1",
    previewContent: (
      <div className="flex justify-start px-1">
        <div className="h-10 w-[60%] rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
          <span className="text-gray-400 text-[9px]">CTA AFBEELDING</span>
        </div>
      </div>
    ),
  },
  {
    type: "prematch-images",
    description: "7 informatieve beelden (600px breed, vrije hoogte) + 1 footer-afbeelding. Volledig beeld-gedreven template.",
    hasColorVariants: false,
    previewBg: "#000000",
    previewContent: (
      <div className="space-y-0.5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-3 w-full rounded-sm bg-gray-700" />
        ))}
        <div className="text-center text-gray-500 text-[8px] pt-0.5">+ 4 meer</div>
      </div>
    ),
  },
];

function templatesUsingBlock(blockType: BlockType): Template[] {
  return (Object.entries(TEMPLATE_BLOCKS) as [Template, BlockType[]][])
    .filter(([, blocks]) => blocks.includes(blockType))
    .map(([t]) => t);
}

const TEMPLATE_NAME: Record<Template, string> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t.name])
) as Record<Template, string>;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type TabId = "blokken" | "templates";

export default function TemplatesPage() {
  const [activeTab, setActiveTab] = useState<TabId>("blokken");

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-4xl uppercase tracking-tight">Design System</h1>
          <p className="mt-1 text-muted-foreground">
            Blokken en templates — de bouwstenen van de PSV Mail Builder.
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link href="/dashboard/mail-builder">← Mail Builder</Link>
        </Button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-0 border-b border-border">
        {(["blokken", "templates"] as TabId[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {tab === "blokken" ? `Blokken (${BLOCK_SPECS.length})` : `Templates (${TEMPLATES.length})`}
          </button>
        ))}
      </div>

      {/* ── Tab: Blokken ── */}
      {activeTab === "blokken" && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BLOCK_SPECS.map((spec) => {
            const usedBy = templatesUsingBlock(spec.type);
            return (
              <Card key={spec.type} className="flex flex-col overflow-hidden">
                {/* Mini-preview */}
                <div
                  className="flex items-center justify-center px-4 py-5 min-h-[80px]"
                  style={{ backgroundColor: spec.previewBg }}
                >
                  <div className="w-full max-w-[200px]">{spec.previewContent}</div>
                </div>

                <CardHeader className="pb-2 pt-3">
                  <CardTitle className="text-base">{BLOCK_LABELS[spec.type]}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">{spec.description}</CardDescription>
                </CardHeader>

                <CardContent className="pt-0 flex flex-col gap-3 flex-1">
                  {/* Color variants */}
                  {spec.hasColorVariants && (
                    <div className="flex items-center gap-1.5">
                      {[
                        { label: "Wit", bg: "#ffffff", border: "#e2e8f0" },
                        { label: "Grijs", bg: "#F1F1F1", border: "#d1d5db" },
                        { label: "Rood", bg: "#E30613", border: "#E30613" },
                        { label: "Zwart", bg: "#000000", border: "#000000" },
                      ].map((c) => (
                        <span
                          key={c.label}
                          title={c.label}
                          className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] border"
                          style={{
                            backgroundColor: c.bg,
                            borderColor: c.border,
                            color: c.bg === "#ffffff" || c.bg === "#F1F1F1" ? "#374151" : "#ffffff",
                          }}
                        >
                          {c.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Used by */}
                  <div className="mt-auto">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                      Gebruikt in
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {usedBy.map((t) => (
                        <span
                          key={t}
                          className="rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {TEMPLATE_NAME[t]}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Tab: Templates ── */}
      {activeTab === "templates" && (
        <>
          {/* Legend */}
          <div className="mb-5 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Categorieën:</span>
            {(
              [
                ["Marketing", "default"],
                ["B2B", "gold"],
                ["Youth", "secondary"],
                ["Research", "info"],
                ["Content", "outline"],
              ] as [string, BadgeVariant][]
            ).map(([label, variant]) => (
              <span key={label} className="flex items-center gap-1">
                <Badge variant={variant}>{label}</Badge>
              </span>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {TEMPLATES.map((t) => {
              const blocks = TEMPLATE_BLOCKS[t.id];
              return (
                <Card key={t.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-xl">{t.name}</CardTitle>
                      <Badge variant={t.variant} className="shrink-0">{t.category}</Badge>
                    </div>
                    <CardDescription>{t.description}</CardDescription>
                  </CardHeader>

                  <CardContent className="flex flex-1 flex-col gap-4">
                    {/* Block stack */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Blokken
                      </p>
                      <ol className="space-y-1">
                        {blocks.map((blockType, i) => (
                          <li key={blockType} className="flex items-center gap-2 text-xs">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                              {i + 1}
                            </span>
                            <span className="text-foreground">{BLOCK_LABELS[blockType]}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Open button */}
                    <div className="mt-auto pt-2">
                      <Button asChild size="sm" className="gap-1.5">
                        <Link href="/dashboard/mail-builder">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open in Mail Builder
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
