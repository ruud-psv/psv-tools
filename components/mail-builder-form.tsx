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
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Exploitatie = "kaartverkoop" | "fanstore";

interface MailBuilderState {
  exploitatie: Exploitatie;
  onderwerp: string;
  previewTekst: string;
  heroUrl: string;
  heroAlt: string;
  heroLink: string;
  heroPreviewUrl: string;
  aanhef: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  heeftSecondaireLink: boolean;
  secondaireLinkLabel: string;
  secondaireLinkUrl: string;
  heeftAfsluitRegel: boolean;
  afsluitRegel: string;
  disclaimerTekst: string;
  misNiksEmail: string;
}

// ---------------------------------------------------------------------------
// Defaults per exploitatie
// ---------------------------------------------------------------------------

const DEFAULTS: Record<Exploitatie, Omit<MailBuilderState, "exploitatie">> = {
  kaartverkoop: {
    onderwerp: "",
    previewTekst: "",
    heroUrl:
      "[[MAILING|PROTOCOL|http]]://[[ACCOUNT|MAILING-DOMAIN]]/c/3rYEJmzm3pkN4F9jYGV8Nw/media/4877%20Ticketing%20seizoenontknoping%202.jpg",
    heroAlt: "Scoor nu je tickets",
    heroLink: '[[LINK|"https://ticketshop.psv.nl/nl-NL/categories/PSV-1"]]',
    heroPreviewUrl:
      "https://images.maileon-static.com/c/3rYEJmzm3pkN4F9jYGV8Nw/media/4877%20Ticketing%20seizoenontknoping%202.jpg",
    aanhef: "[[% contact 'FIRSTNAME' 'PSV-supporter']]",
    body: "",
    ctaLabel: "SCOOR DE ALLERLAATSTE TICKETS",
    ctaUrl: '[[LINK|"https://ticketshop.psv.nl/nl-NL/categories/PSV-1"]]',
    heeftSecondaireLink: true,
    secondaireLinkLabel: "Bekijk alle wedstrijden >",
    secondaireLinkUrl:
      '[[LINK|"https://ticketshop.psv.nl/nl-NL/categories/PSV-1"]]',
    heeftAfsluitRegel: true,
    afsluitRegel: "Tot ziens in het Philips Stadion!",
    disclaimerTekst:
      "Je ontvangt deze mail omdat je hebt aangegeven interesse te hebben in PSV Kaartverkoop. Let op, wanneer je je afmeldt word je voor alle e-mails van PSV afgemeld. Het kan zijn dat je belangrijke informatie mist.",
    misNiksEmail: "email@newsletter.psv.nl",
  },
  fanstore: {
    onderwerp: "",
    previewTekst: "",
    heroUrl:
      "[[MAILING|PROTOCOL|http]]://[[ACCOUNT|MAILING-DOMAIN]]/c/3zu9kpkvY_MQ1abjXEIUGQ/media/4676%20Gifting%202025%20MAILING%20-%20algemeen%20-%2001.jpg",
    heroAlt: "PSV FANstore",
    heroLink: '[[LINK|"https://www.psv.nl/fanstore"]]',
    heroPreviewUrl:
      "https://images.maileon-static.com/c/3zu9kpkvY_MQ1abjXEIUGQ/media/4676%20Gifting%202025%20MAILING%20-%20algemeen%20-%2001.jpg",
    aanhef: "[[% contact 'FIRSTNAME' 'PSV-supporter']]",
    body: "",
    ctaLabel: "SHOP NU",
    ctaUrl: '[[LINK|"https://www.psv.nl/fanstore"]]',
    heeftSecondaireLink: false,
    secondaireLinkLabel: "",
    secondaireLinkUrl: "",
    heeftAfsluitRegel: true,
    afsluitRegel: "Tot ziens!",
    disclaimerTekst:
      "Je ontvangt deze mail omdat je hebt aangegeven interesse te hebben in PSV FANstore. Let op, wanneer je je afmeldt word je voor alle e-mails van PSV afgemeld. Het kan zijn dat je belangrijke informatie mist.",
    misNiksEmail: "email@newsletter.psv.nl",
  },
};

function makeInitialState(exp: Exploitatie): MailBuilderState {
  return { exploitatie: exp, ...DEFAULTS[exp] };
}

// ---------------------------------------------------------------------------
// Email HTML generator
// ---------------------------------------------------------------------------

function generateEmailHTML(
  state: MailBuilderState,
  forExport = false
): string {
  const isKV = state.exploitatie === "kaartverkoop";
  const cdn = forExport
    ? "[[MAILING|PROTOCOL|http]]://[[ACCOUNT|MAILING-DOMAIN]]"
    : "https://images.maileon-static.com";

  const mv = (variable: string, preview: string) =>
    forExport ? variable : preview;

  // Hero image
  const heroSrc = forExport
    ? state.heroUrl
    : state.heroPreviewUrl ||
      state.heroUrl.replace(
        "[[MAILING|PROTOCOL|http]]://[[ACCOUNT|MAILING-DOMAIN]]",
        "https://images.maileon-static.com"
      );

  const heroWrap = state.heroLink
    ? {
        open: `<a href="${forExport ? state.heroLink : state.heroLink.replace(/\[\[LINK\|"([^"]+)"\]\]/g, "$1")}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;">`,
        close: `</a>`,
      }
    : { open: "", close: "" };

  // Substituted values
  const firstName = mv("[[% contact 'FIRSTNAME' 'PSV-supporter']]", "John");
  const fullName = mv("[[% contact 'FULLNAME' 'onbekend']]", "John Doe");
  const emailAddr = mv("[[% email]]", "john@example.com");
  const memberNr = mv("[[% contact 'MEMBERNUMBERPRIOR' 'onbekend']]", "123456");
  const contactId = mv("[[CONTACT|ID]]", "000001");
  const checksum = mv("[[CONTACT|CHECKSUM]]", "abc123");

  const aanhefResolved = forExport
    ? state.aanhef
    : state.aanhef
        .replace(
          /\[\[% contact 'FIRSTNAME' '[^']*'\]\]/g,
          "John"
        )
        .replace(/\[\[FIRSTNAME\]\]/g, "John")
        .replace(/\[\[FULLNAME\]\]/g, "John Doe");

  const ctaHref = forExport
    ? state.ctaUrl
    : state.ctaUrl.replace(/\[\[LINK\|"([^"]+)"\]\]/g, "$1") || "#";

  const secHref = forExport
    ? state.secondaireLinkUrl
    : state.secondaireLinkUrl.replace(/\[\[LINK\|"([^"]+)"\]\]/g, "$1") || "#";

  // Feedback
  const fbBase = "https://psv.typeform.com/to/ToXAKBFD";
  const fbParams = `typeform-medium=embed-email&email=${mv("[% email]", "john@example.com")}&forename=${mv("[% contact 'FIRSTNAME' '-onbekend-']", "John")}&surname=${mv("[% contact 'LASTNAME' '-Onbekend-']", "Doe")}&groupid=${mv("[% contact 'EXTERNAL-ID' 'Onbekend']", "0")}&emailname=${mv("[MAILING|NAME|]", "Test")}&emailid=${mv("[MAILING|ID|]", "0")}`;

  const fbPosHref = forExport
    ? `[[LINK|"${fbBase}?${fbParams}&answers-contentscore=0d872ebf-a707-4bc3-88f0-125a89faa327"]]`
    : `${fbBase}?${fbParams}&answers-contentscore=0d872ebf-a707-4bc3-88f0-125a89faa327`;

  const fbNegHref = forExport
    ? `[[LINK|"${fbBase}?${fbParams}&answers-contentscore=80ff86cc-c74e-4f6f-88f6-756bd7b5e6dc"]]`
    : `${fbBase}?${fbParams}&answers-contentscore=80ff86cc-c74e-4f6f-88f6-756bd7b5e6dc`;

  // Social
  const sl = (url: string) =>
    forExport ? `[[LINK|"${url}"]]` : url;

  const fbUrl = sl("https://www.facebook.com/PSV/");
  const igUrl = sl("https://www.instagram.com/psv/");
  const ytUrl = sl("https://www.youtube.com/user/psveindhoven");
  const xUrl = sl("https://twitter.com/PSV");
  const liUrl = sl("https://www.linkedin.com/company/psv/");
  const ttUrl = sl("https://www.tiktok.com/@psv");

  // Unsubscribe
  const prefsHref = `https://newsletter.psv.nl/hp/iFRp1MKUfY_Q39OWNy9vbA/psv-voorkeuren-algemeen?contactId=${contactId}&checksum=${checksum}`;
  const unsubHref = `https://newsletter.psv.nl/hp/5Tvm3Acs2ydwoB28ioz-ig/psv-uitschrijven-algemeen?contactId=${contactId}&checksum=${checksum}`;
  const changeEmailHref = forExport
    ? `[[LINK|"https://www.psv.nl/contact-1/e-mailadreswijziging"]]`
    : "https://www.psv.nl/contact-1/e-mailadreswijziging";

  const misNiksHref = forExport
    ? `[[LINK|"https://www.psv.nl/psv/mis-niks-van-psv.htm"]]`
    : "https://www.psv.nl/psv/mis-niks-van-psv.htm";

  const onlineVersion = forExport ? "[[ONLINE-VERSION]]" : "#";
  const changeLanguageHref = forExport
    ? `[[LINK|"https://login.psv.nl/Dashboard/Profile"]]`
    : "https://login.psv.nl/Dashboard/Profile";

  const titleText = forExport
    ? "[[MAILING|SUBJECT|]]"
    : state.onderwerp || "E-mail preview";

  const preheader = forExport
    ? `[[PREVIEW-TEXT|]][[% unescape_html (repeat zwnjnbsp 180)]]`
    : state.previewTekst || "";

  const openPixelHtml = forExport
    ? `<img src="[[OPEN-PIXEL]]" width="1" height="1" alt="" style="width:1px;height:1px;display:block;">`
    : "";

  // Logo block
  const logoBlock = isKV
    ? `<tr>
        <td align="center" bgcolor="#000000" style="background-color:#000000;padding:20px 0;">
          <img src="https://www.psv.nl/upload/23adcb48-abc3-487f-9158-6bc7822599a6_PSV_logo_color.svg" width="80" height="80" alt="PSV" style="display:block;width:80px;height:80px;border:0;">
        </td>
      </tr>`
    : `<tr>
        <td bgcolor="#ffffff" style="background-color:#ffffff;padding:0;">
          <img src="${cdn}/c/3zu9kpkvY_MQ1abjXEIUGQ/media/4676%20Gifting%202025%20MAILING%20-%20algemeen%20-%2001.jpg" width="600" alt="PSV FANstore" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
        </td>
      </tr>
      <tr>
        <td bgcolor="#ED1B24" style="background-color:#ED1B24;padding:12px 0;text-align:center;">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 auto;">
            <tr>
              <td style="padding:0 16px;font-family:'Titillium Web',Verdana,sans-serif;font-size:13px;font-weight:600;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;border-right:2px solid #c8111a;">WEDSTRIJD</td>
              <td style="padding:0 16px;font-family:'Titillium Web',Verdana,sans-serif;font-size:13px;font-weight:600;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;border-right:2px solid #c8111a;">TRAINING</td>
              <td style="padding:0 16px;font-family:'Titillium Web',Verdana,sans-serif;font-size:13px;font-weight:600;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;border-right:2px solid #c8111a;">NIEUW</td>
              <td style="padding:0 16px;font-family:'Titillium Web',Verdana,sans-serif;font-size:13px;font-weight:600;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;">SALE</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td bgcolor="#000000" style="background-color:#000000;padding:8px 0;text-align:center;">
          <span style="font-family:'Titillium Web',Verdana,sans-serif;font-size:12px;color:#ffffff;">Voor 20.00 uur besteld = vandaag verzonden</span>
        </td>
      </tr>`;

  // CTA button (bulletproof)
  const ctaBlock = state.ctaLabel
    ? `<tr>
        <td bgcolor="#ffffff" style="background-color:#ffffff;padding:0 20px;text-align:center;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
            href="${ctaHref}" style="height:36px;v-text-anchor:middle;width:260px;" arcsize="0%" stroke="f" fillcolor="#E30613">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:'Titillium Web',Verdana,sans-serif;font-size:16px;font-weight:bold;">${state.ctaLabel}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 auto;">
            <tr>
              <td bgcolor="#E30613" style="background-color:#E30613;border-radius:0;">
                <a href="${ctaHref}" target="_blank" rel="noopener noreferrer"
                   style="display:inline-block;padding:8px 14px;font-family:'Titillium Web',Verdana,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:0.5px;"
                >${state.ctaLabel}</a>
              </td>
            </tr>
          </table>
          <!--<![endif]-->
        </td>
      </tr>`
    : "";

  const secLinkBlock =
    state.heeftSecondaireLink && state.secondaireLinkLabel
      ? `<tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff;padding:10px 20px 20px;text-align:center;">
            <a href="${secHref}" target="_blank" rel="noopener noreferrer"
               style="font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;color:#EE1C24;text-decoration:none;line-height:20px;"
            >${state.secondaireLinkLabel}</a>
          </td>
        </tr>`
      : state.ctaLabel
      ? `<tr><td bgcolor="#ffffff" style="background-color:#ffffff;height:20px;font-size:20px;line-height:20px;">&nbsp;</td></tr>`
      : "";

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

          <!-- Logo block -->
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
              <p style="margin:0;padding:0;font-family:'Titillium Web',Verdana,sans-serif;font-size:16px;font-weight:600;color:#ED1B24;letter-spacing:0.65px;line-height:20px;"><b>Hi ${aanhefResolved},</b></p>
            </td>
          </tr>

          <!-- Body -->
          ${
            state.body
              ? `<tr>
              <td bgcolor="#ffffff" style="background-color:#ffffff;padding:0 20px 20px;text-align:center;">
                <div style="font-family:'Titillium Web',Verdana,sans-serif;font-size:14px;color:#000000;line-height:20px;text-align:center;">${state.body}</div>
              </td>
            </tr>`
              : `<tr><td bgcolor="#ffffff" style="background-color:#ffffff;height:10px;"></td></tr>`
          }

          <!-- CTA -->
          ${ctaBlock}

          <!-- Secondary link -->
          ${secLinkBlock}

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
                  <td style="padding:0 3px;">
                    <a href="${fbPosHref}" target="_blank" rel="noopener noreferrer">
                      <img src="${cdn}/c/7P4UPmYQhoQ/media/feedback_positief.png" width="50" height="50" alt="Positief" style="display:block;width:50px;height:50px;border:0;">
                    </a>
                  </td>
                  <td style="padding:0 3px;">
                    <a href="${fbNegHref}" target="_blank" rel="noopener noreferrer">
                      <img src="${cdn}/c/srpCZd3lN1M/media/feedback_negatief.png" width="50" height="50" alt="Negatief" style="display:block;width:50px;height:50px;border:0;">
                    </a>
                  </td>
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
// Toggle component
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
  set: <K extends keyof MailBuilderState>(
    key: K,
    value: MailBuilderState[K]
  ) => void;
}) {
  const [open, setOpen] = useState(false);

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
              De zin "Wil je er zeker van zijn…" wordt altijd automatisch
              toegevoegd.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="misNiksEmail">
              &ldquo;Mis niks van PSV&rdquo; e-mailadres
            </Label>
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
// Main component
// ---------------------------------------------------------------------------

export function MailBuilderForm() {
  const [state, setState] = useState<MailBuilderState>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("mail-builder-draft-kaartverkoop");
        if (saved) return JSON.parse(saved) as MailBuilderState;
      } catch {}
    }
    return makeInitialState("kaartverkoop");
  });

  const [previewHtml, setPreviewHtml] = useState("");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">(
    "desktop"
  );
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist draft
  useEffect(() => {
    try {
      localStorage.setItem(
        `mail-builder-draft-${state.exploitatie}`,
        JSON.stringify(state)
      );
    } catch {}
  }, [state]);

  // Debounced preview rebuild
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreviewHtml(generateEmailHTML(state, false));
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [state]);

  function set<K extends keyof MailBuilderState>(
    key: K,
    value: MailBuilderState[K]
  ) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function handleExploitatieChange(exp: Exploitatie) {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`mail-builder-draft-${exp}`);
        if (saved) {
          setState(JSON.parse(saved) as MailBuilderState);
          return;
        }
      } catch {}
    }
    setState(makeInitialState(exp));
  }

  function handleDownload() {
    const html = generateEmailHTML(state, true);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().split("T")[0];
    a.download = `psv-mail-${state.exploitatie}-${date}.html`;
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
              <Label>Exploitatie</Label>
              <div className="flex rounded-md border border-input overflow-hidden">
                {(["kaartverkoop", "fanstore"] as const).map((exp) => (
                  <button
                    key={exp}
                    type="button"
                    onClick={() => handleExploitatieChange(exp)}
                    className={cn(
                      "flex-1 py-2 text-sm font-heading uppercase tracking-wide transition-colors",
                      state.exploitatie === exp
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    {exp === "kaartverkoop" ? "Kaartverkoop" : "FANstore"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              <div className="flex h-10 items-center px-3 py-2 rounded-md border border-input bg-muted/30 text-sm text-muted-foreground select-none">
                Campagne / Promo
              </div>
            </div>
          </CardContent>
        </Card>

        {/* E-MAIL KOP */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>E-mail kop</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="onderwerp">Onderwerp</Label>
              <Input
                id="onderwerp"
                placeholder="Mis de laatste thuiswedstrijden niet!"
                value={state.onderwerp}
                onChange={(e) => set("onderwerp", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="previewTekst">Preview tekst</Label>
              <Input
                id="previewTekst"
                placeholder="Wordt getoond in inbox preview…"
                value={state.previewTekst}
                onChange={(e) => set("previewTekst", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Preheader — zichtbaar in inbox vóór openen.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* HERO AFBEELDING */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Hero afbeelding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="heroUrl">URL (Maileon CDN)</Label>
              <Input
                id="heroUrl"
                placeholder="[[MAILING|PROTOCOL|http]]://[[ACCOUNT|MAILING-DOMAIN]]/c/…"
                value={state.heroUrl}
                onChange={(e) => set("heroUrl", e.target.value)}
              />
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
                placeholder='[[LINK|"https://…"]]'
                value={state.heroLink}
                onChange={(e) => set("heroLink", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="heroPreviewUrl">Preview-vervanger URL</Label>
              <Input
                id="heroPreviewUrl"
                placeholder="https://… (alleen voor preview)"
                value={state.heroPreviewUrl}
                onChange={(e) => set("heroPreviewUrl", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Vervangt de CDN-URL in de live preview. Geen effect op export.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* INHOUD */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Inhoud</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="aanhef">Aanhef</Label>
              <Input
                id="aanhef"
                placeholder="[[% contact 'FIRSTNAME' 'PSV-supporter']]"
                value={state.aanhef}
                onChange={(e) => set("aanhef", e.target.value)}
              />
              <div className="flex gap-2 flex-wrap">
                {[
                  {
                    label: "[[FIRSTNAME]]",
                    value: "[[% contact 'FIRSTNAME' 'PSV-supporter']]",
                  },
                  {
                    label: "[[FULLNAME]]",
                    value: "[[% contact 'FULLNAME' 'supporter']]",
                  },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => set("aanhef", state.aanhef + chip.value)}
                    className="inline-flex items-center px-2 py-1 rounded text-xs bg-muted hover:bg-muted/80 font-mono transition-colors border border-border"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Body</Label>
              <Textarea
                id="body"
                placeholder={`HTML toegestaan: <b>vet</b>, <br>, <a href="…">link</a>`}
                value={state.body}
                onChange={(e) => set("body", e.target.value)}
                className="min-h-[120px] font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ctaLabel">CTA-knop tekst</Label>
              <Input
                id="ctaLabel"
                placeholder="SCOOR DE ALLERLAATSTE TICKETS"
                value={state.ctaLabel}
                onChange={(e) => set("ctaLabel", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ctaUrl">CTA-knop URL</Label>
              <Input
                id="ctaUrl"
                placeholder='[[LINK|"https://…"]]'
                value={state.ctaUrl}
                onChange={(e) => set("ctaUrl", e.target.value)}
              />
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Secundaire tekstlink</Label>
                <Toggle
                  checked={state.heeftSecondaireLink}
                  onChange={(v) => set("heeftSecondaireLink", v)}
                />
              </div>
              {state.heeftSecondaireLink && (
                <div className="space-y-2 pl-3 border-l-2 border-primary/20">
                  <Input
                    placeholder="Bekijk alle wedstrijden >"
                    value={state.secondaireLinkLabel}
                    onChange={(e) =>
                      set("secondaireLinkLabel", e.target.value)
                    }
                  />
                  <Input
                    placeholder='[[LINK|"https://…"]]'
                    value={state.secondaireLinkUrl}
                    onChange={(e) => set("secondaireLinkUrl", e.target.value)}
                  />
                </div>
              )}
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
                {/* Desktop/Mobile toggle */}
                <div className="flex rounded-md border border-input overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("desktop")}
                    title="Desktop (600px)"
                    className={cn(
                      "p-2 transition-colors",
                      previewMode === "desktop"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background hover:bg-accent"
                    )}
                  >
                    <Monitor className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("mobile")}
                    title="Mobile (380px)"
                    className={cn(
                      "p-2 transition-colors",
                      previewMode === "mobile"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background hover:bg-accent"
                    )}
                  >
                    <Smartphone className="h-4 w-4" />
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Gekopieerd!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Kopiëren
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={handleDownload}
                  className="gap-1.5"
                >
                  {downloaded ? (
                    <>
                      <Check className="h-4 w-4" />
                      Opgeslagen!
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Download
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div
              className={cn(
                "border-t border-border",
                previewMode === "mobile"
                  ? "flex justify-center bg-muted/20 py-4"
                  : ""
              )}
            >
              <iframe
                srcDoc={previewHtml}
                title="E-mail preview"
                sandbox="allow-same-origin"
                style={{
                  width: previewMode === "desktop" ? "100%" : "380px",
                  height: "820px",
                  border: "none",
                  display: "block",
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
