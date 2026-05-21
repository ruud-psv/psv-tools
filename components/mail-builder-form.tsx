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

type Template = "kaartverkoop" | "fanstore" | "soccerschool" | "tours" | "prematch";

interface BodyBlock {
  id: string;
  content: string;
  isGrijs: boolean;
  heeftCta: boolean;
  ctaLabel: string;
  ctaUrl: string;
  heeftSecLink: boolean;
  secLinkLabel: string;
  secLinkUrl: string;
}

function newBlock(partial: Partial<BodyBlock> = {}): BodyBlock {
  return {
    id: Math.random().toString(36).slice(2),
    content: "",
    isGrijs: false,
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
  prematchImg1PreviewUrl: string; prematchImg1Alt: string;
  prematchImg2PreviewUrl: string; prematchImg2Alt: string;
  prematchImg3PreviewUrl: string; prematchImg3Alt: string;
  prematchImg4PreviewUrl: string; prematchImg4Alt: string;
  prematchImg5PreviewUrl: string; prematchImg5Alt: string;
  prematchImg6PreviewUrl: string; prematchImg6Alt: string;
  prematchImg7PreviewUrl: string; prematchImg7Alt: string;
  prematchFooterPreviewUrl: string; prematchFooterAlt: string;
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
  prematchImg1PreviewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvyzHFKlbtg4dg/media/1.png`,
  prematchImg1Alt: "Volendam - PSV",
  prematchImg2PreviewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvPxd_VPjsG0A/media/2.png`,
  prematchImg2Alt: "PSV reist af naar het hoge noorden",
  prematchImg3PreviewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvxRWGlR6utS8w/media/3.png`,
  prematchImg3Alt: "De huidige stand in de Vriendenlóterij Eredivisie",
  prematchImg4PreviewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvx0tCT39eCPwg/media/4.png`,
  prematchImg4Alt: "Nieuw Record - PSV Wint 16 uitduels op rij",
  prematchImg5PreviewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvxjK0h13rCkEA/media/5.png`,
  prematchImg5Alt: "Laatste 3 edities Groningen - PSV",
  prematchImg6PreviewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvzZGj_3pHotQw/media/6.png`,
  prematchImg6Alt: "Team stats",
  prematchImg7PreviewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvy-X8qFW1DCUw/media/7.png`,
  prematchImg7Alt: "Breng een bezoek aan het Philips Stadion",
  prematchFooterPreviewUrl: `${PREVIEW_CDN_HOST}/c/XUUZKeOycvwInQHJ4sAwpQ/media/footer_2.png`,
  prematchFooterAlt: "Every moment counts",
};

type TemplateDefaults = Omit<MailBuilderState, "template">;

const DEFAULTS: Record<Template, TemplateDefaults> = {
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
  },
  fanstore: {
    heroUrl: `${MAILEON_CDN_HOST}/c/3zu9kpkvY_MQ1abjXEIUGQ/media/4676%20Gifting%202025%20MAILING%20-%20algemeen%20-%2001.jpg`,
    heroAlt: "PSV FANstore",
    heroPreviewUrl: `${PREVIEW_CDN_HOST}/c/3zu9kpkvY_MQ1abjXEIUGQ/media/4676%20Gifting%202025%20MAILING%20-%20algemeen%20-%2001.jpg`,
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
  },
  soccerschool: {
    heroUrl: `${MAILEON_CDN_HOST}/c/3zu9kpkvY_OjJKhxaO6BCA/media/4663%20Mailheaders%20Soccerschool3_1.jpg`,
    heroAlt: "Soccer School",
    heroPreviewUrl: `${PREVIEW_CDN_HOST}/c/3zu9kpkvY_OjJKhxaO6BCA/media/4663%20Mailheaders%20Soccerschool3_1.jpg`,
    heroLink: "",
    aanhefText: "Hoi {VOORNAAM}",
    blocks: [
      newBlock({ content: "Wil jij trainen zoals jouw favoriete PSV'er? Ontdek de PSV Starclinics op PSV Campus De Herdgang! Tijdens deze unieke voetbaldag werk je aan skills zoals snelheid, wendbaarheid, passing en reactievermogen – precies zoals de profs dat doen." }),
      newBlock({ content: "<p style=\"margin:0 0 10px;font-weight:bold;\">Wat maakt deze trainingen bijzonder?&nbsp;</p><p style=\"margin:0;\">✅ Trainingen met thema's van PSV–spelers<br>✅ Compleet dagprogramma van 09.15 tot 16.00 uur<br>✅ 25% korting op jouw volgende Starclinic</p>", isGrijs: true }),
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
  },
  tours: {
    heroUrl: `${MAILEON_CDN_HOST}/c/01cTNhJhAbMT2cYd5HJzRg/media/template-psv-tours-header.png`,
    heroAlt: "PSV Kidstour",
    heroPreviewUrl: `${PREVIEW_CDN_HOST}/c/01cTNhJhAbMT2cYd5HJzRg/media/template-psv-tours-header.png`,
    heroLink: "",
    aanhefText: "Hoi {VOORNAAM}",
    blocks: [
      newBlock({ content: "Heb jij thuis een jonge PSV'er die niet genoeg kan krijgen van onze club? Kom dan langs tijdens de carnavalsvakantie. Dan organiseren we opnieuw de PSV KIDStour. Samen met je kind ontdek je plekken waar je normaal nooit komt. En natuurlijk gaan jullie naar huis met een echt PSV-aandenken!" }),
      newBlock({ content: "<p style=\"margin:0 0 10px;font-weight:bold;\">Wat kun je verwachten?</p><p style=\"margin:0;\">✅ Speur naar items op je bingokaart<br>✅ Ontmoet Phoxy<br>✅ Een uniek PSV-moment om nooit te vergeten</p>", isGrijs: true }),
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
    if (Array.isArray(raw.blocks) && raw.blocks.length > 0) return raw.blocks as BodyBlock[];
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

  const imgs = [
    { src: imgSrc(state.prematchImg1PreviewUrl), alt: state.prematchImg1Alt },
    { src: imgSrc(state.prematchImg2PreviewUrl), alt: state.prematchImg2Alt },
    { src: imgSrc(state.prematchImg3PreviewUrl), alt: state.prematchImg3Alt },
    { src: imgSrc(state.prematchImg4PreviewUrl), alt: state.prematchImg4Alt },
    { src: imgSrc(state.prematchImg5PreviewUrl), alt: state.prematchImg5Alt },
    { src: imgSrc(state.prematchImg6PreviewUrl), alt: state.prematchImg6Alt },
    { src: imgSrc(state.prematchImg7PreviewUrl), alt: state.prematchImg7Alt },
  ];

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
        <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:600px;" role="presentation">

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

          <!-- Unsubscribe -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;padding:0 0 20px;text-align:center;">
              <p style="margin:0;font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;line-height:140%;">
                <i>
                  <a href="${prefsHref}" style="color:#ffffff;" target="_blank">Voorkeuren aanpassen</a>&nbsp; &nbsp;
                  <a href="${unsubHref}" style="color:#ffffff;" target="_blank">Volledig uitschrijven</a>&nbsp; &nbsp;
                  <a href="${changeEmailHref}" style="color:#ffffff;" target="_blank">Wijzig je e-mailadres</a>
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

function generateEmailHTML(state: MailBuilderState, forExport = false): string {
  if (state.template === "prematch") return generatePrematchHTML(state, forExport);

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

  const makeCtaRow = (label: string, href: string) => `<tr>
      <td bgcolor="#ffffff" style="background-color:#ffffff;padding:10px 20px 0;text-align:center;">
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

  const makeSecLinkRow = (label: string, href: string) => `<tr>
      <td bgcolor="#ffffff" style="background-color:#ffffff;padding:10px 20px;text-align:center;">
        <a href="${href}" target="_blank" rel="noopener noreferrer"
           style="font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;color:#EE1C24;text-decoration:none;line-height:20px;"
        >${label}</a>
      </td>
    </tr>`;

  const blocksHtml = state.blocks.map(block => {
    const bg = block.isGrijs ? "#F1F1F1" : "#ffffff";
    const contentRow = block.content
      ? `<tr><td bgcolor="${bg}" style="background-color:${bg};padding:20px;text-align:center;"><div style="font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;color:#000000;line-height:20px;text-align:center;">${block.content}</div></td></tr>`
      : "";
    const bCtaHref = block.heeftCta && block.ctaUrl
      ? (forExport ? wrapLink(utm(block.ctaUrl)) : block.ctaUrl)
      : "#";
    const bSecHref = block.heeftSecLink && block.secLinkUrl
      ? (forExport ? wrapLink(utm(block.secLinkUrl)) : block.secLinkUrl)
      : "#";
    const ctaRow = block.heeftCta && block.ctaLabel ? makeCtaRow(block.ctaLabel, bCtaHref) : "";
    const spacerRow = block.heeftCta && block.ctaLabel && !block.heeftSecLink
      ? `<tr><td bgcolor="#ffffff" style="background-color:#ffffff;height:20px;font-size:20px;line-height:20px;">&nbsp;</td></tr>`
      : "";
    const secRow = block.heeftSecLink && block.secLinkLabel ? makeSecLinkRow(block.secLinkLabel, bSecHref) : "";
    return contentRow + ctaRow + secRow + spacerRow;
  }).join("");

  const afsluitBlock =
    state.heeftAfsluitRegel && state.afsluitRegel
      ? `<tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff;padding:0 20px 20px;text-align:center;">
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
        <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:600px;" role="presentation">

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
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="misNiksEmail">&ldquo;Mis niks van PSV&rdquo; e-mailadres</Label>
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
      const raw = generateEmailHTML(state, false);
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
  const isFS = state.template === "fanstore";

  const preset = DEVICE_PRESETS[device];
  const scaledWidth = Math.round(preset.width * preset.scale);
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
                  <SelectItem value="kaartverkoop">Kaartverkoop</SelectItem>
                  <SelectItem value="fanstore">FANstore</SelectItem>
                  <SelectItem value="soccerschool">Soccer School</SelectItem>
                  <SelectItem value="tours">Tours</SelectItem>
                  <SelectItem value="prematch">Pre-match</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!isPrematch && (
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
            <CardContent className="space-y-4">
              {(
                [
                  { label: "Afbeelding 1", previewKey: "prematchImg1PreviewUrl", altKey: "prematchImg1Alt" },
                  { label: "Afbeelding 2", previewKey: "prematchImg2PreviewUrl", altKey: "prematchImg2Alt" },
                  { label: "Afbeelding 3", previewKey: "prematchImg3PreviewUrl", altKey: "prematchImg3Alt" },
                  { label: "Afbeelding 4", previewKey: "prematchImg4PreviewUrl", altKey: "prematchImg4Alt" },
                  { label: "Afbeelding 5", previewKey: "prematchImg5PreviewUrl", altKey: "prematchImg5Alt" },
                  { label: "Afbeelding 6", previewKey: "prematchImg6PreviewUrl", altKey: "prematchImg6Alt" },
                  { label: "Afbeelding 7", previewKey: "prematchImg7PreviewUrl", altKey: "prematchImg7Alt" },
                  { label: "Footer", previewKey: "prematchFooterPreviewUrl", altKey: "prematchFooterAlt" },
                ] as const
              ).map((item) => (
                <PrematchImageRow
                  key={item.previewKey}
                  label={item.label}
                  previewKey={item.previewKey}
                  altKey={item.altKey}
                  state={state}
                  set={set}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* HERO AFBEELDING */}
        {!isPrematch && (
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

        {/* FANSTORE NAVBAR URLS */}
        {isFS && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Navbar-links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(
                [
                  { label: "Wedstrijd", key: "fanstoreNavWedstrijdUrl" },
                  { label: "Training", key: "fanstoreNavTrainingUrl" },
                  { label: "Nieuw", key: "fanstoreNavNieuwUrl" },
                  { label: "Sale", key: "fanstoreNavSaleUrl" },
                ] as const
              ).map(({ label, key }) => (
                <div key={key} className="space-y-1">
                  <Label>{label}</Label>
                  <Input
                    value={state[key]}
                    onChange={(e) => set(key, e.target.value)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* INHOUD */}
        {!isPrematch && (
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
                        <div className="ml-auto flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Grijs</span>
                            <Toggle checked={block.isGrijs} onChange={(v) => updateBlock(i, "isGrijs", v)} />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeBlock(i)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            aria-label="Verwijder blok"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {/* Content */}
                      <Textarea
                        placeholder={`Tekst of HTML: <b>vet</b>, <br>, <a href="…">link</a>`}
                        value={block.content}
                        onChange={(e) => updateBlock(i, "content", e.target.value)}
                        className="min-h-[80px] font-mono text-xs"
                      />
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
                  sandbox="allow-same-origin"
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
                      sandbox="allow-same-origin"
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
