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
import { ExternalLink, Image, Layers } from "lucide-react";

export const metadata = {
  title: "Templates | Mail Builder | PSV Tools",
};

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "gold"
  | "info"
  | "success"
  | "warning"
  | "destructive";

interface ImageSlot {
  slot: string;
  rec: string;
  notes: string;
  auto?: boolean;
}

interface TemplateSpec {
  id: string;
  name: string;
  category: string;
  variant: BadgeVariant;
  description: string;
  images: ImageSlot[];
  blocks: string;
  defaultCta: string;
  defaultUrl: string;
  features: string[];
}

const TEMPLATES: TemplateSpec[] = [
  {
    id: "business",
    name: "PSV Business",
    category: "B2B",
    variant: "gold",
    description: "Linksuitgelijnd. Sponsorbalk, business footer met adres en contactinfo.",
    images: [
      { slot: "Hero / header", rec: "600 × 300 px", notes: "Vrije hoogte, 2:1 gangbaar" },
      { slot: "Sponsorbalk", rec: "600 × 80 px", notes: "Instelbaar via upload" },
      { slot: "Patroon footer", rec: "600 × 80 px", notes: "Automatisch geladen", auto: true },
    ],
    blocks: "Flexibel (min. 1)",
    defaultCta: "AANMELDEN",
    defaultUrl: "—",
    features: ["Linksuitgelijnd", "Geen 'Bekijk online'", "Sponsorbalk instelbaar", "business@psv.nl footer"],
  },
  {
    id: "enquete",
    name: "PSV Enquête",
    category: "Research",
    variant: "info",
    description: "Eigen CTA-knop met subtekst. Optionele tweede afbeelding. SSO/SCC-filters.",
    images: [
      { slot: "Hero / header", rec: "600 × 300 px", notes: "Vrije hoogte" },
      { slot: "2e afbeelding (opt.)", rec: "600 × auto px", notes: "Optioneel, uitschakelbaar" },
    ],
    blocks: "Flexibel (min. 1)",
    defaultCta: "NAAR HET ONDERZOEK",
    defaultUrl: "—",
    features: ["SSO/SCC contactfilter", "Optionele 2e afbeelding", "Subtekst onder CTA"],
  },
  {
    id: "fanstore",
    name: "PSV FANstore",
    category: "Marketing",
    variant: "default",
    description: "Navigatiebalk met 4 klikbare knoppen. Rode accentbalk.",
    images: [
      { slot: "Hero / header", rec: "600 × 300 px", notes: "Vrije hoogte" },
      { slot: "Navbar-logo", rec: "600 × 60 px", notes: "Automatisch geladen", auto: true },
      { slot: "Patroon footer", rec: "600 × 80 px", notes: "Automatisch geladen", auto: true },
    ],
    blocks: "Flexibel (min. 1)",
    defaultCta: "SHOP NU",
    defaultUrl: "https://www.psv.nl/fanstore",
    features: ["Navbar met 4 knoppen", "Rode accentbalk", "'Voor 20.00 uur' tekst"],
  },
  {
    id: "fcpsvo12",
    name: "FC PSV O12",
    category: "Youth",
    variant: "secondary",
    description: "Kinderleden FC PSV. Aanhef via voornaam lid. Phoxy-handtekening.",
    images: [
      { slot: "Hero / header", rec: "600 × 300 px", notes: "Vrije hoogte" },
      { slot: "Handtekening Phoxy", rec: "116 × auto px", notes: "Automatisch geladen", auto: true },
      { slot: "FC PSV footer", rec: "600 × 200 px", notes: "Automatisch geladen", auto: true },
    ],
    blocks: "Flexibel (min. 1)",
    defaultCta: "IK WIL KANS MAKEN!",
    defaultUrl: "—",
    features: ["Aanhef 'Hoi {VOORNAAM}'", "[[KINDNAAM]] in disclaimer", "SSO-filter optioneel"],
  },
  {
    id: "fcpsvo16",
    name: "FC PSV O16",
    category: "Youth",
    variant: "secondary",
    description: "Ouders van FC PSV-leden (16+). Zelfde layout als O12.",
    images: [
      { slot: "Hero / header", rec: "600 × 300 px", notes: "Vrije hoogte" },
      { slot: "Handtekening Phoxy", rec: "116 × auto px", notes: "Automatisch geladen", auto: true },
      { slot: "FC PSV footer", rec: "600 × 200 px", notes: "Automatisch geladen", auto: true },
    ],
    blocks: "Flexibel (min. 1)",
    defaultCta: "IK WIL KANS MAKEN!",
    defaultUrl: "—",
    features: ["Aanhef 'Hoi vader of moeder van {VOORNAAM}'", "Lid-disclaimer", "SSO-filter optioneel"],
  },
  {
    id: "kaartverkoop",
    name: "PSV Kaartverkoop",
    category: "Marketing",
    variant: "default",
    description: "Ticketing-template met primaire knop én secundaire tekstlink per blok.",
    images: [
      { slot: "Hero / header", rec: "600 × 300 px", notes: "Ticketing visual" },
      { slot: "Patroon footer", rec: "600 × 80 px", notes: "Automatisch geladen", auto: true },
    ],
    blocks: "Flexibel (min. 1)",
    defaultCta: "SCOOR DE ALLERLAATSTE TICKETS",
    defaultUrl: "https://ticketshop.psv.nl",
    features: ["Ticketshop-URL vooringevuld", "Secundaire tekstlink per blok", "Slogan in afsluitregel"],
  },
  {
    id: "prematch",
    name: "PSV 1 Pre-match",
    category: "Content",
    variant: "outline",
    description: "7 informatieve beelden + footer. Geen vrije blokken — puur beeldgedreven.",
    images: [
      { slot: "Afbeeldingen 1 t/m 7", rec: "600 × auto px", notes: "Exact 600px breed, vrije hoogte" },
      { slot: "Footer-afbeelding", rec: "600 × auto px", notes: "Sluitstuk van de mail" },
      { slot: "Feedback-iconen", rec: "50 × 50 px", notes: "Automatisch geladen", auto: true },
      { slot: "Social-iconen", rec: "30 × 30 px", notes: "Automatisch geladen", auto: true },
    ],
    blocks: "Vast (7 beelden + footer)",
    defaultCta: "—",
    defaultUrl: "—",
    features: ["Puur beeld-gebaseerd", "Geen vrije tekst", "Typeform feedback-sectie"],
  },
  {
    id: "partnerships",
    name: "PSV Partnerships",
    category: "B2B",
    variant: "gold",
    description: "Generieke partner-template. Zelfde opbouw als fan-templates.",
    images: [
      { slot: "Hero / header", rec: "600 × 300 px", notes: "Vrije hoogte" },
      { slot: "Patroon footer", rec: "600 × 80 px", notes: "Automatisch geladen", auto: true },
    ],
    blocks: "Flexibel (min. 1)",
    defaultCta: "MEER INFORMATIE",
    defaultUrl: "—",
    features: ["Generieke fan-structuur", "Afsluitregel: 'Groet, PSV'"],
  },
  {
    id: "phoxy",
    name: "Phoxy Club",
    category: "Youth",
    variant: "secondary",
    description: "Lichtgrijs thema. Phoxy-social media. Optioneel klikbaar CTA-beeld.",
    images: [
      { slot: "Hero / header", rec: "600 × 300 px", notes: "Vrije hoogte" },
      { slot: "CTA-afbeelding (opt.)", rec: "360 × auto px", notes: "60% breedte, klikbaar" },
      { slot: "Handtekening Phoxy", rec: "116 × auto px", notes: "Automatisch geladen", auto: true },
      { slot: "Phoxy footer", rec: "600 × 200 px", notes: "Automatisch geladen", auto: true },
    ],
    blocks: "Flexibel (min. 1)",
    defaultCta: "—",
    defaultUrl: "—",
    features: ["Achtergrond #F1F1F1 (lichtgrijs)", "Phoxy social: Instagram · YouTube · TikTok", "Optionele CTA-afbeelding"],
  },
  {
    id: "psvplay",
    name: "PSV Play",
    category: "Content",
    variant: "outline",
    description: "Video-carrousel met 3 items. Afwisselend links/rechts-layout. Zwart thema.",
    images: [
      { slot: "Hero / header", rec: "600 × 300 px", notes: "Vrije hoogte" },
      { slot: "Video-item × 3", rec: "300 × auto px", notes: "50% breedte, afwisselend" },
      { slot: "PSV Play logo-balk", rec: "600 × 80 px", notes: "Automatisch geladen", auto: true },
      { slot: "Patroon-balk", rec: "600 × 40 px", notes: "Automatisch geladen", auto: true },
    ],
    blocks: "Vast (3 video-items)",
    defaultCta: "BEKIJK OP PSV PLAY",
    defaultUrl: "https://www.psv.nl/psv-play",
    features: ["Zwart thema", "Afwisselend links/rechts", "Quote-tekst per item", "PSV Play URL's vooringevuld"],
  },
  {
    id: "soccerschool",
    name: "PSV Soccer School",
    category: "Marketing",
    variant: "default",
    description: "3 blokken vooringevuld. Inschrijvingstemplate met features-blok.",
    images: [
      { slot: "Hero / header", rec: "600 × 300 px", notes: "Soccer School visual" },
      { slot: "Patroon footer", rec: "600 × 80 px", notes: "Automatisch geladen", auto: true },
    ],
    blocks: "3 (vooringevuld)",
    defaultCta: "INSCHRIJVEN",
    defaultUrl: "—",
    features: ["3 standaardblokken met tekst", "Geen afsluitregel", "Secundaire link: 'Meer informatie >'"],
  },
  {
    id: "tours",
    name: "PSV Tours",
    category: "Marketing",
    variant: "default",
    description: "3 blokken vooringevuld. KIDStour, stadionrondleidingen.",
    images: [
      { slot: "Hero / header", rec: "600 × 300 px", notes: "Tours visual" },
      { slot: "Patroon footer", rec: "600 × 80 px", notes: "Automatisch geladen", auto: true },
    ],
    blocks: "3 (vooringevuld)",
    defaultCta: "RESERVEER JOUW PLEK",
    defaultUrl: "—",
    features: ["3 standaardblokken met tekst", "Geen afsluitregel", "Secundaire link: 'Meer informatie >'"],
  },
];

export default function TemplatesPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-4xl uppercase tracking-tight">Templates</h1>
          <p className="mt-1 text-muted-foreground">
            Referentie voor alle {TEMPLATES.length} Mail Builder templates — afbeeldingsafmetingen,
            standaardwaarden en kenmerken.
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link href="/dashboard/mail-builder">← Mail Builder</Link>
        </Button>
      </div>

      {/* Legend */}
      <div className="mb-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {TEMPLATES.map((t) => (
          <Card key={t.id} className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-xl">{t.name}</CardTitle>
                <Badge variant={t.variant} className="shrink-0">
                  {t.category}
                </Badge>
              </div>
              <CardDescription>{t.description}</CardDescription>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-5">
              {/* Image slots */}
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Image className="h-3 w-3" />
                  Afbeeldingen
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-1 pr-3 font-medium">Slot</th>
                      <th className="pb-1 pr-3 font-medium">Aanbevolen formaat</th>
                      <th className="pb-1 font-medium">Opmerkingen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.images.map((img) => (
                      <tr key={img.slot} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-3 font-medium">{img.slot}</td>
                        <td className="py-1.5 pr-3 font-mono text-[11px]">{img.rec}</td>
                        <td className="py-1.5 text-muted-foreground">
                          {img.auto ? (
                            <span className="italic">{img.notes}</span>
                          ) : (
                            img.notes
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Block & CTA info */}
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Layers className="h-3 w-3" />
                  Structuur &amp; defaults
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Blokken</dt>
                  <dd>{t.blocks}</dd>
                  <dt className="text-muted-foreground">Standaard CTA</dt>
                  <dd className="font-mono text-[11px]">{t.defaultCta}</dd>
                  <dt className="text-muted-foreground">Standaard URL</dt>
                  <dd className="truncate font-mono text-[11px]">{t.defaultUrl}</dd>
                </dl>
              </div>

              {/* Features */}
              <div className="flex flex-wrap gap-1">
                {t.features.map((f) => (
                  <span
                    key={f}
                    className="rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {f}
                  </span>
                ))}
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
        ))}
      </div>
    </div>
  );
}
