/**
 * Stelt de uiteindelijke kleurplaat samen in een canvas: de tekening van het
 * model, met daar overheen het Phoxy Club-logo en de naam in DynaPuff.
 *
 * Waarom niet aan het model vragen: een beeldmodel kan een merklogo niet
 * natekenen zonder het te verminken, en het kan al helemaal geen lettertype
 * gebruiken — het benadert letters, met spelfouten als gevolg. Het logo en de
 * naam zijn dus geen beeldopdracht maar een opmaakstap, hier in de browser. Dat
 * is exact, gratis, en je kunt de naam aanpassen zonder opnieuw te genereren.
 */

export type LogoHoek = "linksboven" | "rechtsboven" | "linksonder" | "rechtsonder" | "geen";
export type LogoStijl = "lijn" | "kleur";

export interface CompositieOpties {
  naam?: string;
  logoHoek: LogoHoek;
  logoStijl: LogoStijl;
  /** Het logo dat erop komt; standaard het logo dat in de repo meegaat. */
  logoUrl?: string;
}

/** Terugval wanneer er geen eigen logo is geüpload. */
export const STANDAARD_LOGO = "/images/phoxy-club-logo.png";

/** Verhoudingen, allemaal ten opzichte van de breedte of hoogte van de tekening. */
const LOGO_BREEDTE = 0.24;
const LOGO_MARGE = 0.03;
const LOGO_VULLING = 0.06;
const NAAM_BAND = 0.15;
const NAAM_MAXBREEDTE = 0.86;

/* ------------------------------------------------------------------ */
/* Laden                                                               */
/* ------------------------------------------------------------------ */

const afbeeldingCache = new Map<string, HTMLImageElement>();

function laadAfbeelding(src: string): Promise<HTMLImageElement> {
  const gecacht = afbeeldingCache.get(src);
  if (gecacht) return Promise.resolve(gecacht);

  return new Promise((resolve, reject) => {
    const img = new Image();
    // Alles komt van onze eigen oorsprong, anders zou het canvas "besmet"
    // raken en zou je er geen PNG meer uit kunnen halen.
    img.onload = () => {
      afbeeldingCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error("Kon de afbeelding niet laden."));
    img.src = src;
  });
}

/** Wacht tot DynaPuff er echt is; anders tekent het canvas in een vervangend font. */
async function wachtOpFont(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await document.fonts.load('700 100px "DynaPuff"');
    await document.fonts.ready;
  } catch {
    // niet fataal: dan valt het terug op het standaardfont
  }
}

/* ------------------------------------------------------------------ */
/* Logo                                                                */
/* ------------------------------------------------------------------ */

const lijnLogoCache = new Map<string, HTMLCanvasElement>();

/**
 * Maakt van het kleurenlogo een lijntekening: alles wat donker is blijft staan,
 * de rest wordt doorzichtig. Het logo heeft overal een zwarte contourlijn, dus
 * wat overblijft is precies de omtrek — in te kleuren, net als de rest.
 */
function alsLijntekening(logo: HTMLImageElement): HTMLCanvasElement {
  const gecacht = lijnLogoCache.get(logo.src);
  if (gecacht) return gecacht;

  const canvas = document.createElement("canvas");
  canvas.width = logo.naturalWidth;
  canvas.height = logo.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is niet beschikbaar in deze browser.");

  ctx.drawImage(logo, 0, 0);
  const beeld = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = beeld.data;

  for (let i = 0; i < d.length; i += 4) {
    const helderheid = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (d[i + 3] > 32 && helderheid < 110) {
      d[i] = d[i + 1] = d[i + 2] = 0;
      d[i + 3] = 255;
    } else {
      d[i + 3] = 0;
    }
  }

  ctx.putImageData(beeld, 0, 0);
  lijnLogoCache.set(logo.src, canvas);
  return canvas;
}

function tekenLogo(
  ctx: CanvasRenderingContext2D,
  logo: CanvasImageSource,
  logoBreedte: number,
  logoHoogte: number,
  opties: { hoek: Exclude<LogoHoek, "geen">; breedte: number; hoogte: number; bovenkant: number }
) {
  const doelBreedte = Math.round(opties.breedte * LOGO_BREEDTE);
  const doelHoogte = Math.round((doelBreedte / logoBreedte) * logoHoogte);
  const marge = Math.round(opties.breedte * LOGO_MARGE);
  const vulling = Math.round(doelBreedte * LOGO_VULLING);

  const links = opties.hoek === "linksboven" || opties.hoek === "linksonder";
  const boven = opties.hoek === "linksboven" || opties.hoek === "rechtsboven";

  const x = links ? marge + vulling : opties.breedte - marge - vulling - doelBreedte;
  const y = boven
    ? opties.bovenkant + marge + vulling
    : opties.bovenkant + opties.hoogte - marge - vulling - doelHoogte;

  // Wit vlak eronder, zodat het logo leesbaar blijft op een drukke tekening.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - vulling, y - vulling, doelBreedte + vulling * 2, doelHoogte + vulling * 2);
  ctx.drawImage(logo, x, y, doelBreedte, doelHoogte);
}

/* ------------------------------------------------------------------ */
/* Naam                                                                */
/* ------------------------------------------------------------------ */

/**
 * Zet de naam in holle letters neer: zwarte contour met een witte binnenkant,
 * zodat een kind hem zelf kan inkleuren.
 */
function tekenNaam(
  ctx: CanvasRenderingContext2D,
  naam: string,
  breedte: number,
  bandBovenkant: number,
  bandHoogte: number
) {
  let grootte = Math.round(bandHoogte * 0.62);
  const maxBreedte = breedte * NAAM_MAXBREEDTE;

  // Een lange naam past niet op één regel; verklein tot hij past.
  for (let poging = 0; poging < 24; poging += 1) {
    ctx.font = `700 ${grootte}px "DynaPuff", system-ui, sans-serif`;
    if (ctx.measureText(naam).width <= maxBreedte || grootte <= 12) break;
    grootte = Math.round(grootte * 0.92);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(2, grootte * 0.11);
  ctx.strokeStyle = "#000000";
  ctx.fillStyle = "#ffffff";

  const x = breedte / 2;
  const y = bandBovenkant + bandHoogte / 2;
  ctx.strokeText(naam, x, y);
  ctx.fillText(naam, x, y);
}

/* ------------------------------------------------------------------ */
/* Samenstellen                                                        */
/* ------------------------------------------------------------------ */

/**
 * Bouwt de plaat op: de tekening, een witte strook eronder met de naam, en het
 * logo in de gekozen hoek. Levert het canvas op, zodat de aanroeper er zelf een
 * PNG van kan maken.
 */
export async function steldeKleurplaatSamen(
  tekeningUrl: string,
  opties: CompositieOpties
): Promise<HTMLCanvasElement> {
  const naam = opties.naam?.trim() ?? "";
  const [tekening, logo] = await Promise.all([
    laadAfbeelding(tekeningUrl),
    opties.logoHoek === "geen"
      ? Promise.resolve(null)
      : laadAfbeelding(opties.logoUrl ?? STANDAARD_LOGO),
  ]);
  if (naam) await wachtOpFont();

  const breedte = tekening.naturalWidth;
  const tekeningHoogte = tekening.naturalHeight;
  const bandHoogte = naam ? Math.round(tekeningHoogte * NAAM_BAND) : 0;

  const canvas = document.createElement("canvas");
  canvas.width = breedte;
  canvas.height = tekeningHoogte + bandHoogte;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is niet beschikbaar in deze browser.");

  // Wit eerst: een model kan een doorzichtige achtergrond opleveren, en een
  // kleurplaat hoort wit te zijn.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(tekening, 0, 0);

  if (logo && opties.logoHoek !== "geen") {
    const bron = opties.logoStijl === "lijn" ? alsLijntekening(logo) : logo;
    tekenLogo(ctx, bron, logo.naturalWidth, logo.naturalHeight, {
      hoek: opties.logoHoek,
      breedte,
      hoogte: tekeningHoogte,
      bovenkant: 0,
    });
  }

  if (naam) tekenNaam(ctx, naam, breedte, tekeningHoogte, bandHoogte);

  return canvas;
}

export function canvasNaarBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Kon er geen PNG van maken."))),
      "image/png"
    );
  });
}
