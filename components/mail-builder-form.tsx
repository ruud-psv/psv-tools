"use client";

import { useState, useEffect, useRef } from "react";
import {
  Monitor,
  Smartphone,
  Download,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Upload,
  AlertCircle,
  Moon,
  EyeOff,
  Mail,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Template = "business" | "fanstore" | "kaartverkoop" | "partnerships" | "prematch" | "psvplay" | "soccerschool" | "tours";

type BlockBg = "wit" | "grijs" | "rood" | "zwart";

const BLOCK_BG_CONFIG: Record<BlockBg, { bg: string; text: string; link: string }> = {
  wit:   { bg: "#ffffff", text: "#000000", link: "#EE1C24" },
  grijs: { bg: "#F1F1F1", text: "#000000", link: "#EE1C24" },
  rood:  { bg: "#E30613", text: "#ffffff", link: "#ffffff" },
  zwart: { bg: "#000000", text: "#ffffff", link: "#ffffff" },
};

interface BodyBlock {
  id: string;
  content: string;
  blockBg: BlockBg;
  heeftCta: boolean;
  ctaLabel: string;
  ctaUrl: string;
  heeftSecLink: boolean;
  secLinkLabel: string;
  secLinkUrl: string;
}

interface PsvPlayItem {
  id: string;
  imagePreviewUrl: string;
  imageAlt: string;
  imageLink: string;
  quote: string;
  ctaLabel: string;
  ctaUrl: string;
}

function newPsvPlayItem(partial: Partial<PsvPlayItem> = {}): PsvPlayItem {
  return {
    id: Math.random().toString(36).slice(2),
    imagePreviewUrl: "",
    imageAlt: "",
    imageLink: "",
    quote: "",
    ctaLabel: "BEKIJK NU",
    ctaUrl: "https://www.psv.nl/psv-play",
    ...partial,
  };
}

interface PrematchImage {
  id: string;
  previewUrl: string;
  alt: string;
}

function newPrematchImage(partial: Partial<PrematchImage> = {}): PrematchImage {
  return { id: Math.random().toString(36).slice(2), previewUrl: "", alt: "", ...partial };
}

function newBlock(partial: Partial<BodyBlock> = {}): BodyBlock {
  return {
    id: Math.random().toString(36).slice(2),
    content: "",
    blockBg: "wit",
    heeftCta: false,
    ctaLabel: "",
    ctaUrl: "",
    heeftSecLink: false,
    secLinkLabel: "",
    secLinkUrl: "",
    ...partial,
  };
}

interface MailBuilderState {
  template: Template;
  heroUrl: string; // legacy field – kept for migration
  heroAlt: string;
  heroPreviewUrl: string;
  heroLink: string;
  aanhefText: string;
  blocks: BodyBlock[];
  heeftAfsluitRegel: boolean;
  afsluitRegel: string;
  disclaimerTekst: string;
  misNiksEmail: string;
  utmCampaign: string;
  // FANstore navbar URLs
  fanstoreNavWedstrijdUrl: string;
  fanstoreNavTrainingUrl: string;
  fanstoreNavNieuwUrl: string;
  fanstoreNavSaleUrl: string;
  // Prematch images (1–7 + footer)
  prematchImages: PrematchImage[];
  prematchFooterPreviewUrl: string; prematchFooterAlt: string;
  // PSV Play
  psvplayIntroText: string;
  psvplayCta1Label: string;
  psvplayCta1Url: string;
  psvplayCta2Label: string;
  psvplayCta2Url: string;
  psvplayItems: PsvPlayItem[];
  // PSV Business
  businessSponsorPreviewUrl: string;
}

// ---------------------------------------------------------------------------
// Preview mode
// ---------------------------------------------------------------------------

const DEVICE_PRESETS = {
  desktop: { label: "Desktop", width: 600, scale: 1 },
  mobile: { label: "Mobiel", width: 390, scale: 390 / 600 },
} as const;
type DevicePreset = keyof typeof DEVICE_PRESETS;
type Simulation = "dark" | "images-off";

function applySimulations(html: string, sims: Set<Simulation>): string {
  let injected = "";
  if (sims.has("dark")) {
    // Classic invert trick: body inverts to dark, images are double-inverted back to normal.
    injected += `<style>
      body { filter: invert(1) hue-rotate(180deg) !important; }
      img  { filter: invert(1) hue-rotate(180deg) !important; }
    </style>`;
  }
  if (sims.has("images-off")) {
    injected += `<style>img { visibility: hidden !important; min-height: 20px !important; }</style>`;
  }
  if (!injected) return html;
  return html.replace("</head>", `${injected}</head>`);
}

// ---------------------------------------------------------------------------
// CDN helpers
// ---------------------------------------------------------------------------

const MAILEON_CDN_HOST = "[[MAILING|PROTOCOL|http]]://[[ACCOUNT|MAILING-DOMAIN]]";
const PREVIEW_CDN_HOST = "https://images.maileon-static.com";

function wrapLink(url: string): string {
  return url ? `[[LINK|"${url}"]]` : "";
}

function RichTextEditor({
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

function applyUtm(url: string, campaign: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "maileon");
    u.searchParams.set("utm_medium", "email");
    if (campaign) u.searchParams.set("utm_campaign", campaign);
    return u.toString();
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const FANSTORE_NAV_DEFAULTS = {
  fanstoreNavWedstrijdUrl: "https://www.psvfanstore.nl/wedstrijd",
  fanstoreNavTrainingUrl: "https://www.psvfanstore.nl/training",
  fanstoreNavNieuwUrl: "https://www.psvfanstore.nl/nieuw",
  fanstoreNavSaleUrl: "https://www.psvfanstore.nl/sale",
};

const PREMATCH_DEFAULTS = {
  prematchImages: [
    newPrematchImage({ previewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvyzHFKlbtg4dg/media/1.png`, alt: "Volendam - PSV" }),
    newPrematchImage({ previewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvPxd_VPjsG0A/media/2.png`, alt: "PSV reist af naar het hoge noorden" }),
    newPrematchImage({ previewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvxRWGlR6utS8w/media/3.png`, alt: "De huidige stand in de Vriendenlóterij Eredivisie" }),
    newPrematchImage({ previewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvx0tCT39eCPwg/media/4.png`, alt: "Nieuw Record - PSV Wint 16 uitduels op rij" }),
    newPrematchImage({ previewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvxjK0h13rCkEA/media/5.png`, alt: "Laatste 3 edities Groningen - PSV" }),
    newPrematchImage({ previewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvzZGj_3pHotQw/media/6.png`, alt: "Team stats" }),
    newPrematchImage({ previewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvy-X8qFW1DCUw/media/7.png`, alt: "Breng een bezoek aan het Philips Stadion" }),
  ],
  prematchFooterPreviewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvwInQHJ4sAwpQ/media/footer_2.png`,
  prematchFooterAlt: "Every moment counts",
};

const PSVPLAY_DEFAULTS = {
  psvplayIntroText: "",
  psvplayCta1Label: "BEKIJK OP PSV PLAY",
  psvplayCta1Url: "https://www.psv.nl/psv-play",
  psvplayCta2Label: "Meer over PSV Play >",
  psvplayCta2Url: "https://www.psv.nl/psv-play",
  psvplayItems: [
    newPsvPlayItem({ imagePreviewUrl: `${PREVIEW_CDN_HOST}/c/YUMRX2qyvh8n265rTmn00A/media/5026%2010%20jaar%20na%208%20mei_MAILING%20-%202%20blok.jpg`, imageAlt: "PSV Play video 1", quote: "" }),
    newPsvPlayItem({ imagePreviewUrl: `${PREVIEW_CDN_HOST}/c/YUMRX2qyvh-mtsFmywk9tg/media/5026%2010%20jaar%20na%208%20mei_MAILING%20-%203%20blok.jpg`, imageAlt: "PSV Play video 2", quote: "" }),
    newPsvPlayItem({ imagePreviewUrl: `${PREVIEW_CDN_HOST}/c/YUMRX2qyvh_EXPIDNS4M0w/media/5026%2010%20jaar%20na%208%20mei_MAILING%20-%204%20blok.jpg`, imageAlt: "PSV Play video 3", quote: "" }),
  ],
  businessSponsorPreviewUrl: "",
};

type TemplateDefaults = Omit<MailBuilderState, "template">;

const PSVBUSINESS_SPONSOR_PREVIEW = `${PREVIEW_CDN_HOST}/c/wdQXu0A-uVaAKKGtgDHkNw/media/4238%20SPONSORBALK_PSV_25-26_PSV%20BUSINESS%20APP.jpg`;
const PSVBUSINESS_SPONSOR_EXPORT  = `${MAILEON_CDN_HOST}/c/wdQXu0A-uVaAKKGtgDHkNw/media/4238%20SPONSORBALK_PSV_25-26_PSV%20BUSINESS%20APP.jpg`;
const PSVBUSINESS_PATTERN_PREVIEW = `${PREVIEW_CDN_HOST}/c/NBfAAJE6Xj7kME5C3wxeLA/media/0000%20Pre-Match%20VR%20-%2013%20ADOPSV%2008.jpg`;
const PSVBUSINESS_PATTERN_EXPORT  = `${MAILEON_CDN_HOST}/c/NBfAAJE6Xj7kME5C3wxeLA/media/0000%20Pre-Match%20VR%20-%2013%20ADOPSV%2008.jpg`;

const DEFAULTS: Record<Template, TemplateDefaults> = {
  business: {
    heroUrl: `${MAILEON_CDN_HOST}/c/WTP1JZY_QhF9whFgbPrljQ/media/0000%20Zilver%2027%20-%20MAILHEADER%20ALGEMEEN%20(1).jpg`,
    heroAlt: "PSV Business",
    heroPreviewUrl: `${PREVIEW_CDN_HOST}/c/WTP1JZY_QhF9whFgbPrljQ/media/0000%20Zilver%2027%20-%20MAILHEADER%20ALGEMEEN%20(1).jpg`,
    heroLink: "",
    aanhefText: "Hi {VOORNAAM}",
    blocks: [newBlock({ heeftCta: true, ctaLabel: "AANMELDEN", ctaUrl: "" })],
    heeftAfsluitRegel: true,
    afsluitRegel: "Met sportieve groet,",
    disclaimerTekst: "Je ontvangt deze mail omdat je uitgenodigd bent.",
    misNiksEmail: "email@services.psv.nl",
    utmCampaign: "",
    ...FANSTORE_NAV_DEFAULTS,
    ...PREMATCH_DEFAULTS,
    ...PSVPLAY_DEFAULTS,
    businessSponsorPreviewUrl: PSVBUSINESS_SPONSOR_PREVIEW,
  },
  kaartverkoop: {
    heroUrl: `${MAILEON_CDN_HOST}/c/3rYEJmzm3pkN4F9jYGV8Nw/media/4877%20Ticketing%20seizoenontknoping%202.jpg`,
    heroAlt: "Scoor nu je tickets",
    heroPreviewUrl: `${PREVIEW_CDN_HOST}/c/3rYEJmzm3pkN4F9jYGV8Nw/media/4877%20Ticketing%20seizoenontknoping%202.jpg`,
    heroLink: "https://ticketshop.psv.nl/nl-NL/categories/PSV-1",
    aanhefText: "Hi {VOORNAAM}",
    blocks: [newBlock({ heeftCta: true, ctaLabel: "SCOOR DE ALLERLAATSTE TICKETS", ctaUrl: "https://ticketshop.psv.nl/nl-NL/categories/PSV-1", heeftSecLink: true, secLinkLabel: "Bekijk alle wedstrijden >", secLinkUrl: "https://ticketshop.psv.nl/nl-NL/categories/PSV-1" })],
    heeftAfsluitRegel: true,
    afsluitRegel: "Tot ziens in het Philips Stadion!",
    disclaimerTekst:
      "Je ontvangt deze mail omdat je hebt aangegeven interesse te hebben in PSV Kaartverkoop. Let op, wanneer je je afmeldt word je voor alle e-mails van PSV afgemeld. Het kan zijn dat je belangrijke informatie mist.",
    misNiksEmail: "email@newsletter.psv.nl",
    utmCampaign: "",
    ...FANSTORE_NAV_DEFAULTS,
    ...PREMATCH_DEFAULTS,
    ...PSVPLAY_DEFAULTS,
  },
  fanstore: {
    heroUrl: `${MAILEON_CDN_HOST}/c/jxMwnzDx3RfEytiZNZjOPg/media/5009%20End%20of%20season%20sale%20-%20MAILING.png`,
    heroAlt: "PSV FANstore",
    heroPreviewUrl: `${PREVIEW_CDN_HOST}/c/jxMwnzDx3RfEytiZNZjOPg/media/5009%20End%20of%20season%20sale%20-%20MAILING.png`,
    heroLink: "https://www.psv.nl/fanstore",
    aanhefText: "Hi {VOORNAAM}",
    blocks: [newBlock({ heeftCta: true, ctaLabel: "SHOP NU", ctaUrl: "https://www.psv.nl/fanstore" })],
    heeftAfsluitRegel: true,
    afsluitRegel: "Tot ziens!",
    disclaimerTekst:
      "Je ontvangt deze mail omdat je hebt aangegeven interesse te hebben in PSV FANstore. Let op, wanneer je je afmeldt word je voor alle e-mails van PSV afgemeld. Het kan zijn dat je belangrijke informatie mist.",
    misNiksEmail: "email@newsletter.psv.nl",
    utmCampaign: "",
    ...FANSTORE_NAV_DEFAULTS,
    ...PREMATCH_DEFAULTS,
    ...PSVPLAY_DEFAULTS,
  },
  soccerschool: {
    heroUrl: `${MAILEON_CDN_HOST}/c/3zu9kpkvY_OjJKhxaO6BCA/media/4663%20Mailheaders%20Soccerschool3_1.jpg`,
    heroAlt: "Soccer School",
    heroPreviewUrl: `${PREVIEW_CDN_HOST}/c/3zu9kpkvY_OjJKhxaO6BCA/media/4663%20Mailheaders%20Soccerschool3_1.jpg`,
    heroLink: "",
    aanhefText: "Hoi {VOORNAAM}",
    blocks: [
      newBlock({ content: "Wil jij trainen zoals jouw favoriete PSV'er? Ontdek de PSV Starclinics op PSV Campus De Herdgang! Tijdens deze unieke voetbaldag werk je aan skills zoals snelheid, wendbaarheid, passing en reactievermogen – precies zoals de profs dat doen." }),
      newBlock({ content: "<p style=\"margin:0 0 10px;font-weight:bold;\">Wat maakt deze trainingen bijzonder?&nbsp;</p><p style=\"margin:0;\">✅ Trainingen met thema's van PSV–spelers<br>✅ Compleet dagprogramma van 09.15 tot 16.00 uur<br>✅ 25% korting op jouw volgende Starclinic</p>", blockBg: "grijs" }),
      newBlock({ content: "Wil jij erbij zijn? Schrijf je dan snel in, want de plekken zijn beperkt!", heeftCta: true, ctaLabel: "INSCHRIJVEN", heeftSecLink: true, secLinkLabel: "Meer informatie >" }),
    ],
    heeftAfsluitRegel: false,
    afsluitRegel: "",
    disclaimerTekst:
      "Je ontvangt deze mail omdat je hebt aangegeven interesse te hebben in de PSV Soccer School. Let op, wanneer je je afmeldt word je voor alle e-mails van PSV afgemeld. Het kan zijn dat je belangrijke informatie mist.",
    misNiksEmail: "email@newsletter.psv.nl",
    utmCampaign: "",
    ...FANSTORE_NAV_DEFAULTS,
    ...PREMATCH_DEFAULTS,
    ...PSVPLAY_DEFAULTS,
  },
  tours: {
    heroUrl: `${MAILEON_CDN_HOST}/c/01cTNhJhAbMT2cYd5HJzRg/media/template-psv-tours-header.png`,
    heroAlt: "PSV Kidstour",
    heroPreviewUrl: `${PREVIEW_CDN_HOST}/c/01cTNhJhAbMT2cYd5HJzRg/media/template-psv-tours-header.png`,
    heroLink: "",
    aanhefText: "Hoi {VOORNAAM}",
    blocks: [
      newBlock({ content: "Heb jij thuis een jonge PSV'er die niet genoeg kan krijgen van onze club? Kom dan langs tijdens de carnavalsvakantie. Dan organiseren we opnieuw de PSV KIDStour. Samen met je kind ontdek je plekken waar je normaal nooit komt. En natuurlijk gaan jullie naar huis met een echt PSV-aandenken!" }),
      newBlock({ content: "<p style=\"margin:0 0 10px;font-weight:bold;\">Wat kun je verwachten?</p><p style=\"margin:0;\">✅ Speur naar items op je bingokaart<br>✅ Ontmoet Phoxy<br>✅ Een uniek PSV-moment om nooit te vergeten</p>", blockBg: "grijs" }),
      newBlock({ content: "<b>Let op:</b> het aantal plekken is beperkt. Reserveer snel en maak deze carnavalsvakantie extra speciaal!", heeftCta: true, ctaLabel: "RESERVEER JOUW PLEK", heeftSecLink: true, secLinkLabel: "Meer informatie >" }),
    ],
    heeftAfsluitRegel: false,
    afsluitRegel: "",
    disclaimerTekst:
      "Je ontvangt deze mail omdat je hebt aangegeven interesse te hebben in de PSV Tours. Let op, wanneer je je afmeldt word je voor alle e-mails van PSV afgemeld. Het kan zijn dat je belangrijke informatie mist.",
    misNiksEmail: "email@newsletter.psv.nl",
    utmCampaign: "",
    ...FANSTORE_NAV_DEFAULTS,
    ...PREMATCH_DEFAULTS,
    ...PSVPLAY_DEFAULTS,
  },
  prematch: {
    heroUrl: "",
    heroAlt: "",
    heroPreviewUrl: "",
    heroLink: "",
    aanhefText: "Hi {VOORNAAM}",
    blocks: [],
    heeftAfsluitRegel: false,
    afsluitRegel: "",
    disclaimerTekst: "",
    misNiksEmail: "email@newsletter.psv.nl",
    utmCampaign: "",
    ...FANSTORE_NAV_DEFAULTS,
    ...PREMATCH_DEFAULTS,
    ...PSVPLAY_DEFAULTS,
  },
  psvplay: {
    heroUrl: `${MAILEON_CDN_HOST}/c/grDHLc4GmamqZDD9ZI__Pw/media/5026%2010%20jaar%20na%208%20mei_MAILING%20-%201%20header.jpg`,
    heroAlt: "PSV Play",
    heroPreviewUrl: `${PREVIEW_CDN_HOST}/c/grDHLc4GmamqZDD9ZI__Pw/media/5026%2010%20jaar%20na%208%20mei_MAILING%20-%201%20header.jpg`,
    heroLink: "https://www.psv.nl/psv-play",
    aanhefText: "",
    blocks: [],
    heeftAfsluitRegel: false,
    afsluitRegel: "",
    disclaimerTekst: "Je ontvangt deze mail omdat je hebt aangegeven interesse te hebben in PSV Play. Let op, wanneer je je afmeldt word je voor alle e-mails van PSV afgemeld. Het kan zijn dat je belangrijke informatie mist.",
    misNiksEmail: "email@newsletter.psv.nl",
    utmCampaign: "",
    ...FANSTORE_NAV_DEFAULTS,
    ...PREMATCH_DEFAULTS,
    psvplayIntroText: "",
    psvplayCta1Label: "BEKIJK OP PSV PLAY",
    psvplayCta1Url: "https://www.psv.nl/psv-play",
    psvplayCta2Label: "Meer over PSV Play >",
    psvplayCta2Url: "https://www.psv.nl/psv-play",
    psvplayItems: [
      newPsvPlayItem({ imagePreviewUrl: `${PREVIEW_CDN_HOST}/c/YUMRX2qyvh8n265rTmn00A/media/5026%2010%20jaar%20na%208%20mei_MAILING%20-%202%20blok.jpg`, imageAlt: "PSV Play video 1", quote: "" }),
      newPsvPlayItem({ imagePreviewUrl: `${PREVIEW_CDN_HOST}/c/YUMRX2qyvh-mtsFmywk9tg/media/5026%2010%20jaar%20na%208%20mei_MAILING%20-%203%20blok.jpg`, imageAlt: "PSV Play video 2", quote: "" }),
      newPsvPlayItem({ imagePreviewUrl: `${PREVIEW_CDN_HOST}/c/YUMRX2qyvh_EXPIDNS4M0w/media/5026%2010%20jaar%20na%208%20mei_MAILING%20-%204%20blok.jpg`, imageAlt: "PSV Play video 3", quote: "" }),
    ],
    businessSponsorPreviewUrl: "",
  },
  partnerships: {
    heroUrl: `${MAILEON_CDN_HOST}/c/R7sloben33Nl8ME6CC4qlA/media/4862%20Kracht%20van%20VDL%20-%20MAILING_Banenmarkt.jpg`,
    heroAlt: "PSV Partnerships",
    heroPreviewUrl: `${PREVIEW_CDN_HOST}/c/R7sloben33Nl8ME6CC4qlA/media/4862%20Kracht%20van%20VDL%20-%20MAILING_Banenmarkt.jpg`,
    heroLink: "",
    aanhefText: "Hi {VOORNAAM}",
    blocks: [newBlock({ heeftCta: true, ctaLabel: "MEER INFORMATIE", ctaUrl: "" })],
    heeftAfsluitRegel: true,
    afsluitRegel: "Groet, PSV",
    disclaimerTekst:
      "Je ontvangt deze mail omdat je hebt aangegeven interesse te hebben in PSV Partnerships. Let op, wanneer je je afmeldt word je voor alle e-mails van PSV afgemeld. Het kan zijn dat je belangrijke informatie mist.",
    misNiksEmail: "email@newsletter.psv.nl",
    utmCampaign: "",
    ...FANSTORE_NAV_DEFAULTS,
    ...PREMATCH_DEFAULTS,
    ...PSVPLAY_DEFAULTS,
  },
};

function makeInitialState(t: Template): MailBuilderState {
  return { template: t, ...DEFAULTS[t] };
}

function migrateState(raw: Record<string, unknown>): MailBuilderState {
  const stripLink = (v: unknown): string => {
    const s = typeof v === "string" ? v : "";
    return s.replace(/^\[\[LINK\|"(.+)"\]\]$/, "$1");
  };
  const base = raw as unknown as MailBuilderState;
  // Map old "exploitatie" key to "template"
  const template: Template =
    (base.template as Template) ||
    ((raw.exploitatie as Template) ?? "kaartverkoop");

  const blocks: BodyBlock[] = (() => {
    if (Array.isArray(raw.blocks) && raw.blocks.length > 0) {
      const validBg: BlockBg[] = ["wit", "grijs", "rood", "zwart"];
      return (raw.blocks as BodyBlock[]).map(b => ({
        ...b,
        blockBg: validBg.includes(b.blockBg) ? b.blockBg : ((b as unknown as { isGrijs?: boolean }).isGrijs ? "grijs" : "wit"),
      }));
    }
    // Migrate from old flat fields
    const result: BodyBlock[] = [];
    const oldBody = (raw.body as string | undefined) ?? "";
    const oldCtaLabel = (raw.ctaLabel as string | undefined) ?? "";
    const oldCtaUrl = stripLink(raw.ctaUrl);
    const oldSecLink = !!(raw.heeftSecondaireLink);
    const oldSecLabel = (raw.secondaireLinkLabel as string | undefined) ?? "";
    const oldSecUrl = stripLink(raw.secondaireLinkUrl);
    if (oldBody || oldCtaLabel) {
      result.push(newBlock({ content: oldBody, heeftCta: !!oldCtaLabel, ctaLabel: oldCtaLabel, ctaUrl: oldCtaUrl, heeftSecLink: oldSecLink, secLinkLabel: oldSecLabel, secLinkUrl: oldSecUrl }));
    }
    const oldExtraBody = (raw.extraBody as string | undefined) ?? "";
    if (raw.heeftExtraBody && oldExtraBody) {
      result.push(newBlock({ content: oldExtraBody }));
    }
    return result.length > 0 ? result : DEFAULTS[template].blocks;
  })();

  return {
    ...DEFAULTS[template],
    ...base,
    template,
    blocks,
    aanhefText: (() => {
      if (typeof base.aanhefText === "string" && base.aanhefText) return base.aanhefText;
      const prefix = (raw.aanhefPrefix as string | undefined) ?? "Hi";
      const token = (raw.aanhefField as string) === "FULLNAME" ? "{VOLLEDIGE NAAM}" : "{VOORNAAM}";
      return `${prefix} ${token}`;
    })(),
    heroLink: stripLink(base.heroLink),
    utmCampaign: (base.utmCampaign as string | undefined) ?? "",
    fanstoreNavWedstrijdUrl: (base.fanstoreNavWedstrijdUrl as string | undefined) ?? FANSTORE_NAV_DEFAULTS.fanstoreNavWedstrijdUrl,
    fanstoreNavTrainingUrl: (base.fanstoreNavTrainingUrl as string | undefined) ?? FANSTORE_NAV_DEFAULTS.fanstoreNavTrainingUrl,
    fanstoreNavNieuwUrl: (base.fanstoreNavNieuwUrl as string | undefined) ?? FANSTORE_NAV_DEFAULTS.fanstoreNavNieuwUrl,
    fanstoreNavSaleUrl: (base.fanstoreNavSaleUrl as string | undefined) ?? FANSTORE_NAV_DEFAULTS.fanstoreNavSaleUrl,
    prematchImages: Array.isArray(raw.prematchImages) ? raw.prematchImages as PrematchImage[] : PREMATCH_DEFAULTS.prematchImages,
    psvplayItems: Array.isArray(raw.psvplayItems) ? raw.psvplayItems as PsvPlayItem[] : PSVPLAY_DEFAULTS.psvplayItems,
    businessSponsorPreviewUrl: (base.businessSponsorPreviewUrl as string | undefined) ?? DEFAULTS[template].businessSponsorPreviewUrl,
  };
}

// ---------------------------------------------------------------------------
// Aanhef token resolver
// ---------------------------------------------------------------------------

function resolveAanhef(text: string, forExport: boolean): string {
  if (forExport) {
    return text
      .replace(/\{VOORNAAM\}/g, "[[% contact 'FIRSTNAME' 'PSV-fan']]")
      .replace(/\{VOLLEDIGE NAAM\}/g, "[[% contact 'FULLNAME' 'PSV-fan']]");
  }
  return text
    .replace(/\{VOORNAAM\}/g, "John")
    .replace(/\{VOLLEDIGE NAAM\}/g, "John Doe");
}

// ---------------------------------------------------------------------------
// HTML generators
// ---------------------------------------------------------------------------

function generatePrematchHTML(state: MailBuilderState, forExport = false): string {
  const cdn = forExport ? MAILEON_CDN_HOST : PREVIEW_CDN_HOST;
  const utm = (url: string) => forExport ? applyUtm(url, state.utmCampaign) : url;

  const toExportSrc = (previewUrl: string) =>
    previewUrl.startsWith(PREVIEW_CDN_HOST)
      ? previewUrl.replace(PREVIEW_CDN_HOST, MAILEON_CDN_HOST)
      : previewUrl;

  const imgSrc = (previewUrl: string) =>
    forExport ? toExportSrc(previewUrl) : previewUrl;

  const imgs = state.prematchImages.map(img => ({ src: imgSrc(img.previewUrl), alt: img.alt }));

  const contentRows = imgs
    .map(
      ({ src, alt }) => `
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0;">
              <img src="${src}" width="600" alt="${alt}" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
            </td>
          </tr>`
    )
    .join("\n");

  const footerSrc = imgSrc(state.prematchFooterPreviewUrl);
  const titleText = forExport ? "[[MAILING|SUBJECT|]]" : "Pre-Match preview";
  const preheader = forExport ? `[[PREVIEW-TEXT|]][[% unescape_html (repeat zwnjnbsp 180)]]` : "";
  const openPixelHtml = forExport
    ? `<img src="[[OPEN-PIXEL]]" width="1" height="1" alt="" style="width:1px;height:1px;display:block;">`
    : "";
  const onlineVersion = forExport ? "[[ONLINE-VERSION]]" : "#";
  const changeLanguageHref = forExport
    ? `[[LINK|"https://login.psv.nl/Dashboard/Profile"]]`
    : "https://login.psv.nl/Dashboard/Profile";

  const contactId = forExport ? "[[CONTACT|ID]]" : "000001";
  const checksum = forExport ? "[[CONTACT|CHECKSUM]]" : "abc123";
  const fullName = forExport ? "[[% contact 'FULLNAME' 'onbekend']]" : "John Doe";
  const emailAddr = forExport ? "[[% email]]" : "john@example.com";
  const memberNr = forExport ? "[[% contact 'MEMBERNUMBERPRIOR' 'onbekend']]" : "123456";

  const prefsHref = `https://newsletter.psv.nl/hp/iFRp1MKUfY_Q39OWNy9vbA/psv-voorkeuren-algemeen?contactId=${contactId}&checksum=${checksum}`;
  const unsubHref = `https://newsletter.psv.nl/hp/5Tvm3Acs2ydwoB28ioz-ig/psv-uitschrijven-algemeen?contactId=${contactId}&checksum=${checksum}`;
  const changeEmailHref = forExport
    ? `[[LINK|"https://www.psv.nl/contact-1/e-mailadreswijziging"]]`
    : "https://www.psv.nl/contact-1/e-mailadreswijziging";
  const misNiksHref = forExport
    ? `[[LINK|"https://www.psv.nl/psv/mis-niks-van-psv.htm"]]`
    : "https://www.psv.nl/psv/mis-niks-van-psv.htm";

  const sl = (url: string) => (forExport ? `[[LINK|"${url}"]]` : url);
  const fbUrl = sl("https://www.facebook.com/PSV/");
  const igUrl = sl("https://www.instagram.com/psv/");
  const ytUrl = sl("https://www.youtube.com/user/psveindhoven");
  const xUrl = sl("https://twitter.com/PSV");
  const liUrl = sl("https://www.linkedin.com/company/psv/");
  const ttUrl = sl("https://www.tiktok.com/@psv");

  const fbBase = "https://psv.typeform.com/to/ToXAKBFD";
  const mv = (variable: string, preview: string) => forExport ? variable : preview;
  const fbParams = `typeform-medium=embed-email&email=${mv("[% email]","john@example.com")}&forename=${mv("[% contact 'FIRSTNAME' '-onbekend-']","John")}&surname=${mv("[% contact 'LASTNAME' '-Onbekend-']","Doe")}&groupid=${mv("[% contact 'EXTERNAL-ID' 'Onbekend']","0")}&emailname=${mv("[MAILING|NAME|]","Test")}&emailid=${mv("[MAILING|ID|]","0")}`;
  const fbPosHref = forExport
    ? `[[LINK|"${fbBase}?${fbParams}&answers-contentscore=0d872ebf-a707-4bc3-88f0-125a89faa327"]]`
    : `${fbBase}?${fbParams}&answers-contentscore=0d872ebf-a707-4bc3-88f0-125a89faa327`;
  const fbNegHref = forExport
    ? `[[LINK|"${fbBase}?${fbParams}&answers-contentscore=80ff86cc-c74e-4f6f-88f6-756bd7b5e6dc"]]`
    : `${fbBase}?${fbParams}&answers-contentscore=80ff86cc-c74e-4f6f-88f6-756bd7b5e6dc`;

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="nl">
<head>
  <!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>${titleText}</title>
  <style type="text/css">
    html,body{width:100%;height:100%;margin:0;padding:0;border:0;}
    table,tbody,tr,td{padding:0;border-collapse:collapse;border-spacing:0;mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img,a img{outline:none;-ms-interpolation-mode:bicubic;}
  </style>
</head>
<body id="maileon-body" style="margin:0;padding:0;background-color:#000000;">
  ${openPixelHtml}
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
  <table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#000000" style="width:100%;background-color:#000000;" role="presentation">
    <tr>
      <td align="center" valign="top">
        <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;" role="presentation">

          <!-- Header strip -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:8px 10px 5px;text-align:right;">
              <span style="font-family:'Titillium Web',Verdana,sans-serif;font-size:10px;color:#ffffff;">
                <a href="${onlineVersion}" style="color:#ffffff;text-decoration:none;" target="_blank">Bekijk online</a>&nbsp;|&nbsp;<a href="${changeLanguageHref}" style="color:#ffffff;text-decoration:none;" target="_blank">Change language &#127468;&#127463;</a>
              </span>
            </td>
          </tr>

          ${contentRows}

          <!-- Footer image -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0;">
              <img src="${footerSrc}" width="600" alt="${state.prematchFooterAlt}" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
            </td>
          </tr>

          <!-- Feedback -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:20px 0 10px;text-align:center;">
              <p style="margin:0 0 10px;font-family:'Titillium Web',Verdana,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;line-height:140%;">Hoe scoorde deze e-mail bij jou?</p>
              <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 auto;">
                <tr>
                  <td style="padding:0 3px;"><a href="${fbPosHref}" target="_blank"><img src="${cdn}/c/7P4UPmYQhoQ/media/feedback_positief.png" width="50" height="50" alt="Positief" style="display:block;width:50px;height:50px;border:0;"></a></td>
                  <td style="padding:0 3px;"><a href="${fbNegHref}" target="_blank"><img src="${cdn}/c/srpCZd3lN1M/media/feedback_negatief.png" width="50" height="50" alt="Negatief" style="display:block;width:50px;height:50px;border:0;"></a></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Social -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:20px 0 10px;text-align:center;">
              <p style="margin:0 0 10px;font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;line-height:140%;">Volg ons ook via social media</p>
              <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 auto;">
                <tr>
                  <td style="padding:0 5px;"><a href="${fbUrl}" target="_blank"><img src="${cdn}/c/MPFMFIXazuI/media/SOCIAL%20ICONEN%20-%20Facebook.png" width="30" height="30" alt="Facebook" style="display:block;width:30px;height:30px;border:0;"></a></td>
                  <td style="padding:0 5px;"><a href="${igUrl}" target="_blank"><img src="${cdn}/c/Cl9D51zXm2k/media/SOCIAL%20ICONEN%20-%20Instagram.png" width="30" height="30" alt="Instagram" style="display:block;width:30px;height:30px;border:0;"></a></td>
                  <td style="padding:0 5px;"><a href="${ytUrl}" target="_blank"><img src="${cdn}/c/osAm-N7-BI8/media/SOCIAL%20ICONEN%20-%20Youtube.png" width="30" height="30" alt="YouTube" style="display:block;width:30px;height:30px;border:0;"></a></td>
                  <td style="padding:0 5px;"><a href="${xUrl}" target="_blank"><img src="${cdn}/c/HQ3giXVZxF0M_G5YVrvkXA/media/MicrosoftTeams-image%20(34).png" width="30" height="30" alt="X" style="display:block;width:30px;height:30px;border:0;"></a></td>
                  <td style="padding:0 5px;"><a href="${liUrl}" target="_blank"><img src="${cdn}/c/dhHuvVyv91Y/media/SOCIAL%20ICONEN%20-%20Linkedin.png" width="30" height="30" alt="LinkedIn" style="display:block;width:30px;height:30px;border:0;"></a></td>
                  <td style="padding:0 5px;"><a href="${ttUrl}" target="_blank"><img src="${cdn}/c/TfwTSJ01fKo/media/SOCIAL%20ICONEN%20-%20WIT_TIKTOK.png" width="30" height="30" alt="TikTok" style="display:block;width:30px;height:30px;border:0;"></a></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:30px 10px 20px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation">
                <tr><td style="height:1px;background-color:#ffffff;font-size:1px;line-height:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Contact info -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:20px 0;text-align:center;">
              <p style="margin:0;font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;line-height:140%;">
                Fullname: ${fullName}<br>
                E-mail: <a href="mailto:${emailAddr}" style="color:#ffffff;text-decoration:none;">${emailAddr}</a><br>
                Membernummer: ${memberNr}
              </p>
            </td>
          </tr>

          <!-- Disclaimer -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0 20px 20px;text-align:center;">
              <p style="margin:0 auto;font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;line-height:140%;max-width:560px;">
                ${state.disclaimerTekst}&nbsp;&nbsp;<br><br>
                Wil je er zeker van zijn dat je geen e-mails van PSV mist? Voeg dan ons e-mailadres (<a href="${misNiksHref}" style="color:#ffffff;" target="_blank" rel="noopener noreferrer">${state.misNiksEmail}</a>) toe aan je adresboek en aan de lijst met veilige afzenders.
              </p>
            </td>
          </tr>

          <!-- Unsubscribe -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0 0 20px;text-align:center;">
              <p style="margin:0;font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;line-height:140%;">
                <i>
                  <a href="${prefsHref}" style="color:#ffffff;" target="_blank" rel="noopener noreferrer">Voorkeuren aanpassen</a>&nbsp; &nbsp;
                  <a href="${unsubHref}" style="color:#ffffff;" target="_blank" rel="noopener noreferrer">Volledig uitschrijven</a>&nbsp; &nbsp;
                  <a href="${changeEmailHref}" style="color:#ffffff;" target="_blank" rel="noopener noreferrer">Wijzig je e-mailadres</a>
                </i>
              </p>
            </td>
          </tr>

          <tr>
            <td bgcolor="#000000" style="height:40px;font-size:40px;line-height:40px;">&nbsp;</td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const PSVPLAY_LOGO_SRC_PREVIEW = `${PREVIEW_CDN_HOST}/c/eSRD9kR1b2ozxJx0vkpBgQ/media/4627%20PSV%20Play%20-%20oktober%20recap%20-%20header.jpg`;
const PSVPLAY_LOGO_SRC_EXPORT = `${MAILEON_CDN_HOST}/c/eSRD9kR1b2ozxJx0vkpBgQ/media/4627%20PSV%20Play%20-%20oktober%20recap%20-%20header.jpg`;
const PSVPLAY_PATTERN_SRC_PREVIEW = `${PREVIEW_CDN_HOST}/c/oNgEaVc-AGBG66Sf2Grt1g/media/0000%20Pre-Match%20-%2014%20FEYPSV8.jpg`;
const PSVPLAY_PATTERN_SRC_EXPORT = `${MAILEON_CDN_HOST}/c/oNgEaVc-AGBG66Sf2Grt1g/media/0000%20Pre-Match%20-%2014%20FEYPSV8.jpg`;

function generatePsvPlayHTML(state: MailBuilderState, forExport = false): string {
  const cdn = forExport ? MAILEON_CDN_HOST : PREVIEW_CDN_HOST;
  const utm = (url: string) => forExport ? applyUtm(url, state.utmCampaign) : url;
  const sl = (url: string) => forExport ? `[[LINK|"${url}"]]` : url;

  const toExportSrc = (previewUrl: string) =>
    previewUrl.startsWith(PREVIEW_CDN_HOST)
      ? previewUrl.replace(PREVIEW_CDN_HOST, MAILEON_CDN_HOST)
      : previewUrl;
  const imgSrc = (previewUrl: string) => forExport ? toExportSrc(previewUrl) : previewUrl;

  const heroSrc = imgSrc(state.heroPreviewUrl || state.heroUrl.replace(MAILEON_CDN_HOST, PREVIEW_CDN_HOST));
  const logoSrc = forExport ? PSVPLAY_LOGO_SRC_EXPORT : PSVPLAY_LOGO_SRC_PREVIEW;
  const patternSrc = forExport ? PSVPLAY_PATTERN_SRC_EXPORT : PSVPLAY_PATTERN_SRC_PREVIEW;

  const titleText = forExport ? "[[MAILING|SUBJECT|]]" : "PSV Play preview";
  const preheader = forExport ? `[[PREVIEW-TEXT|]][[% unescape_html (repeat zwnjnbsp 180)]]` : "";
  const openPixelHtml = forExport ? `<img src="[[OPEN-PIXEL]]" width="1" height="1" alt="" style="width:1px;height:1px;display:block;">` : "";
  const onlineVersion = forExport ? "[[ONLINE-VERSION]]" : "#";
  const changeLanguageHref = forExport ? `[[LINK|"https://login.psv.nl/Dashboard/Profile"]]` : "https://login.psv.nl/Dashboard/Profile";
  const contactId = forExport ? "[[CONTACT|ID]]" : "000001";
  const checksum = forExport ? "[[CONTACT|CHECKSUM]]" : "abc123";
  const fullName = forExport ? "[[% contact 'FULLNAME' 'onbekend']]" : "John Doe";
  const emailAddr = forExport ? "[[% email]]" : "john@example.com";
  const memberNr = forExport ? "[[% contact 'MEMBERNUMBERPRIOR' 'onbekend']]" : "123456";
  const mv = (variable: string, preview: string) => forExport ? variable : preview;

  const prefsHref = `https://newsletter.psv.nl/hp/iFRp1MKUfY_Q39OWNy9vbA/psv-voorkeuren-algemeen?contactId=${contactId}&checksum=${checksum}`;
  const unsubHref = `https://newsletter.psv.nl/hp/5Tvm3Acs2ydwoB28ioz-ig/psv-uitschrijven-algemeen?contactId=${contactId}&checksum=${checksum}`;
  const changeEmailHref = forExport ? `[[LINK|"https://www.psv.nl/contact-1/e-mailadreswijziging"]]` : "https://www.psv.nl/contact-1/e-mailadreswijziging";
  const misNiksHref = forExport ? `[[LINK|"https://www.psv.nl/psv/mis-niks-van-psv.htm"]]` : "https://www.psv.nl/psv/mis-niks-van-psv.htm";

  const fbBase = "https://psv.typeform.com/to/ToXAKBFD";
  const fbParams = `typeform-medium=embed-email&email=${mv("[% email]","john@example.com")}&forename=${mv("[% contact 'FIRSTNAME' '-onbekend-']","John")}&surname=${mv("[% contact 'LASTNAME' '-Onbekend-']","Doe")}&groupid=${mv("[% contact 'EXTERNAL-ID' 'Onbekend']","0")}&emailname=${mv("[MAILING|NAME|]","Test")}&emailid=${mv("[MAILING|ID|]","0")}`;
  const fbPosHref = forExport ? `[[LINK|"${fbBase}?${fbParams}&answers-contentscore=0d872ebf-a707-4bc3-88f0-125a89faa327"]]` : `${fbBase}?${fbParams}&answers-contentscore=0d872ebf-a707-4bc3-88f0-125a89faa327`;
  const fbNegHref = forExport ? `[[LINK|"${fbBase}?${fbParams}&answers-contentscore=80ff86cc-c74e-4f6f-88f6-756bd7b5e6dc"]]` : `${fbBase}?${fbParams}&answers-contentscore=80ff86cc-c74e-4f6f-88f6-756bd7b5e6dc`;

  const cta1Href = forExport ? `[[LINK|"${utm(state.psvplayCta1Url)}"]]` : state.psvplayCta1Url || "#";
  const cta2Href = forExport ? `[[LINK|"${utm(state.psvplayCta2Url)}"]]` : state.psvplayCta2Url || "#";

  const introBlock = `
          <!-- Intro -->
          <tr>
            <td bgcolor="#ED1B24" style="background-color:#ED1B24;padding:20px 30px;text-align:center;">
              <p style="margin:0;font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;color:#ffffff;line-height:20px;">${state.psvplayIntroText}</p>
            </td>
          </tr>
          <tr>
            <td bgcolor="#ED1B24" style="background-color:#ED1B24;padding:10px 20px 0;text-align:center;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                href="${cta1Href}" style="height:36px;v-text-anchor:middle;width:220px;" arcsize="0%" stroke="t" strokecolor="#ED1B24" fillcolor="#ffffff">
                <w:anchorlock/>
                <center style="color:#ED1B24;font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;font-weight:bold;">${state.psvplayCta1Label}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 auto;">
                <tr>
                  <td bgcolor="#ffffff" style="background-color:#ffffff;border:2px solid #ED1B24;border-radius:0;">
                    <a href="${cta1Href}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:8px 20px;font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;font-weight:bold;color:#ED1B24;text-decoration:none;letter-spacing:0.5px;"
                    >${state.psvplayCta1Label}</a>
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>
          ${state.psvplayCta2Label ? `<tr>
            <td bgcolor="#ED1B24" style="background-color:#ED1B24;padding:10px 20px 20px;text-align:center;">
              <a href="${cta2Href}" target="_blank" rel="noopener noreferrer"
                 style="font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;color:#ffffff;text-decoration:none;line-height:20px;"
              >${state.psvplayCta2Label}</a>
            </td>
          </tr>` : `<tr><td bgcolor="#ED1B24" style="background-color:#ED1B24;height:20px;"></td></tr>`}`;

  const itemsHtml = state.psvplayItems.map((item, i) => {
    const imageLeft = i % 2 === 0;
    const itemImgSrc = imgSrc(item.imagePreviewUrl);
    const itemImgHref = item.imageLink ? (forExport ? `[[LINK|"${utm(item.imageLink)}"]]` : item.imageLink) : null;
    const itemCtaHref = forExport ? `[[LINK|"${utm(item.ctaUrl)}"]]` : item.ctaUrl || "#";
    const imgCell = `<td width="300" valign="middle" style="width:300px;padding:0;">
              ${itemImgHref ? `<a href="${itemImgHref}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;">` : ""}
              <img src="${itemImgSrc}" width="300" alt="${item.imageAlt}" style="display:block;width:100%;max-width:300px;height:auto;border:0;">
              ${itemImgHref ? "</a>" : ""}
            </td>`;
    const textCell = `<td width="300" valign="middle" style="width:300px;padding:20px;text-align:center;background-color:#000000;">
              <div style="margin:0 0 16px;font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;color:#ffffff;line-height:22px;">${item.quote}</div>
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                href="${itemCtaHref}" style="height:36px;v-text-anchor:middle;width:160px;" arcsize="0%" stroke="f" fillcolor="#E30613">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;font-weight:bold;">${item.ctaLabel}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 auto;">
                <tr>
                  <td bgcolor="#E30613" style="background-color:#E30613;">
                    <a href="${itemCtaHref}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:8px 16px;font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;"
                    >${item.ctaLabel}</a>
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>`;
    return `<tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0;">
              <table cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;" role="presentation">
                <tr>
                  ${imageLeft ? imgCell + textCell : textCell + imgCell}
                </tr>
              </table>
            </td>
          </tr>`;
  }).join("\n          ");

  const fbUrl = sl("https://www.facebook.com/PSV/");
  const igUrl = sl("https://www.instagram.com/psv/");
  const ytUrl = sl("https://www.youtube.com/user/psveindhoven");
  const xUrl = sl("https://twitter.com/PSV");
  const liUrl = sl("https://www.linkedin.com/company/psv/");
  const ttUrl = sl("https://www.tiktok.com/@psv");

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="nl">
<head>
  <!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="format-detection" content="telephone=no">
  <meta name="format-detection" content="date=no">
  <meta name="robots" content="noindex">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${titleText}</title>
  <link href="https://fonts.googleapis.com/css2?family=Titillium+Web:ital,wght@0,400;0,600;1,400;1,600&display=swap" rel="stylesheet">
  <style type="text/css">
    html,body{width:100%;height:100%;margin:0;padding:0;border:0;-webkit-text-size-adjust:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
    img,a img{-ms-interpolation-mode:bicubic;outline:none;}
    table,tbody,thead,tfoot,tr,td{padding:0;border-collapse:collapse;border-spacing:0;mso-table-lspace:0pt;mso-table-rspace:0pt;box-sizing:border-box;}
    td,p,a{mso-line-height-rule:exactly;}
    a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
    u + #maileon-body a{color:inherit!important;text-decoration:none!important;}
    #MessageViewBody a{color:inherit!important;text-decoration:none!important;}
  </style>
</head>
<body id="maileon-body" style="margin:0;padding:0;background-color:#000000;">
  ${openPixelHtml}
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;height:0;width:0;font-size:0;line-height:0;float:left;">${preheader}</div>
  <table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#000000" style="width:100%;background-color:#000000;" role="presentation">
    <tr>
      <td align="center" valign="top">
        <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;" role="presentation">

          <!-- Header strip -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:8px 10px 5px;text-align:right;">
              <span style="font-family:'Titillium Web',Verdana,sans-serif;font-size:10px;color:#ffffff;">
                <a href="${onlineVersion}" style="color:#ffffff;text-decoration:none;" target="_blank" rel="noopener noreferrer">Bekijk online</a>&nbsp;|&nbsp;<a href="${changeLanguageHref}" style="color:#ffffff;text-decoration:none;" target="_blank" rel="noopener noreferrer">Change language &#127468;&#127463;</a>
              </span>
            </td>
          </tr>

          <!-- PSV Play logo -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0;">
              <img src="${logoSrc}" width="600" alt="PSV Play" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td bgcolor="#ED1B24" style="background-color:#ED1B24;padding:20px 40px;">
              <div style="height:2px;background-color:#ffffff;font-size:2px;line-height:2px;">&nbsp;</div>
            </td>
          </tr>

          <!-- Hero image -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0;">
              ${state.heroLink ? `<a href="${forExport ? `[[LINK|"${utm(state.heroLink)}"]]` : state.heroLink}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;">` : ""}
              <img src="${heroSrc}" width="600" alt="${state.heroAlt || ""}" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
              ${state.heroLink ? "</a>" : ""}
            </td>
          </tr>

          ${introBlock}

          <!-- Spacer -->
          <tr><td bgcolor="#000000" style="background-color:#000000;height:20px;"></td></tr>

          <!-- Video items -->
          ${itemsHtml || ""}

          <!-- Pattern strip -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0;">
              <img src="${patternSrc}" width="600" alt="PSV Eindhoven" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
            </td>
          </tr>

          <!-- Feedback -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:20px 0 10px;text-align:center;">
              <p style="margin:0 0 10px;font-family:'Titillium Web',Verdana,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;line-height:140%;">Hoe scoorde deze e-mail bij jou?</p>
              <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 auto;">
                <tr>
                  <td style="padding:0 3px;"><a href="${fbPosHref}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/7P4UPmYQhoQ/media/feedback_positief.png" width="50" height="50" alt="Positief" style="display:block;width:50px;height:50px;border:0;"></a></td>
                  <td style="padding:0 3px;"><a href="${fbNegHref}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/srpCZd3lN1M/media/feedback_negatief.png" width="50" height="50" alt="Negatief" style="display:block;width:50px;height:50px;border:0;"></a></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Social -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:20px 0 10px;text-align:center;">
              <p style="margin:0 0 10px;font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;line-height:140%;">Volg ons ook via social media</p>
              <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 auto;">
                <tr>
                  <td style="padding:0 5px;"><a href="${fbUrl}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/MPFMFIXazuI/media/SOCIAL%20ICONEN%20-%20Facebook.png" width="30" height="30" alt="Facebook" style="display:block;width:30px;height:30px;border:0;"></a></td>
                  <td style="padding:0 5px;"><a href="${igUrl}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/Cl9D51zXm2k/media/SOCIAL%20ICONEN%20-%20Instagram.png" width="30" height="30" alt="Instagram" style="display:block;width:30px;height:30px;border:0;"></a></td>
                  <td style="padding:0 5px;"><a href="${ytUrl}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/osAm-N7-BI8/media/SOCIAL%20ICONEN%20-%20Youtube.png" width="30" height="30" alt="YouTube" style="display:block;width:30px;height:30px;border:0;"></a></td>
                  <td style="padding:0 5px;"><a href="${xUrl}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/HQ3giXVZxF0M_G5YVrvkXA/media/MicrosoftTeams-image%20(34).png" width="30" height="30" alt="X" style="display:block;width:30px;height:30px;border:0;"></a></td>
                  <td style="padding:0 5px;"><a href="${liUrl}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/dhHuvVyv91Y/media/SOCIAL%20ICONEN%20-%20Linkedin.png" width="30" height="30" alt="LinkedIn" style="display:block;width:30px;height:30px;border:0;"></a></td>
                  <td style="padding:0 5px;"><a href="${ttUrl}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/TfwTSJ01fKo/media/SOCIAL%20ICONEN%20-%20WIT_TIKTOK.png" width="30" height="30" alt="TikTok" style="display:block;width:30px;height:30px;border:0;"></a></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:30px 10px 20px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation">
                <tr><td style="height:1px;background-color:#ffffff;font-size:1px;line-height:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Contact info -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:20px 0;text-align:center;">
              <p style="margin:0;font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;line-height:140%;">
                Fullname: ${fullName}<br>
                E-mail: <a href="mailto:${emailAddr}" style="color:#ffffff;text-decoration:none;font-style:normal;">${emailAddr}</a><br>
                Membernummer: ${memberNr}
              </p>
            </td>
          </tr>

          <!-- Disclaimer -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0 20px 20px;text-align:center;">
              <p style="margin:0 auto;font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;line-height:140%;max-width:560px;">
                ${state.disclaimerTekst}&nbsp;&nbsp;<br><br>
                Wil je er zeker van zijn dat je geen e-mails van PSV mist? Voeg dan ons e-mailadres (<a href="${misNiksHref}" style="color:#ffffff;" target="_blank" rel="noopener noreferrer">${state.misNiksEmail}</a>) toe aan je adresboek en aan de lijst met veilige afzenders.
              </p>
            </td>
          </tr>

          <!-- Unsubscribe -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0 0 20px;text-align:center;">
              <p style="margin:0;font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;line-height:140%;">
                <i>
                  <a href="${prefsHref}" style="color:#ffffff;" target="_blank" rel="noopener noreferrer">Voorkeuren aanpassen</a>&nbsp; &nbsp;
                  <a href="${unsubHref}" style="color:#ffffff;" target="_blank" rel="noopener noreferrer">Volledig uitschrijven</a>&nbsp; &nbsp;
                  <a href="${changeEmailHref}" style="color:#ffffff;" target="_blank" rel="noopener noreferrer">Wijzig je e-mailadres</a>
                </i>
              </p>
            </td>
          </tr>

          <tr><td bgcolor="#000000" style="background-color:#000000;height:40px;"></td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function generatePsvBusinessHTML(state: MailBuilderState, forExport = false): string {
  const utm = (url: string) => forExport ? applyUtm(url, state.utmCampaign) : url;

  const toExportSrc = (previewUrl: string) =>
    previewUrl.startsWith(PREVIEW_CDN_HOST)
      ? previewUrl.replace(PREVIEW_CDN_HOST, MAILEON_CDN_HOST)
      : previewUrl;
  const imgSrc = (previewUrl: string) => forExport ? toExportSrc(previewUrl) : previewUrl;

  const heroSrc = imgSrc(state.heroPreviewUrl || state.heroUrl.replace(MAILEON_CDN_HOST, PREVIEW_CDN_HOST));
  const sponsorSrc = imgSrc(state.businessSponsorPreviewUrl || PSVBUSINESS_SPONSOR_PREVIEW);
  const patternSrc = forExport ? PSVBUSINESS_PATTERN_EXPORT : PSVBUSINESS_PATTERN_PREVIEW;

  const titleText = forExport ? "[[MAILING|SUBJECT|]]" : "PSV Business preview";
  const preheader = forExport ? `[[PREVIEW-TEXT|]][[% unescape_html (repeat zwnjnbsp 180)]]` : "";
  const openPixelHtml = forExport ? `<img src="[[OPEN-PIXEL]]" width="1" height="1" alt="" style="width:1px;height:1px;display:block;">` : "";
  const onlineVersion = forExport ? "[[ONLINE-VERSION]]" : "#";
  const unsubHref = forExport ? "[[UNSUBSCRIBE]]" : "#";
  const changeEmailHref = `mailto:business@psv.nl?subject=E-mailadres%20wijzigen&body=Beste%20PSV%20Business%20Support%2C%0A%0AMijn%20e-mailadres%20is%20gewijzigd.%20Mijn%20nieuwe%20e-mailadres%20is%3A`;
  const sponsorLinkHref = forExport ? `[[LINK|"https://www.psv.nl/business/home"]]` : "https://www.psv.nl/business/home";

  const aanhefResolved = resolveAanhef(state.aanhefText || "Hi {VOORNAAM}", forExport);

  const makeCtaRowBusiness = (label: string, href: string, bg: string) => `<tr>
      <td bgcolor="${bg}" style="background-color:${bg};padding:10px 20px 0;text-align:left;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
          href="${href}" style="height:36px;v-text-anchor:middle;width:260px;" arcsize="0%" stroke="f" fillcolor="#E30613">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:'Titillium Web',Verdana,sans-serif;font-size:16px;font-weight:bold;">${label}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <table cellpadding="0" cellspacing="0" border="0" role="presentation">
          <tr>
            <td bgcolor="#E30613" style="background-color:#E30613;border-radius:0;">
              <a href="${href}" target="_blank" rel="noopener noreferrer"
                 style="display:inline-block;padding:8px 14px;font-family:'Titillium Web',Verdana,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:0.5px;"
              >${label}</a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </td>
    </tr>`;

  const makeSecLinkRowBusiness = (label: string, href: string, bg: string, linkColor: string) => `<tr>
      <td bgcolor="${bg}" style="background-color:${bg};padding:10px 20px;text-align:left;">
        <a href="${href}" target="_blank" rel="noopener noreferrer"
           style="font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;color:${linkColor};text-decoration:none;line-height:20px;"
        >${label}</a>
      </td>
    </tr>`;

  const blocksHtml = state.blocks.map(block => {
    const cfg = BLOCK_BG_CONFIG[block.blockBg ?? "wit"];
    const contentRow = block.content
      ? `<tr><td bgcolor="${cfg.bg}" style="background-color:${cfg.bg};padding:20px;text-align:left;"><div style="font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;color:${cfg.text};line-height:20px;">${block.content}</div></td></tr>`
      : "";
    const bCtaHref = block.heeftCta && block.ctaUrl ? (forExport ? wrapLink(utm(block.ctaUrl)) : block.ctaUrl) : "#";
    const bSecHref = block.heeftSecLink && block.secLinkUrl ? (forExport ? wrapLink(utm(block.secLinkUrl)) : block.secLinkUrl) : "#";
    const ctaRow = block.heeftCta && block.ctaLabel ? makeCtaRowBusiness(block.ctaLabel, bCtaHref, cfg.bg) : "";
    const spacerRow = block.heeftCta && block.ctaLabel && !block.heeftSecLink
      ? `<tr><td bgcolor="${cfg.bg}" style="background-color:${cfg.bg};height:20px;font-size:20px;line-height:20px;">&nbsp;</td></tr>`
      : "";
    const secRow = block.heeftSecLink && block.secLinkLabel ? makeSecLinkRowBusiness(block.secLinkLabel, bSecHref, cfg.bg, cfg.link) : "";
    return contentRow + ctaRow + secRow + spacerRow;
  }).join("");

  const afsluitBlock = state.heeftAfsluitRegel && state.afsluitRegel
    ? `<tr>
        <td bgcolor="#ffffff" style="background-color:#ffffff;padding:10px 20px 20px;text-align:left;">
          <p style="margin:0;font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;color:#000000;line-height:20px;">${state.afsluitRegel}</p>
        </td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="nl">
<head>
  <!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="format-detection" content="telephone=no">
  <meta name="format-detection" content="date=no">
  <meta name="format-detection" content="address=no">
  <meta name="format-detection" content="email=no">
  <meta name="robots" content="noindex">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${titleText}</title>
  <link href="https://fonts.googleapis.com/css2?family=Titillium+Web:ital,wght@0,400;0,600;1,400;1,600&display=swap" rel="stylesheet">
  <style type="text/css">
    html,body{width:100%;height:100%;margin:0;padding:0;border:0;hyphens:none;-moz-hyphens:none;-webkit-hyphens:none;-webkit-text-size-adjust:none;word-break:normal;word-wrap:break-word;overflow-wrap:break-word;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
    h1,h2,h3,h4,h5,h6,div,b,u,i,p,br,font,strike,sub,sup,img{padding:0;margin:0;border:0;}
    img,a img{-ms-interpolation-mode:bicubic;outline:none;}
    table,tbody,thead,tfoot,tr,td{padding:0;border-collapse:collapse;border-spacing:0;mso-table-lspace:0pt;mso-table-rspace:0pt;box-sizing:border-box;}
    td,p,a,li,blockquote{mso-line-height-rule:exactly;}
    a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important;}
    u + #maileon-body a{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important;}
    #MessageViewBody a{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important;}
  </style>
</head>
<body id="maileon-body" style="margin:0;padding:0;background-color:#000000;">
  ${openPixelHtml}
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;height:0;width:0;max-width:0;font-size:0;line-height:0;float:left;">${preheader}</div>
  <table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#000000" style="width:100%;background-color:#000000;" role="presentation">
    <tr>
      <td align="center" valign="top">
        <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;" role="presentation">

          <!-- Header strip -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:8px 10px 5px;text-align:right;">
              <span style="font-family:'Titillium Web',Verdana,sans-serif;font-size:10px;color:#ffffff;">
                <a href="${onlineVersion}" style="color:#ffffff;text-decoration:none;" target="_blank" rel="noopener noreferrer">Bekijk online</a>
              </span>
            </td>
          </tr>

          <!-- Hero image -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0;">
              <img src="${heroSrc}" width="600" alt="${state.heroAlt || ""}" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
            </td>
          </tr>

          <!-- Aanhef -->
          <tr>
            <td bgcolor="#ffffff" style="background-color:#ffffff;padding:20px 20px 10px;text-align:left;">
              <p style="margin:0;padding:0;font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;font-weight:600;color:#000000;letter-spacing:0.65px;line-height:20px;">${aanhefResolved},</p>
            </td>
          </tr>

          <!-- Content blocks -->
          ${blocksHtml || `<tr><td bgcolor="#ffffff" style="background-color:#ffffff;height:10px;"></td></tr>`}

          <!-- Closing line -->
          ${afsluitBlock}

          <!-- Sponsor logos -->
          ${state.businessSponsorPreviewUrl || !forExport ? `<tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0;">
              <a href="${sponsorLinkHref}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;">
                <img src="${sponsorSrc}" width="600" alt="PSV Business partners" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
              </a>
            </td>
          </tr>` : ""}

          <!-- Pattern strip -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0;">
              <img src="${patternSrc}" width="600" alt="PSV Eindhoven" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
            </td>
          </tr>

          <!-- Footer text -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:20px;text-align:left;">
              <p style="margin:0 0 12px;font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;line-height:140%;font-style:italic;">
                ${state.disclaimerTekst}
              </p>
              <p style="margin:0 0 12px;font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;line-height:140%;font-style:italic;">
                Wil je er zeker van zijn dat je geen e-mails van PSV Business mist? Voeg dan ons e-mailadres (<a href="${forExport ? `[[LINK|"https://www.psv.nl/psv/mis-niks-van-psv.htm"]]` : "https://www.psv.nl/psv/mis-niks-van-psv.htm"}" style="color:#ffffff;" target="_blank" rel="noopener noreferrer">${state.misNiksEmail}</a>) toe aan je adresboek en aan de lijst met veilige afzenders.
              </p>
              <p style="margin:0 0 12px;font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;line-height:140%;font-style:italic;">
                PSV Business&nbsp; | &nbsp;Philips Stadion Ingang 8&nbsp; | &nbsp;+31 (0)40 2505 531&nbsp; | &nbsp;<a href="mailto:business@psv.nl" style="color:#ffffff;text-decoration:none;">business@psv.nl</a>
              </p>
              <p style="margin:0;font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;line-height:140%;font-style:italic;">
                <a href="${unsubHref}" style="color:#ffffff;" target="_blank" rel="noopener noreferrer">Meld je af</a>&nbsp; - &nbsp;<a href="${changeEmailHref}" style="color:#ffffff;" target="_blank" rel="noopener noreferrer">Wijzig je e-mailadres</a>
              </p>
            </td>
          </tr>

          <tr>
            <td bgcolor="#000000" style="background-color:#000000;height:40px;font-size:40px;line-height:40px;">&nbsp;</td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function generateEmailHTML(state: MailBuilderState, forExport = false): string {
  if (state.template === "prematch") return generatePrematchHTML(state, forExport);
  if (state.template === "psvplay") return generatePsvPlayHTML(state, forExport);
  if (state.template === "business") return generatePsvBusinessHTML(state, forExport);

  const isFS = state.template === "fanstore";
  const cdn = forExport ? MAILEON_CDN_HOST : PREVIEW_CDN_HOST;
  const utm = (url: string) => forExport ? applyUtm(url, state.utmCampaign) : url;

  const mv = (variable: string, preview: string) => forExport ? variable : preview;

  const previewUrl =
    state.heroPreviewUrl ||
    state.heroUrl.replace(MAILEON_CDN_HOST, PREVIEW_CDN_HOST);
  const heroSrc = forExport
    ? previewUrl.startsWith(PREVIEW_CDN_HOST)
      ? previewUrl.replace(PREVIEW_CDN_HOST, MAILEON_CDN_HOST)
      : state.heroUrl
    : previewUrl;

  const heroWrap = state.heroLink
    ? {
        open: `<a href="${forExport ? wrapLink(utm(state.heroLink)) : state.heroLink}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;">`,
        close: `</a>`,
      }
    : { open: "", close: "" };

  const fullName = mv("[[% contact 'FULLNAME' 'onbekend']]", "John Doe");
  const emailAddr = mv("[[% email]]", "john@example.com");
  const memberNr = mv("[[% contact 'MEMBERNUMBERPRIOR' 'onbekend']]", "123456");
  const contactId = mv("[[CONTACT|ID]]", "000001");
  const checksum = mv("[[CONTACT|CHECKSUM]]", "abc123");

  const aanhefResolved = resolveAanhef(state.aanhefText || "Hi {VOORNAAM}", forExport);

  const fbBase = "https://psv.typeform.com/to/ToXAKBFD";
  const fbParams = `typeform-medium=embed-email&email=${mv("[% email]","john@example.com")}&forename=${mv("[% contact 'FIRSTNAME' '-onbekend-']","John")}&surname=${mv("[% contact 'LASTNAME' '-Onbekend-']","Doe")}&groupid=${mv("[% contact 'EXTERNAL-ID' 'Onbekend']","0")}&emailname=${mv("[MAILING|NAME|]","Test")}&emailid=${mv("[MAILING|ID|]","0")}`;
  const fbPosHref = forExport
    ? `[[LINK|"${fbBase}?${fbParams}&answers-contentscore=0d872ebf-a707-4bc3-88f0-125a89faa327"]]`
    : `${fbBase}?${fbParams}&answers-contentscore=0d872ebf-a707-4bc3-88f0-125a89faa327`;
  const fbNegHref = forExport
    ? `[[LINK|"${fbBase}?${fbParams}&answers-contentscore=80ff86cc-c74e-4f6f-88f6-756bd7b5e6dc"]]`
    : `${fbBase}?${fbParams}&answers-contentscore=80ff86cc-c74e-4f6f-88f6-756bd7b5e6dc`;

  const sl = (url: string) => (forExport ? `[[LINK|"${url}"]]` : url);
  const fbUrl = sl("https://www.facebook.com/PSV/");
  const igUrl = sl("https://www.instagram.com/psv/");
  const ytUrl = sl("https://www.youtube.com/user/psveindhoven");
  const xUrl = sl("https://twitter.com/PSV");
  const liUrl = sl("https://www.linkedin.com/company/psv/");
  const ttUrl = sl("https://www.tiktok.com/@psv");

  const prefsHref = `https://newsletter.psv.nl/hp/iFRp1MKUfY_Q39OWNy9vbA/psv-voorkeuren-algemeen?contactId=${contactId}&checksum=${checksum}`;
  const unsubHref = `https://newsletter.psv.nl/hp/5Tvm3Acs2ydwoB28ioz-ig/psv-uitschrijven-algemeen?contactId=${contactId}&checksum=${checksum}`;
  const changeEmailHref = forExport
    ? `[[LINK|"https://www.psv.nl/contact-1/e-mailadreswijziging"]]`
    : "https://www.psv.nl/contact-1/e-mailadreswijziging";
  const misNiksHref = forExport
    ? `[[LINK|"https://www.psv.nl/psv/mis-niks-van-psv.htm"]]`
    : "https://www.psv.nl/psv/mis-niks-van-psv.htm";

  const titleText = forExport ? "[[MAILING|SUBJECT|]]" : "E-mail preview";
  const preheader = forExport ? `[[PREVIEW-TEXT|]][[% unescape_html (repeat zwnjnbsp 180)]]` : "";
  const openPixelHtml = forExport
    ? `<img src="[[OPEN-PIXEL]]" width="1" height="1" alt="" style="width:1px;height:1px;display:block;">`
    : "";
  const onlineVersion = forExport ? "[[ONLINE-VERSION]]" : "#";
  const changeLanguageHref = forExport
    ? `[[LINK|"https://login.psv.nl/Dashboard/Profile"]]`
    : "https://login.psv.nl/Dashboard/Profile";

  // FANstore navbar with editable URLs
  const fsNavUrl = (url: string) => forExport ? wrapLink(utm(url)) : url || "#";
  const logoBlock = isFS
    ? `<tr>
        <td bgcolor="#ffffff" style="background-color:#ffffff;padding:0;">
          <img src="${cdn}/c/3zu9kpkvY_MQ1abjXEIUGQ/media/4676%20Gifting%202025%20MAILING%20-%20algemeen%20-%2001.jpg" width="600" alt="PSV FANstore" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
        </td>
      </tr>
      <tr>
        <td bgcolor="#ED1B24" style="background-color:#ED1B24;padding:12px 0;text-align:center;">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 auto;">
            <tr>
              <td style="padding:0 16px;font-family:'Titillium Web',Verdana,sans-serif;font-size:13px;font-weight:600;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;border-right:2px solid #c8111a;"><a href="${fsNavUrl(state.fanstoreNavWedstrijdUrl)}" style="color:#ffffff;text-decoration:none;">WEDSTRIJD</a></td>
              <td style="padding:0 16px;font-family:'Titillium Web',Verdana,sans-serif;font-size:13px;font-weight:600;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;border-right:2px solid #c8111a;"><a href="${fsNavUrl(state.fanstoreNavTrainingUrl)}" style="color:#ffffff;text-decoration:none;">TRAINING</a></td>
              <td style="padding:0 16px;font-family:'Titillium Web',Verdana,sans-serif;font-size:13px;font-weight:600;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;border-right:2px solid #c8111a;"><a href="${fsNavUrl(state.fanstoreNavNieuwUrl)}" style="color:#ffffff;text-decoration:none;">NIEUW</a></td>
              <td style="padding:0 16px;font-family:'Titillium Web',Verdana,sans-serif;font-size:13px;font-weight:600;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;"><a href="${fsNavUrl(state.fanstoreNavSaleUrl)}" style="color:#ffffff;text-decoration:none;">SALE</a></td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td bgcolor="#000000" style="background-color:#000000;padding:8px 0;text-align:center;">
          <span style="font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;">Voor 20.00 uur besteld = vandaag verzonden</span>
        </td>
      </tr>`
    : ""; // kaartverkoop/soccerschool/tours: no logo block

  const makeCtaRow = (label: string, href: string, bg: string) => `<tr>
      <td bgcolor="${bg}" style="background-color:${bg};padding:10px 20px 0;text-align:center;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
          href="${href}" style="height:36px;v-text-anchor:middle;width:260px;" arcsize="0%" stroke="f" fillcolor="#E30613">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:'Titillium Web',Verdana,sans-serif;font-size:16px;font-weight:bold;">${label}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 auto;">
          <tr>
            <td bgcolor="#E30613" style="background-color:#E30613;border-radius:0;">
              <a href="${href}" target="_blank" rel="noopener noreferrer"
                 style="display:inline-block;padding:8px 14px;font-family:'Titillium Web',Verdana,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:0.5px;"
              >${label}</a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </td>
    </tr>`;

  const makeSecLinkRow = (label: string, href: string, bg: string, linkColor: string) => `<tr>
      <td bgcolor="${bg}" style="background-color:${bg};padding:10px 20px;text-align:center;">
        <a href="${href}" target="_blank" rel="noopener noreferrer"
           style="font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;color:${linkColor};text-decoration:none;line-height:20px;"
        >${label}</a>
      </td>
    </tr>`;

  const blocksHtml = state.blocks.map(block => {
    const cfg = BLOCK_BG_CONFIG[block.blockBg ?? "wit"];
    const contentRow = block.content
      ? `<tr><td bgcolor="${cfg.bg}" width="600" style="background-color:${cfg.bg};padding:20px;text-align:center;width:100%;"><div style="font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;color:${cfg.text};line-height:20px;text-align:center;">${block.content}</div></td></tr>`
      : "";
    const bCtaHref = block.heeftCta && block.ctaUrl
      ? (forExport ? wrapLink(utm(block.ctaUrl)) : block.ctaUrl)
      : "#";
    const bSecHref = block.heeftSecLink && block.secLinkUrl
      ? (forExport ? wrapLink(utm(block.secLinkUrl)) : block.secLinkUrl)
      : "#";
    const ctaRow = block.heeftCta && block.ctaLabel ? makeCtaRow(block.ctaLabel, bCtaHref, cfg.bg) : "";
    const spacerRow = block.heeftCta && block.ctaLabel && !block.heeftSecLink
      ? `<tr><td bgcolor="${cfg.bg}" style="background-color:${cfg.bg};height:20px;font-size:20px;line-height:20px;">&nbsp;</td></tr>`
      : "";
    const secRow = block.heeftSecLink && block.secLinkLabel ? makeSecLinkRow(block.secLinkLabel, bSecHref, cfg.bg, cfg.link) : "";
    return contentRow + ctaRow + secRow + spacerRow;
  }).join("");

  const afsluitBlock =
    state.heeftAfsluitRegel && state.afsluitRegel
      ? `<tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff;padding:10px 20px 20px;text-align:center;">
            <p style="margin:0;font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;color:#000000;line-height:20px;">${state.afsluitRegel}</p>
          </td>
        </tr>`
      : "";

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="nl">
<head>
  <!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="format-detection" content="telephone=no">
  <meta name="format-detection" content="date=no">
  <meta name="format-detection" content="address=no">
  <meta name="format-detection" content="email=no">
  <meta name="robots" content="noindex">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${titleText}</title>
  <link href="https://fonts.googleapis.com/css2?family=Titillium+Web:ital,wght@0,400;0,600;1,400;1,600&display=swap" rel="stylesheet">
  <style type="text/css">
    html,body{width:100%;height:100%;margin:0;padding:0;border:0;hyphens:none;-moz-hyphens:none;-webkit-hyphens:none;-webkit-text-size-adjust:none;word-break:normal;word-wrap:break-word;overflow-wrap:break-word;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
    h1,h2,h3,h4,h5,h6,div,b,u,i,p,br,font,strike,sub,sup,img{padding:0;margin:0;border:0;}
    img,a img{-ms-interpolation-mode:bicubic;outline:none;}
    table,tbody,thead,tfoot,tr,td{padding:0;border-collapse:collapse;border-spacing:0;mso-table-lspace:0pt;mso-table-rspace:0pt;box-sizing:border-box;}
    td,p,a,li,blockquote{mso-line-height-rule:exactly;}
    a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important;}
    u + #maileon-body a{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important;}
    #MessageViewBody a{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important;}
  </style>
</head>
<body id="maileon-body" style="margin:0;padding:0;background-color:#000000;">
  ${openPixelHtml}
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;height:0;width:0;max-width:0;font-size:0;line-height:0;float:left;">${preheader}</div>
  <table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#000000" style="width:100%;background-color:#000000;" role="presentation">
    <tr>
      <td align="center" valign="top">
        <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;" role="presentation">

          <!-- Header strip -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:8px 10px 5px;text-align:right;">
              <span style="font-family:'Titillium Web',Verdana,sans-serif;font-size:10px;color:#ffffff;">
                <a href="${onlineVersion}" style="color:#ffffff;text-decoration:none;font-family:'Titillium Web',Verdana,sans-serif;font-size:10px;" target="_blank" rel="noopener noreferrer">Bekijk online</a>&nbsp;|&nbsp;<a href="${changeLanguageHref}" style="color:#ffffff;text-decoration:none;font-family:'Titillium Web',Verdana,sans-serif;font-size:10px;" target="_blank" rel="noopener noreferrer">Change language &#127468;&#127463;</a>
              </span>
            </td>
          </tr>

          <!-- Logo block (FANstore only) -->
          ${logoBlock}

          <!-- Hero image -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0;">
              ${heroWrap.open}<img src="${heroSrc}" width="600" alt="${state.heroAlt || ""}" style="display:block;width:100%;max-width:600px;height:auto;border:0;">${heroWrap.close}
            </td>
          </tr>

          <!-- Aanhef -->
          <tr>
            <td bgcolor="#ffffff" style="background-color:#ffffff;padding:20px 20px 10px;text-align:center;">
              <p style="margin:0;padding:0;font-family:'Titillium Web',Verdana,sans-serif;font-size:16px;font-weight:600;color:#ED1B24;letter-spacing:0.65px;line-height:20px;"><b>${aanhefResolved},</b></p>
            </td>
          </tr>

          <!-- Content blocks -->
          ${blocksHtml || `<tr><td bgcolor="#ffffff" style="background-color:#ffffff;height:10px;"></td></tr>`}

          <!-- Closing line -->
          ${afsluitBlock}

          <!-- Pattern strip -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0;">
              <img src="${cdn}/c/dF1ELngs71b8asmA4Jnn0Q/media/0000%20Pre-Match%20VR%20-%2013%20ADOPSV%2008.jpg" width="600" alt="Eendracht maakt macht" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
            </td>
          </tr>

          <!-- Feedback -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:20px 0 10px;text-align:center;">
              <p style="margin:0 0 10px;font-family:'Titillium Web',Verdana,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;line-height:140%;">Hoe scoorde deze e-mail bij jou?</p>
              <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 auto;">
                <tr>
                  <td style="padding:0 3px;"><a href="${fbPosHref}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/7P4UPmYQhoQ/media/feedback_positief.png" width="50" height="50" alt="Positief" style="display:block;width:50px;height:50px;border:0;"></a></td>
                  <td style="padding:0 3px;"><a href="${fbNegHref}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/srpCZd3lN1M/media/feedback_negatief.png" width="50" height="50" alt="Negatief" style="display:block;width:50px;height:50px;border:0;"></a></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Social -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:20px 0 10px;text-align:center;">
              <p style="margin:0 0 10px;font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;line-height:140%;">Volg ons ook via social media</p>
              <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 auto;">
                <tr>
                  <td style="padding:0 5px;"><a href="${fbUrl}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/MPFMFIXazuI/media/SOCIAL%20ICONEN%20-%20Facebook.png" width="30" height="30" alt="Facebook" style="display:block;width:30px;height:30px;border:0;"></a></td>
                  <td style="padding:0 5px;"><a href="${igUrl}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/Cl9D51zXm2k/media/SOCIAL%20ICONEN%20-%20Instagram.png" width="30" height="30" alt="Instagram" style="display:block;width:30px;height:30px;border:0;"></a></td>
                  <td style="padding:0 5px;"><a href="${ytUrl}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/osAm-N7-BI8/media/SOCIAL%20ICONEN%20-%20Youtube.png" width="30" height="30" alt="YouTube" style="display:block;width:30px;height:30px;border:0;"></a></td>
                  <td style="padding:0 5px;"><a href="${xUrl}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/HQ3giXVZxF0M_G5YVrvkXA/media/MicrosoftTeams-image%20(34).png" width="30" height="30" alt="X" style="display:block;width:30px;height:30px;border:0;"></a></td>
                  <td style="padding:0 5px;"><a href="${liUrl}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/dhHuvVyv91Y/media/SOCIAL%20ICONEN%20-%20Linkedin.png" width="30" height="30" alt="LinkedIn" style="display:block;width:30px;height:30px;border:0;"></a></td>
                  <td style="padding:0 5px;"><a href="${ttUrl}" target="_blank" rel="noopener noreferrer"><img src="${cdn}/c/TfwTSJ01fKo/media/SOCIAL%20ICONEN%20-%20WIT_TIKTOK.png" width="30" height="30" alt="TikTok" style="display:block;width:30px;height:30px;border:0;"></a></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:30px 10px 20px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation">
                <tr><td style="height:1px;background-color:#ffffff;font-size:1px;line-height:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Contact info -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:20px 0;text-align:center;">
              <p style="margin:0;font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;line-height:140%;">
                Fullname: ${fullName}<br>
                E-mail: <a href="mailto:${emailAddr}" style="color:#ffffff;text-decoration:none;font-style:normal;">${emailAddr}</a><br>
                Membernummer: ${memberNr}
              </p>
            </td>
          </tr>

          <!-- Disclaimer -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0 20px 20px;text-align:center;">
              <p style="margin:0 auto;font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;line-height:140%;max-width:560px;">
                ${state.disclaimerTekst}&nbsp;&nbsp;<br><br>
                Wil je er zeker van zijn dat je geen e-mails van PSV mist? Voeg dan ons e-mailadres (<a href="${misNiksHref}" style="color:#ffffff;" target="_blank" rel="noopener noreferrer">${state.misNiksEmail}</a>) toe aan je adresboek en aan de lijst met veilige afzenders.
              </p>
            </td>
          </tr>

          <!-- Unsubscribe -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0 0 20px;text-align:center;">
              <p style="margin:0;font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;line-height:140%;">
                <i>
                  <a href="${prefsHref}" style="color:#ffffff;" target="_blank" rel="noopener noreferrer">Voorkeuren aanpassen</a>&nbsp; &nbsp;
                  <a href="${unsubHref}" style="color:#ffffff;" target="_blank" rel="noopener noreferrer">Volledig uitschrijven</a>&nbsp; &nbsp;
                  <a href="${changeEmailHref}" style="color:#ffffff;" target="_blank" rel="noopener noreferrer">Wijzig je e-mailadres</a>
                </i>
              </p>
            </td>
          </tr>

          <!-- Spacer -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;height:40px;font-size:40px;line-height:40px;">&nbsp;</td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

function Toggle({
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
// Footer card (collapsible)
// ---------------------------------------------------------------------------

function FooterCard({
  state,
  set,
}: {
  state: MailBuilderState;
  set: <K extends keyof MailBuilderState>(key: K, value: MailBuilderState[K]) => void;
}) {
  const [open, setOpen] = useState(false);
  if (state.template === "prematch") return null;

  return (
    <Card>
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Footer</CardTitle>
            {open ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CardHeader>
      </button>
      {open && (
        <CardContent className="space-y-4 pt-0">
          <div className="space-y-2">
            <Label htmlFor="disclaimerTekst">Disclaimer-tekst</Label>
            <Textarea
              id="disclaimerTekst"
              value={state.disclaimerTekst}
              onChange={(e) => set("disclaimerTekst", e.target.value)}
              className="min-h-[80px] text-xs"
            />
            <p className="text-xs text-muted-foreground">
              De zin &ldquo;Wil je er zeker van zijn…&rdquo; wordt altijd automatisch toegevoegd.
              {state.template === "business" && " De Business-contactregel en uitschrijflinks staan vast in het template."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="misNiksEmail">{state.template === "business" ? `"Mis niks" e-mailadres (PSV Business)` : `"Mis niks van PSV" e-mailadres`}</Label>
            <Input
              id="misNiksEmail"
              value={state.misNiksEmail}
              onChange={(e) => set("misNiksEmail", e.target.value)}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Prematch form
// ---------------------------------------------------------------------------

function PrematchImageRow({
  label,
  previewKey,
  altKey,
  state,
  set,
}: {
  label: string;
  previewKey: keyof MailBuilderState;
  altKey: keyof MailBuilderState;
  state: MailBuilderState;
  set: <K extends keyof MailBuilderState>(key: K, value: MailBuilderState[K]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        placeholder="https://images.maileon-static.com/…"
        value={state[previewKey] as string}
        onChange={(e) => set(previewKey, e.target.value)}
      />
      <Input
        placeholder="Alt-tekst"
        value={state[altKey] as string}
        onChange={(e) => set(altKey, e.target.value)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const PREVIEW_HEIGHT = 820;

export function MailBuilderForm() {
  const [state, setState] = useState<MailBuilderState>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mail-builder-draft-kaartverkoop");
        if (saved) return migrateState(JSON.parse(saved));
      } catch {}
    }
    return makeInitialState("kaartverkoop");
  });

  const [previewHtml, setPreviewHtml] = useState("");
  const [device, setDevice] = useState<DevicePreset>("desktop");
  const [simulations, setSimulations] = useState<Set<Simulation>>(new Set());
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aanhefInputRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);

  function updateBlock<K extends keyof BodyBlock>(i: number, key: K, value: BodyBlock[K]) {
    setState((prev) => {
      const next = [...prev.blocks];
      next[i] = { ...next[i], [key]: value };
      return { ...prev, blocks: next };
    });
  }

  function addBlock() {
    setState((prev) => ({ ...prev, blocks: [...prev.blocks, newBlock()] }));
  }

  function removeBlock(i: number) {
    setState((prev) => ({ ...prev, blocks: prev.blocks.filter((_, idx) => idx !== i) }));
  }

  function moveBlock(from: number, to: number) {
    if (from === to) return;
    setState((prev) => {
      const next = [...prev.blocks];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return { ...prev, blocks: next };
    });
  }

  function insertAanhefToken(token: string) {
    const el = aanhefInputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    set("aanhefText", next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  // Persist draft
  useEffect(() => {
    try {
      localStorage.setItem(`mail-builder-draft-${state.template}`, JSON.stringify(state));
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
        const saved = localStorage.getItem(`mail-builder-draft-${t}`);
        if (saved) {
          setState(migrateState(JSON.parse(saved)));
          return;
        }
      } catch {}
    }
    setState(makeInitialState(t));
  }

  function handleDownload() {
    const html = generateEmailHTML(state, true);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().split("T")[0];
    a.download = `psv-mail-${state.template}-${date}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  }

  async function handleCopy() {
    const html = generateEmailHTML(state, true);
    await navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleImageUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/maileon-upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "Onbekende fout bij uploaden.");
        return;
      }
      set("heroPreviewUrl", data.previewUrl);
    } catch {
      setUploadError("Verbindingsfout — is de server bereikbaar?");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const isPrematch = state.template === "prematch";
  const isPsvPlay = state.template === "psvplay";
  const isBusiness = state.template === "business";
  const isFS = state.template === "fanstore";

  const preset = DEVICE_PRESETS[device];
  const scaledWidth = Math.round(600 * preset.scale);
  const scaledHeight = Math.round(PREVIEW_HEIGHT * preset.scale);

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      {/* ---- Left column: form cards ---- */}
      <div className="w-full xl:w-[440px] xl:flex-shrink-0 space-y-4">

        {/* BASIS */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Basis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={state.template} onValueChange={(v) => handleTemplateChange(v as Template)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="business">PSV Business</SelectItem>
                  <SelectItem value="fanstore">PSV FANstore</SelectItem>
                  <SelectItem value="kaartverkoop">PSV Kaartverkoop</SelectItem>
                  <SelectItem value="prematch">PSV 1 Pre-match</SelectItem>
                  <SelectItem value="partnerships">PSV Partnerships</SelectItem>
                  <SelectItem value="psvplay">PSV Play</SelectItem>
                  <SelectItem value="soccerschool">PSV Soccer School</SelectItem>
                  <SelectItem value="tours">PSV Tours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!isPrematch && !isPsvPlay && (
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
          </CardContent>
        </Card>

        {/* PREMATCH: image fields */}
        {isPrematch && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Afbeeldingen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {state.prematchImages.map((img, i) => (
                <div key={img.id} className="rounded-md border border-input bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Afbeelding {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => set("prematchImages", state.prematchImages.filter((_, j) => j !== i))}
                      className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Verwijder afbeelding"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Input
                    placeholder="https://images.maileon-static.com/c/…"
                    value={img.previewUrl}
                    onChange={(e) => set("prematchImages", state.prematchImages.map((it, j) => j === i ? { ...it, previewUrl: e.target.value } : it))}
                    className="h-8 text-xs"
                  />
                  <Input
                    placeholder="Alt-tekst"
                    value={img.alt}
                    onChange={(e) => set("prematchImages", state.prematchImages.map((it, j) => j === i ? { ...it, alt: e.target.value } : it))}
                    className="h-8 text-xs"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => set("prematchImages", [...state.prematchImages, newPrematchImage()])}
                className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Afbeelding toevoegen
              </button>
              <div className="pt-1 border-t border-border">
                <PrematchImageRow
                  label="Footer"
                  previewKey="prematchFooterPreviewUrl"
                  altKey="prematchFooterAlt"
                  state={state}
                  set={set}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* HERO AFBEELDING */}
        {!isPrematch && !isPsvPlay && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Hero afbeelding</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="heroPreviewUrl">Afbeelding</Label>
                <div className="flex gap-2">
                  <Input
                    id="heroPreviewUrl"
                    placeholder="https://images.maileon-static.com/c/…"
                    value={state.heroPreviewUrl}
                    onChange={(e) => set("heroPreviewUrl", e.target.value)}
                    className="flex-1 min-w-0"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    {uploading ? "Uploaden…" : "Upload"}
                  </Button>
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
                </div>
                {uploadError && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {uploadError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Upload direct naar Maileon, of plak een bestaande URL. Export-URL wordt automatisch afgeleid.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="heroAlt">Alt-tekst</Label>
                <Input
                  id="heroAlt"
                  placeholder="Scoor nu je tickets"
                  value={state.heroAlt}
                  onChange={(e) => set("heroAlt", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="heroLink">Klik-link (optioneel)</Label>
                <Input
                  id="heroLink"
                  placeholder="https://ticketshop.psv.nl/…"
                  value={state.heroLink}
                  onChange={(e) => set("heroLink", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* PSV BUSINESS: Sponsor-balk */}
        {isBusiness && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Sponsor-balk</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="businessSponsorUrl">Afbeelding</Label>
                <Input
                  id="businessSponsorUrl"
                  placeholder="https://images.maileon-static.com/c/…"
                  value={state.businessSponsorPreviewUrl}
                  onChange={(e) => set("businessSponsorPreviewUrl", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Seizoensgebonden sponsorbalk. Export-URL wordt automatisch afgeleid.
                </p>
              </div>
            </CardContent>
          </Card>
        )}



        {/* PSV PLAY */}
        {isPsvPlay && (
          <>
            {/* Hero afbeelding (PSV Play) */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Hero afbeelding</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ppHeroUrl">Afbeelding</Label>
                  <Input
                    id="ppHeroUrl"
                    placeholder="https://images.maileon-static.com/c/…"
                    value={state.heroPreviewUrl}
                    onChange={(e) => set("heroPreviewUrl", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ppHeroAlt">Alt-tekst</Label>
                  <Input id="ppHeroAlt" value={state.heroAlt} onChange={(e) => set("heroAlt", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ppHeroLink">Klik-link (optioneel)</Label>
                  <Input id="ppHeroLink" value={state.heroLink} onChange={(e) => set("heroLink", e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {/* Intro + CTAs */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Intro</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ppIntro">Tekst (rood blok)</Label>
                  <Textarea
                    id="ppIntro"
                    placeholder="Beschrijving van de video of het thema…"
                    value={state.psvplayIntroText}
                    onChange={(e) => set("psvplayIntroText", e.target.value)}
                    className="min-h-[80px] text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>CTA-knop</Label>
                  <Input placeholder="BEKIJK OP PSV PLAY" value={state.psvplayCta1Label} onChange={(e) => set("psvplayCta1Label", e.target.value)} />
                  <Input placeholder="https://www.psv.nl/psv-play" value={state.psvplayCta1Url} onChange={(e) => set("psvplayCta1Url", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Secundaire link (optioneel)</Label>
                  <Input placeholder="Meer over PSV Play >" value={state.psvplayCta2Label} onChange={(e) => set("psvplayCta2Label", e.target.value)} />
                  <Input placeholder="https://www.psv.nl/psv-play" value={state.psvplayCta2Url} onChange={(e) => set("psvplayCta2Url", e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {/* Video items */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Video items</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {state.psvplayItems.map((item, i) => (
                  <div key={item.id} className="rounded-md border border-input bg-card p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Item {i + 1} — foto {i % 2 === 0 ? "links" : "rechts"}</span>
                      <button
                        type="button"
                        onClick={() => set("psvplayItems", state.psvplayItems.filter((_, j) => j !== i))}
                        className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Verwijder item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      <Input
                        placeholder="https://images.maileon-static.com/c/…"
                        value={item.imagePreviewUrl}
                        onChange={(e) => set("psvplayItems", state.psvplayItems.map((it, j) => j === i ? { ...it, imagePreviewUrl: e.target.value } : it))}
                        className="h-8 text-xs"
                      />
                      <div className="flex gap-2">
                        <Input
                          placeholder="Alt-tekst"
                          value={item.imageAlt}
                          onChange={(e) => set("psvplayItems", state.psvplayItems.map((it, j) => j === i ? { ...it, imageAlt: e.target.value } : it))}
                          className="h-8 text-xs flex-1"
                        />
                        <Input
                          placeholder="Klik-link (opt.)"
                          value={item.imageLink}
                          onChange={(e) => set("psvplayItems", state.psvplayItems.map((it, j) => j === i ? { ...it, imageLink: e.target.value } : it))}
                          className="h-8 text-xs flex-1"
                        />
                      </div>
                      <RichTextEditor
                        value={item.quote}
                        onChange={(html) => set("psvplayItems", state.psvplayItems.map((it, j) => j === i ? { ...it, quote: html } : it))}
                        className="min-h-[60px] text-xs"
                      />
                      <div className="flex gap-2">
                        <Input
                          placeholder="BEKIJK NU"
                          value={item.ctaLabel}
                          onChange={(e) => set("psvplayItems", state.psvplayItems.map((it, j) => j === i ? { ...it, ctaLabel: e.target.value } : it))}
                          className="h-8 text-xs w-36 flex-shrink-0"
                        />
                        <Input
                          placeholder="https://www.psv.nl/psv-play"
                          value={item.ctaUrl}
                          onChange={(e) => set("psvplayItems", state.psvplayItems.map((it, j) => j === i ? { ...it, ctaUrl: e.target.value } : it))}
                          className="h-8 text-xs flex-1"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => set("psvplayItems", [...state.psvplayItems, newPsvPlayItem()])}
                  className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Item toevoegen
                </button>
              </CardContent>
            </Card>
          </>
        )}

        {/* INHOUD */}
        {!isPrematch && !isPsvPlay && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Inhoud</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="aanhefText">Aanhef</Label>
                <Input
                  ref={aanhefInputRef}
                  id="aanhefText"
                  placeholder="Hi {VOORNAAM}"
                  value={state.aanhefText}
                  onChange={(e) => set("aanhefText", e.target.value)}
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => insertAanhefToken("{VOORNAAM}")}
                    className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    + Voornaam
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAanhefToken("{VOLLEDIGE NAAM}")}
                    className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    + Volledige naam
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Klik op een knop om personalisatie in te voegen. Fallback is altijd <em>PSV-fan</em>.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Blokken</Label>
                <div className="space-y-3">
                  {state.blocks.map((block, i) => (
                    <div
                      key={block.id}
                      draggable
                      onDragStart={() => { dragIndex.current = i; }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => { if (dragIndex.current !== null) moveBlock(dragIndex.current, i); dragIndex.current = null; }}
                      className="rounded-md border border-input bg-card p-3 space-y-2"
                    >
                      {/* Block header */}
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">Blok {i + 1}</span>
                        <div className="ml-auto flex items-center gap-2">
                          {(["wit", "grijs", "rood", "zwart"] as const).map((bg) => {
                            const cfg = BLOCK_BG_CONFIG[bg];
                            return (
                              <button
                                key={bg}
                                type="button"
                                title={bg.charAt(0).toUpperCase() + bg.slice(1)}
                                onClick={() => updateBlock(i, "blockBg", bg)}
                                className={cn(
                                  "h-5 w-5 rounded-sm border transition-all",
                                  block.blockBg === bg
                                    ? "border-primary ring-2 ring-primary ring-offset-1 scale-110"
                                    : "border-input hover:border-primary/50"
                                )}
                                style={{ backgroundColor: cfg.bg }}
                              />
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => removeBlock(i)}
                            className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                            aria-label="Verwijder blok"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {/* Content */}
                      <RichTextEditor
                        value={block.content}
                        onChange={(v) => updateBlock(i, "content", v)}
                        className="min-h-[80px]"
                      />
                      <p className="text-xs text-muted-foreground">⌘B vet · ⌘I cursief · ⌘U onderstreept</p>
                      {/* CTA toggle */}
                      <div className="space-y-2 border-t border-input pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">CTA-knop</span>
                          <Toggle checked={block.heeftCta} onChange={(v) => updateBlock(i, "heeftCta", v)} />
                        </div>
                        {block.heeftCta && (
                          <div className="space-y-1.5 pl-3 border-l-2 border-primary/20">
                            <Input
                              placeholder="SCOOR DE ALLERLAATSTE TICKETS"
                              value={block.ctaLabel}
                              onChange={(e) => updateBlock(i, "ctaLabel", e.target.value)}
                              className="h-8 text-xs"
                            />
                            <Input
                              placeholder="https://ticketshop.psv.nl/…"
                              value={block.ctaUrl}
                              onChange={(e) => updateBlock(i, "ctaUrl", e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                        )}
                      </div>
                      {/* Secondary link toggle */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">Secundaire link</span>
                          <Toggle checked={block.heeftSecLink} onChange={(v) => updateBlock(i, "heeftSecLink", v)} />
                        </div>
                        {block.heeftSecLink && (
                          <div className="space-y-1.5 pl-3 border-l-2 border-primary/20">
                            <Input
                              placeholder="Bekijk alle wedstrijden >"
                              value={block.secLinkLabel}
                              onChange={(e) => updateBlock(i, "secLinkLabel", e.target.value)}
                              className="h-8 text-xs"
                            />
                            <Input
                              placeholder="https://ticketshop.psv.nl/…"
                              value={block.secLinkUrl}
                              onChange={(e) => updateBlock(i, "secLinkUrl", e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addBlock}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Blok toevoegen
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Afsluitende regel</Label>
                  <Toggle
                    checked={state.heeftAfsluitRegel}
                    onChange={(v) => set("heeftAfsluitRegel", v)}
                  />
                </div>
                {state.heeftAfsluitRegel && (
                  <div className="pl-3 border-l-2 border-primary/20">
                    <Input
                      placeholder="Tot ziens in het Philips Stadion!"
                      value={state.afsluitRegel}
                      onChange={(e) => set("afsluitRegel", e.target.value)}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* FOOTER (collapsed) */}
        <FooterCard state={state} set={set} />
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
                <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5">
                  {copied ? (
                    <><Check className="h-4 w-4" />Gekopieerd!</>
                  ) : (
                    <><Mail className="h-4 w-4" />Kopiëren</>
                  )}
                </Button>
                <Button size="sm" onClick={handleDownload} className="gap-1.5">
                  {downloaded ? (
                    <><Check className="h-4 w-4" />Opgeslagen!</>
                  ) : (
                    <><Download className="h-4 w-4" />Download</>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
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
