import { NAAM_ADVIES } from "@/lib/maileon/concept-naam";

/**
 * Een content brief uit Asana omzetten naar een opzet voor de Mail Builder
 * (template Kaartverkoop). Zonder AI: vaste regels op het sjabloon van de
 * content brief ("💻 CONTENT BRIEF" met Doelgroepen, Onderwerp, Snippet,
 * Copy, Footer, Header). De tekst blijft letterlijk wat de aanvrager schreef;
 * alleen de opbouw (blokken, titels, knoppen, opsommingen) wordt afgeleid.
 * Wat niet zeker is, komt in de punten, zodat Digital het ziet.
 *
 * Puur (geen netwerk, geen React), zodat de route en de tests hem delen. De
 * HTML maakt de pagina daarna met de generator van de Mail Builder.
 */

/* ---------- Typen ---------- */

export interface BriefVelden {
  /** Stond er een content brief in de beschrijving? */
  gevonden: boolean;
  doelgroep: string;
  optIn: string;
  ctaLink: string;
  dynamisch: { keuze: "ja" | "nee" | "onbekend"; velden: string[] };
  onderwerp: string;
  snippet: string;
  copy: string;
  footer: string;
  header: string;
}

/** Een blok zoals de Mail Builder het kent (een deel van `BodyBlock`). */
export interface BlokOpzet {
  titel?: string;
  content: string;
  blockBg: "wit" | "grijs";
  heeftCta: boolean;
  ctaLabel: string;
  ctaUrl: string;
}

/** Wat de pagina in de staat van de Mail Builder zet (een deel van `MailBuilderState`). */
export interface MailOpzet {
  template: "kaartverkoop";
  dmid?: string;
  mailNaam: string;
  preheaderTekst: string;
  utmCampaign: string;
  heroLink?: string;
  /** Alt-tekst van de header: het onderwerp zonder emoji vooraan. */
  heroAlt?: string;
  aanhefText: string;
  blocks: BlokOpzet[];
  heeftAfsluitRegel: boolean;
  afsluitRegel: string;
  disclaimerTekst?: string;
}

export interface Punt {
  soort: "nodig" | "let-op";
  tekst: string;
}

export interface BriefUitkomst {
  velden: BriefVelden;
  /** `null` als het template (nog) niet wordt ondersteund. */
  opzet: MailOpzet | null;
  onderwerp: string;
  punten: Punt[];
}

export interface TaakInvoer {
  naam: string;
  notes: string;
  dueOn?: string;
  /** Custom fields als naam → waarde; in het testproject leeg. */
  velden?: Record<string, string>;
}

/* ---------- De brief lezen ---------- */

type Sleutel = "doelgroep" | "optIn" | "cta" | "dynamisch" | "onderwerp" | "snippet" | "copy" | "footer" | "header" | "negeer";

function labelVan(regel: string): Sleutel | "einde" | null {
  const r = regel.trim().toLowerCase();
  if (!r) return null;
  if (r.includes("creative brief")) return "einde";
  if (r.startsWith("datum verzending")) return "negeer";
  if (r === "doelgroepen" || r === "doelgroep") return "doelgroep";
  if (r.startsWith("opt-in")) return "optIn";
  if (r.startsWith("link / url cta")) return "cta";
  if (r.startsWith("dynamic content")) return "dynamisch";
  if (r.startsWith("copy (briefing)")) return "negeer";
  if (r === "onderwerp") return "onderwerp";
  if (r === "snippet") return "snippet";
  if (r === "copy") return "copy";
  if (r === "footer") return "footer";
  if (r === "header") return "header";
  return null;
}

function schoneRegels(regels: string[]): string {
  return regels
    .map((r) => r.trim())
    .filter(Boolean)
    .join("\n");
}

function leesDynamisch(waarde: string): BriefVelden["dynamisch"] {
  const t = waarde.replace(/\s+/g, " ").trim();
  let keuze: BriefVelden["dynamisch"]["keuze"] = "onbekend";
  let rest = "";
  const beide = t.match(/^ja\s*\/\s*nee\b\s*(.*)$/i);
  if (beide) {
    rest = beide[1];
  } else if (/^ja\b/i.test(t)) {
    keuze = "ja";
    rest = t.replace(/^ja\b[\s:,-]*/i, "");
  } else if (/^nee\b/i.test(t)) {
    keuze = "nee";
  } else {
    rest = t;
  }
  const velden = rest
    .replace(/[()]/g, "")
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter(Boolean);
  return { keuze, velden };
}

/** Haalt de velden uit de content brief in de beschrijving van de taak. */
export function leesBrief(notes: string): BriefVelden {
  const regels = notes.replace(/\r\n?/g, "\n").replace(/ /g, " ").split("\n");
  const start = regels.findIndex((r) => /content brief/i.test(r));
  const delen: Partial<Record<Sleutel, string[]>> = {};
  let huidig: Sleutel | null = null;

  for (const regel of regels.slice(start + 1)) {
    const label = labelVan(regel);
    if (label === "einde") break;
    if (label) {
      huidig = label;
      delen[label] = delen[label] ?? [];
      continue;
    }
    if (!huidig || huidig === "negeer") continue;
    if (/^\s*-{5,}\s*$/.test(regel) || /^\s*controleer vóór/i.test(regel)) continue;
    delen[huidig]!.push(regel);
  }

  const copyRegels = delen.copy ?? [];
  while (copyRegels.length && !copyRegels[0].trim()) copyRegels.shift();
  while (copyRegels.length && !copyRegels[copyRegels.length - 1].trim()) copyRegels.pop();

  return {
    gevonden: start >= 0,
    doelgroep: schoneRegels(delen.doelgroep ?? []),
    optIn: schoneRegels(delen.optIn ?? []),
    ctaLink: eersteLink(schoneRegels(delen.cta ?? [])) ?? "",
    dynamisch: leesDynamisch(schoneRegels(delen.dynamisch ?? [])),
    onderwerp: schoneRegels(delen.onderwerp ?? []).replace(/\n/g, " "),
    snippet: schoneRegels(delen.snippet ?? []).replace(/\n/g, " "),
    copy: copyRegels.map((r) => r.replace(/\s+$/, "")).join("\n"),
    footer: schoneRegels(delen.footer ?? []).replace(/\n/g, " "),
    header: schoneRegels(delen.header ?? []),
  };
}

function eersteLink(tekst: string): string | undefined {
  const m = tekst.match(/(?:https?:\/\/|www\.)[^\s<>"]+/i);
  return m ? m[0].replace(/[.,;)]+$/, "") : undefined;
}

/* ---------- Copy naar blokken ---------- */

function escapeHtml(tekst: string): string {
  return tekst.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** "Button: LABEL: url" of "LABEL: url" (zoals "Bestel tickets!: www.psv.nl/…"). */
const KNOP = /^\s*(?:button\s*:\s*)?([^:]{1,50}?)\s*:\s*((?:https?:\/\/|www\.)\S+)\s*$/i;
const DYNAMISCH = /^\s*dynamisch\s*:?\s*(.*)$/i;
const AANHEF = /^\s*(hi|hoi|hallo|beste|dag|lieve)\b[^.!?]{0,30}[,!]?\s*$/i;
const AFSLUITING = /^\s*(met\s+)?((vriendelijke|sportieve|hartelijke|rood-witte)\s+)?groet(en)?\b/i;
const OPSOMMING = /^\s*[-•*·]\s+/;

/**
 * Dynamische velden uit de brief en hun Maileon-token, in de vorm die de Mail
 * Builder al gebruikt. `MEMBERNUMBERPRIOR` (relatienummer) en `FULLNAME`
 * staan al in de footer van het template; de rest eerst controleren.
 */
const VELDEN: Record<string, { token: string; controleren?: boolean }> = {
  relatienummer: { token: "[[% contact 'MEMBERNUMBERPRIOR' '']]" },
  voornaam: { token: "[[% contact 'FIRSTNAME' '']]" },
  achternaam: { token: "[[% contact 'LASTNAME' '']]" },
  naam: { token: "[[% contact 'FULLNAME' '']]" },
  "volledige naam": { token: "[[% contact 'FULLNAME' '']]" },
  "e-mailadres": { token: "[[% email]]" },
  "e-mail": { token: "[[% email]]" },
  geboortedatum: { token: "[[% contact 'BIRTHDAY' '']]", controleren: true },
};

function veldLabel(veld: string): string {
  const t = veld.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function alineas(copy: string): string[][] {
  const uit: string[][] = [];
  let huidig: string[] = [];
  for (const regel of copy.split("\n")) {
    if (!regel.trim()) {
      if (huidig.length) uit.push(huidig);
      huidig = [];
    } else {
      huidig.push(regel);
    }
  }
  if (huidig.length) uit.push(huidig);
  return uit;
}

function isOpsomming(regel: string): boolean {
  return /^(\s{2,}|\t)/.test(regel) || OPSOMMING.test(regel);
}

function isTitel(alinea: string[]): boolean {
  if (alinea.length < 2) return false;
  const eerste = alinea[0];
  const t = eerste.trim();
  return t.length <= 60 && !/[.!?:;,]$/.test(t) && !KNOP.test(eerste) && !DYNAMISCH.test(eerste) && !isOpsomming(eerste);
}

function regelsHtml(regels: string[]): string {
  return regels
    .map((r) => (isOpsomming(r) ? `• ${escapeHtml(r.replace(OPSOMMING, "").trim())}` : escapeHtml(r.trim())))
    .join("<br>");
}

export interface CopyUitkomst {
  aanhef?: string;
  blocks: BlokOpzet[];
  afsluiting?: string;
  onbekendeVelden: string[];
  teControlerenVelden: string[];
}

/** Zet de copy om in aanhef, blokken en afsluiting voor het kaartverkoop-template. */
export function copyNaarBlokken(copy: string): CopyUitkomst {
  const delen = alineas(copy);
  const uit: CopyUitkomst = { blocks: [], onbekendeVelden: [], teControlerenVelden: [] };

  if (delen.length && delen[0].length === 1 && AANHEF.test(delen[0][0])) {
    uit.aanhef = delen
      .shift()![0]
      .trim()
      .replace(/[,!]\s*$/, "")
      .replace(/[([{<]\s*voornaam\s*[)\]}>]/i, "{VOORNAAM}");
  }

  let blok: BlokOpzet | null = null;
  const nieuw = (titel?: string): BlokOpzet => ({
    ...(titel && { titel }),
    content: "",
    blockBg: "wit",
    heeftCta: false,
    ctaLabel: "",
    ctaUrl: "",
  });
  const sluit = () => {
    if (blok && (blok.content || blok.heeftCta)) uit.blocks.push(blok);
    blok = null;
  };
  const voegToe = (html: string) => {
    if (!blok || blok.heeftCta) {
      sluit();
      blok = nieuw();
    }
    blok.content = blok.content ? `${blok.content}<br><br>${html}` : html;
  };
  const zetKnop = (label: string, url: string) => {
    if (!blok || blok.heeftCta) {
      sluit();
      blok = nieuw();
    }
    blok.heeftCta = true;
    blok.ctaLabel = label.trim().toUpperCase();
    blok.ctaUrl = url.replace(/[.,;)]+$/, "");
  };
  const dynamischHtml = (lijst: string) =>
    lijst
      .replace(/[()]/g, "")
      .split(/[,;]/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map((veld) => {
        const bekend = VELDEN[veld.toLowerCase()];
        if (!bekend) uit.onbekendeVelden.push(veld);
        else if (bekend.controleren) uit.teControlerenVelden.push(veld);
        return `<b>${escapeHtml(veldLabel(veld))}:</b> ${bekend ? bekend.token : "[onbekend veld]"}`;
      })
      .join("<br>");

  let afsluiting: string[] | null = null;
  for (const alinea of delen) {
    if (afsluiting) {
      afsluiting.push(regelsHtml(alinea));
      continue;
    }
    if (AFSLUITING.test(alinea[0])) {
      sluit();
      afsluiting = [regelsHtml(alinea)];
      continue;
    }
    let regels = alinea;
    if (isTitel(alinea)) {
      sluit();
      blok = nieuw(alinea[0].trim());
      regels = alinea.slice(1);
    }
    let tekst: string[] = [];
    const spoel = () => {
      if (tekst.length) voegToe(regelsHtml(tekst));
      tekst = [];
    };
    for (const regel of regels) {
      const knop = regel.match(KNOP);
      const dyn = regel.match(DYNAMISCH);
      if (knop) {
        spoel();
        zetKnop(knop[1], knop[2]);
      } else if (dyn) {
        spoel();
        voegToe(dynamischHtml(dyn[1]));
      } else {
        tekst.push(regel);
      }
    }
    spoel();
  }
  sluit();

  // Blokken met een titel om en om grijs en wit, te beginnen met grijs; de rest wit.
  let grijs = true;
  for (const b of uit.blocks) {
    if (b.titel) {
      b.blockBg = grijs ? "grijs" : "wit";
      grijs = !grijs;
    }
  }
  if (afsluiting) uit.afsluiting = afsluiting.join("<br><br>");
  return uit;
}

/* ---------- Naam, DMID en template ---------- */

export function dmidVan(taak: TaakInvoer): string | undefined {
  for (const [naam, waarde] of Object.entries(taak.velden ?? {})) {
    if (/^dmid\d*$/i.test(naam.trim()) && waarde.trim()) return waarde.trim();
  }
  return taak.notes.match(/\bDMID\d{2}-[A-Z0-9]+\b/i)?.[0];
}

export function exploitatieVan(taak: TaakInvoer): string {
  const veld = Object.entries(taak.velden ?? {}).find(([naam]) => /exploitatie/i.test(naam))?.[1];
  return (veld ?? taak.notes.match(/Exploitatie:\s*([^|\n]+)/i)?.[1] ?? "").trim();
}

/** Het onderwerp-deel van de naam uit de taaknaam: zonder TEST, exploitatie en "E-mail". */
export function onderwerpUitTaaknaam(naam: string): string {
  const delen = naam
    .split("|")
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => !/^test$/i.test(d) && !/^(e-?mail|mail|mailing)$/i.test(d));
  // De eerste is meestal de exploitatie in hoofdletters (TICKETING, MKT, MIJN PSV+).
  if (delen.length > 1 && delen[0] === delen[0].toUpperCase()) delen.shift();
  return delen.map((d) => d.replace(/\s+-\s+/g, "-")).join(" ");
}

/**
 * De naam volgens de conventie "[DATUM] [EXPLOITATIE] - [ONDERWERP] - [DMID]",
 * met TEST ervoor voor taken uit het testproject. Te lang voor de 64 tekens
 * uit de API-documentatie? Dan wordt het onderwerp-deel ingekort, op een
 * woordgrens. De pagina laat de naam nog aanpassen.
 */
export function maakMailnaam(opties: { dueOn?: string; exploitatie: string; taaknaam: string; dmid?: string; test: boolean }): string {
  const datum = opties.dueOn?.match(/^\d{4}-\d{2}-\d{2}$/) ? opties.dueOn.replace(/-/g, ".") : "";
  const begin = `${opties.test ? "TEST " : ""}${datum ? `${datum} ` : ""}${opties.exploitatie} - `;
  const eind = opties.dmid ? ` - ${opties.dmid}` : "";
  let deel = onderwerpUitTaaknaam(opties.taaknaam);
  const ruimte = NAAM_ADVIES - begin.length - eind.length;
  if (deel.length > ruimte && ruimte > 0) {
    const kort = deel.slice(0, ruimte + 1).replace(/[\s-]+[^\s-]*$/, "").trim();
    deel = kort || deel.split(/[\s-]/)[0];
  }
  return `${begin}${deel}${eind}`;
}

/* ---------- Alles samen ---------- */

const PLACEHOLDER = /<\s*[A-Za-z][A-Za-z _-]{2,40}\s*>|\{(?!VOORNAAM\})[A-Z][A-Z _-]{2,40}\}/g;
const ONDERWERP_MOBIEL = 50;

/** Zet een taak met content brief om in een opzet voor de Mail Builder, met de punten die opvallen. */
export function briefNaarMail(taak: TaakInvoer, opties: { test: boolean; vandaag?: string }): BriefUitkomst {
  const velden = leesBrief(taak.notes);
  const punten: Punt[] = [];
  const nodig = (tekst: string) => punten.push({ soort: "nodig", tekst });
  const letOp = (tekst: string) => punten.push({ soort: "let-op", tekst });

  if (!velden.gevonden) nodig("Geen content brief gevonden in de beschrijving van de taak.");

  const exploitatie = exploitatieVan(taak);
  const kaartverkoop = /ticketing/i.test(exploitatie);
  if (!kaartverkoop) {
    nodig(`Alleen Ticketing-mails (template Kaartverkoop) gaan nu automatisch. Exploitatie van deze taak: ${exploitatie || "onbekend"}.`);
  }

  const dmid = dmidVan(taak);
  if (!dmid) letOp("Geen DMID gevonden.");

  if (!taak.dueOn) nodig("Verzenddatum ontbreekt: zet de deadline van de taak.");
  else if (opties.vandaag && taak.dueOn < opties.vandaag) letOp(`De verzenddatum (${taak.dueOn}) ligt in het verleden.`);

  if (!velden.onderwerp) nodig("Onderwerp ontbreekt.");
  else if (velden.onderwerp.length > ONDERWERP_MOBIEL) letOp(`Onderwerp is ${velden.onderwerp.length} tekens; op mobiel zie je er ongeveer 40 tot 50.`);
  if (!velden.snippet) letOp("Snippet (preview-tekst) ontbreekt.");
  if (!velden.copy) nodig("Copy ontbreekt.");

  if (!velden.doelgroep) nodig("Doelgroep ontbreekt.");
  else if (/sharepoint\.com|onedrive|1drv\.ms/i.test(velden.doelgroep)) {
    letOp("De doelgroep staat op SharePoint of OneDrive; daar kan PSV Tools niet bij. Kies de doelgroep in Maileon.");
  }
  if (!velden.optIn) letOp("Opt-in is leeg. Voor een servicemail klopt dat; anders hoort er een preference-regel op de doelgroep.");

  if (velden.dynamisch.keuze === "onbekend" && velden.dynamisch.velden.length) {
    letOp(`"Dynamic content?" staat nog op "Ja / Nee"; gelezen als ja, omdat er velden genoemd zijn.`);
  } else if (velden.dynamisch.keuze === "onbekend") {
    letOp(`"Dynamic content?" staat nog op "Ja / Nee".`);
  }

  if (/\{NAAM OPT-IN\}/i.test(velden.footer)) nodig('Footer: "{NAAM OPT-IN}" is nog niet ingevuld.');

  const placeholders = [...new Set([...`${velden.onderwerp}\n${velden.snippet}\n${velden.copy}`.matchAll(PLACEHOLDER)].map((m) => m[0]))];
  if (placeholders.length) nodig(`Nog in te vullen: ${placeholders.join(", ")}.`);

  if (velden.header) letOp("Er staat een header in de brief. Die gaat nog niet automatisch mee; nu staat de standaardheader van het template erin.");

  const copy = copyNaarBlokken(velden.copy);
  for (const veld of copy.onbekendeVelden) nodig(`Dynamisch veld "${veld}": de naam in Maileon is onbekend. Staat nu als [onbekend veld] in de mail.`);
  for (const veld of copy.teControlerenVelden) letOp(`Dynamisch veld "${veld}": controleer de naam in Maileon.`);
  if (velden.copy && !copy.aanhef) letOp('Geen aanhef in de copy; de standaard "Hi {VOORNAAM}" staat erin.');
  if (velden.copy && !copy.blocks.some((b) => b.heeftCta)) letOp("Geen knop gevonden in de copy (een regel als \"Button: TEKST: link\").");

  const heroAlt = velden.onderwerp.replace(/^[^A-Za-z0-9À-ÿ]+/, "").trim();
  const opzet: MailOpzet | null = kaartverkoop
    ? {
        template: "kaartverkoop",
        ...(dmid && { dmid }),
        mailNaam: maakMailnaam({ dueOn: taak.dueOn, exploitatie: "PSV Kaartverkoop", taaknaam: taak.naam, dmid, test: opties.test }),
        preheaderTekst: velden.snippet,
        utmCampaign: dmid ? dmid.toLowerCase() : "",
        ...(velden.ctaLink && { heroLink: velden.ctaLink }),
        ...(heroAlt && { heroAlt }),
        aanhefText: copy.aanhef ?? "Hi {VOORNAAM}",
        blocks: copy.blocks,
        heeftAfsluitRegel: Boolean(copy.afsluiting),
        afsluitRegel: copy.afsluiting ?? "",
        ...(velden.footer && { disclaimerTekst: velden.footer }),
      }
    : null;

  return { velden, opzet, onderwerp: velden.onderwerp, punten };
}
