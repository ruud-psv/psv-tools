/**
 * Het publieke script van de groepsfoto-campagne, los van de Bunny-runtime
 * zodat het te testen is. `main.ts` koppelt het aan Bunny.
 *
 * Routes (alles onder `/groepsfoto/<campagne>/`):
 *
 * - `POST maak`            selfie + keuzes → `{ ticket }`
 * - `GET  status/<ticket>` → `{ status: "bezig" | "klaar" | "mislukt", melding? }`
 * - `GET  beeld/<ticket>`  → het beeld zelf
 *
 * Wat de browser nooit ziet: de Replicate-sleutel, het prediction-id, de
 * modelnaam, de prompt, een `replicate.delivery`-adres of een foutmelding van
 * Replicate. Foutmeldingen zijn altijd eigen teksten; details gaan naar de
 * logs van Bunny.
 */

import type { CampagneConfig } from "../../../lib/groepsfoto/campagne.ts";
import { GeheugenLimiet, type DagTeller } from "./limieten.ts";
import type { Opslag } from "./opslag.ts";
import { leesTicket, maakTicket, TICKET_GELDIG_MS } from "./ticket.ts";

export interface Omgeving {
  opslag: Opslag;
  dagTeller: DagTeller;
  ipLimiet: GeheugenLimiet;
  ticketSleutel: CryptoKey;
  replicateToken: string;
  turnstileSecret: string;
  /** Uit welke header het IP-adres van de bezoeker komt. */
  ipHeader: string;
  fetch: typeof fetch;
  nu: () => number;
  replicateBasis?: string;
  log?: (...args: unknown[]) => void;
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;
const SELFIE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
/** Een selfie van 1024px als JPEG is een paar honderd kB; dit is ruim. */
const MAX_SELFIE_BYTES = 3_000_000;
const MAX_BODY_BYTES = 4_500_000;
/** Zo lang blijven config en basisfoto in het geheugen; uitzetten werkt dus binnen een halve minuut. */
const CONFIG_CACHE_MS = 30_000;

/* ------------------------------------------------------------------ */
/* Antwoorden                                                          */
/* ------------------------------------------------------------------ */

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(origin),
    },
  });
}

function fout(code: string, melding: string, status: number, origin: string | null): Response {
  return json({ code, melding }, status, origin);
}

const MELDING = {
  onbekend: "Deze actie bestaat niet.",
  gesloten: "Deze actie is gesloten. Bedankt voor je interesse!",
  vol: "Vandaag zijn er al heel veel kaarten gemaakt. Probeer het morgen opnieuw.",
  teVaak: "Je hebt het afgelopen uur al een paar kaarten gemaakt. Probeer het later opnieuw.",
  robot: "We konden niet bevestigen dat je geen robot bent. Ververs de pagina en probeer het opnieuw.",
  selfie: "Upload eerst een selfie (jpg, png of webp).",
  teGroot: "Deze foto is te groot. Probeer een kleinere foto.",
  toestemming: "Bevestig eerst dat de foto van jou is, of dat je toestemming hebt.",
  keuze: "Deze keuze bestaat niet.",
  storing: "Er ging iets mis bij het maken van je kaart. Probeer het over een paar minuten opnieuw.",
  ticket: "Deze kaart is niet (meer) te vinden. Maak een nieuwe.",
  geweigerd: "Met deze foto lukte het niet. Probeer een andere selfie: alleen jij in beeld, recht naar de camera.",
  verlopen: "Deze kaart is niet meer beschikbaar. Maak een nieuwe.",
} as const;

/* ------------------------------------------------------------------ */
/* Config en basisfoto                                                 */
/* ------------------------------------------------------------------ */

interface Gecacht {
  config: CampagneConfig | null;
  basisfoto?: string;
  op: number;
}

const cache = new Map<string, Gecacht>();

/** Alleen voor tests. */
export function leegCache(): void {
  cache.clear();
}

async function laadConfig(slug: string, omg: Omgeving): Promise<CampagneConfig | null> {
  const nu = omg.nu();
  const gecacht = cache.get(slug);
  if (gecacht && nu - gecacht.op < CONFIG_CACHE_MS) return gecacht.config;

  const ruw = await omg.opslag.leesTekst(`campagnes/${slug}/config.json`);
  let config: CampagneConfig | null = null;
  if (ruw) {
    const gelezen = JSON.parse(ruw) as CampagneConfig;
    if (gelezen?.schema === 1 && gelezen.campagne === slug) config = gelezen;
  }
  // De basisfoto blijft bewaard zolang de publicatie dezelfde is.
  const basisfoto =
    gecacht?.config && config && gecacht.config.gepubliceerdOp === config.gepubliceerdOp
      ? gecacht.basisfoto
      : undefined;
  cache.set(slug, { config, basisfoto, op: nu });
  return config;
}

async function laadBasisfoto(config: CampagneConfig, omg: Omgeving): Promise<string> {
  const gecacht = cache.get(config.campagne);
  if (gecacht?.basisfoto) return gecacht.basisfoto;

  const bytes = await omg.opslag.leesBytes(config.basisfoto.pad);
  if (!bytes) throw new Error(`Basisfoto ontbreekt: ${config.basisfoto.pad}`);
  let binair = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binair += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const dataUrl = `data:${config.basisfoto.contentType};base64,${btoa(binair)}`;
  if (gecacht) gecacht.basisfoto = dataUrl;
  return dataUrl;
}

/* ------------------------------------------------------------------ */
/* Replicate en Turnstile                                              */
/* ------------------------------------------------------------------ */

interface Voorspelling {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string | null;
}

async function replicate(omg: Omgeving, pad: string, init?: RequestInit): Promise<Voorspelling> {
  const res = await omg.fetch(`${omg.replicateBasis ?? "https://api.replicate.com/v1"}${pad}`, {
    ...init,
    headers: { Authorization: `Bearer ${omg.replicateToken}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const tekst = await res.text().catch(() => "");
    throw new Error(`Replicate ${pad}: HTTP ${res.status} ${tekst.slice(0, 300)}`);
  }
  return (await res.json()) as Voorspelling;
}

/** Zelfde logica als `eersteAfbeelding()` in `lib/replicate/client.ts`. */
function eersteAfbeelding(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const url = eersteAfbeelding(item);
      if (url) return url;
    }
    return undefined;
  }
  if (output && typeof output === "object") {
    const url = (output as { url?: unknown }).url;
    if (typeof url === "string") return url;
  }
  return undefined;
}

function isReplicateBeeld(ruw: string): boolean {
  try {
    const url = new URL(ruw);
    return url.protocol === "https:" && (url.hostname === "replicate.delivery" || url.hostname.endsWith(".replicate.delivery"));
  } catch {
    return false;
  }
}

/** Een weigering door het veiligheidsfilter van het model, of een andere fout? */
function isWeigering(fout: string | null | undefined): boolean {
  return /safety|nsfw|sensitive|flagged|blocked|refus|policy|moderation/i.test(fout ?? "");
}

async function controleerTurnstile(token: unknown, ip: string, omg: Omgeving): Promise<boolean> {
  if (typeof token !== "string" || !token || token.length > 4096) return false;
  const body = new URLSearchParams({ secret: omg.turnstileSecret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await omg.fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const uitslag = (await res.json()) as { success?: boolean };
    return uitslag.success === true;
  } catch (err) {
    omg.log?.("Turnstile onbereikbaar", err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

function ipVan(req: Request, header: string): string {
  const waarde = req.headers.get(header) ?? req.headers.get("x-forwarded-for") ?? "";
  return waarde.split(",")[0].trim().slice(0, 64);
}

async function maak(req: Request, config: CampagneConfig, origin: string, omg: Omgeving): Promise<Response> {
  const lengte = Number(req.headers.get("content-length") ?? "0");
  if (lengte > MAX_BODY_BYTES) return fout("te-groot", MELDING.teGroot, 413, origin);

  let body: Record<string, unknown>;
  try {
    const tekst = await req.text();
    if (tekst.length > MAX_BODY_BYTES) return fout("te-groot", MELDING.teGroot, 413, origin);
    body = JSON.parse(tekst) as Record<string, unknown>;
  } catch {
    return fout("ongeldig", MELDING.selfie, 400, origin);
  }

  if (body.toestemming !== true) return fout("toestemming", MELDING.toestemming, 400, origin);

  const selfie = typeof body.selfie === "string" ? body.selfie : "";
  if (!SELFIE.test(selfie)) return fout("selfie", MELDING.selfie, 400, origin);
  if (Math.floor(((selfie.length - selfie.indexOf(",") - 1) * 3) / 4) > MAX_SELFIE_BYTES) {
    return fout("te-groot", MELDING.teGroot, 413, origin);
  }

  const positie = String(body.positie ?? config.keuzes.posities[0]);
  const kleding = String(body.kleding ?? config.keuzes.kleding[0]);
  const prompt = config.prompts[`${positie}|${kleding}`];
  if (!prompt) return fout("keuze", MELDING.keuze, 400, origin);

  const ip = ipVan(req, omg.ipHeader);
  if (!(await controleerTurnstile(body.turnstile, ip, omg))) return fout("robot", MELDING.robot, 403, origin);

  const nu = omg.nu();
  if (ip && !omg.ipLimiet.probeer(`${config.campagne}|${ip}`, config.limieten.perIpPerUur, nu)) {
    return fout("te-vaak", MELDING.teVaak, 429, origin);
  }

  try {
    // Pas na alle controles telt een poging mee voor het dagplafond.
    if (!(await omg.dagTeller.reserveer(config.campagne, config.limieten.perDag, nu))) {
      return fout("vol", MELDING.vol, 429, origin);
    }

    const basisfoto = await laadBasisfoto(config, omg);
    const r = config.replicate;
    const input: Record<string, unknown> = {
      ...r.vasteInvoer,
      [r.promptVeld]: prompt,
      // De volgorde is vast en de prompt leunt erop: eerst de foto, dan de selfie.
      [r.referentieVeld]: [basisfoto, selfie],
    };
    const voorspelling = await replicate(omg, r.pad, {
      method: "POST",
      body: JSON.stringify(r.versie ? { version: r.versie, input } : { input }),
    });

    const ticket = await maakTicket(omg.ticketSleutel, {
      p: voorspelling.id,
      c: config.campagne,
      v: nu + TICKET_GELDIG_MS,
    });
    return json({ ticket }, 200, origin);
  } catch (err) {
    omg.log?.("Maken mislukt", config.campagne, err);
    return fout("storing", MELDING.storing, 502, origin);
  }
}

async function status(ticket: string, config: CampagneConfig, origin: string, omg: Omgeving): Promise<Response> {
  const inhoud = await leesTicket(omg.ticketSleutel, ticket, config.campagne, omg.nu());
  if (!inhoud) return fout("ticket", MELDING.ticket, 404, origin);

  try {
    const v = await replicate(omg, `/predictions/${encodeURIComponent(inhoud.p)}`);
    if (v.status === "succeeded") {
      return eersteAfbeelding(v.output)
        ? json({ status: "klaar" }, 200, origin)
        : json({ status: "mislukt", melding: MELDING.storing }, 200, origin);
    }
    if (v.status === "failed" || v.status === "canceled") {
      omg.log?.("Generatie mislukt", config.campagne, v.error);
      return json({ status: "mislukt", melding: isWeigering(v.error) ? MELDING.geweigerd : MELDING.storing }, 200, origin);
    }
    return json({ status: "bezig" }, 200, origin);
  } catch (err) {
    omg.log?.("Status mislukt", config.campagne, err);
    return fout("storing", MELDING.storing, 502, origin);
  }
}

async function beeld(ticket: string, config: CampagneConfig, origin: string, omg: Omgeving): Promise<Response> {
  const inhoud = await leesTicket(omg.ticketSleutel, ticket, config.campagne, omg.nu());
  if (!inhoud) return fout("ticket", MELDING.ticket, 404, origin);

  try {
    const v = await replicate(omg, `/predictions/${encodeURIComponent(inhoud.p)}`);
    const url = v.status === "succeeded" ? eersteAfbeelding(v.output) : undefined;
    if (!url || !isReplicateBeeld(url)) return fout("ticket", MELDING.ticket, 404, origin);

    const res = await omg.fetch(url);
    if (!res.ok || !res.body) return fout("verlopen", MELDING.verlopen, 410, origin);

    // TODO stap 4: "Gemaakt met AI"-label en IPTC-metadata erop zetten.
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/png",
        "Cache-Control": "no-store",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        ...corsHeaders(origin),
      },
    });
  } catch (err) {
    omg.log?.("Beeld mislukt", config.campagne, err);
    return fout("storing", MELDING.storing, 502, origin);
  }
}

export async function verwerk(req: Request, omg: Omgeving): Promise<Response> {
  const url = new URL(req.url);
  const delen = url.pathname.split("/").filter(Boolean);
  // Zonder herkenbare route: een kale 404, zonder te verraden wat hier draait.
  if (delen[0] !== "groepsfoto" || !SLUG.test(delen[1] ?? "")) {
    return new Response("Not found", { status: 404 });
  }
  const slug = delen[1];
  const actie = delen[2];

  let config: CampagneConfig | null;
  try {
    config = await laadConfig(slug, omg);
  } catch (err) {
    omg.log?.("Config lezen mislukt", slug, err);
    return fout("storing", MELDING.storing, 503, null);
  }
  if (!config) return fout("onbekend", MELDING.onbekend, 404, null);

  // Alleen de pagina's van de campagne krijgen CORS-headers; de rest weigert de browser.
  const origin = req.headers.get("origin");
  if (!origin || !config.origins.includes(origin)) {
    return fout("herkomst", MELDING.onbekend, 403, null);
  }

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

  if (actie === "maak" && delen.length === 3 && req.method === "POST") {
    // Uitzetten stopt nieuwe kaarten; wie al bezig is, krijgt zijn kaart nog.
    if (!config.actief) return fout("gesloten", MELDING.gesloten, 503, origin);
    return maak(req, config, origin, omg);
  }
  if (actie === "status" && delen.length === 4 && req.method === "GET") return status(delen[3], config, origin, omg);
  if (actie === "beeld" && delen.length === 4 && req.method === "GET") return beeld(delen[3], config, origin, omg);

  return fout("onbekend", MELDING.onbekend, 404, origin);
}
