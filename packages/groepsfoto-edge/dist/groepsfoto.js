// packages/groepsfoto-edge/src/main.ts
import * as BunnySDK from "https://esm.sh/@bunny.net/edgescript-sdk@0.13.0";

// packages/groepsfoto-edge/src/ticket.ts
var TICKET_GELDIG_MS = 60 * 60 * 1e3;
function naarBase64Url(bytes) {
  let tekst = "";
  for (const b of bytes) tekst += String.fromCharCode(b);
  return btoa(tekst).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function vanBase64Url(tekst) {
  const b64 = tekst.replace(/-/g, "+").replace(/_/g, "/");
  const ruw = atob(b64 + "=".repeat((4 - b64.length % 4) % 4));
  return Uint8Array.from(ruw, (c) => c.charCodeAt(0));
}
async function maakTicketSleutel(base64) {
  const ruw = Uint8Array.from(atob(base64.trim()), (c) => c.charCodeAt(0));
  if (ruw.length !== 32) throw new Error("TICKET_SLEUTEL moet 32 bytes zijn, als base64.");
  return crypto.subtle.importKey("raw", ruw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function maakTicket(sleutel, inhoud) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(inhoud));
  const versleuteld = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sleutel, data));
  const samen = new Uint8Array(iv.length + versleuteld.length);
  samen.set(iv);
  samen.set(versleuteld, iv.length);
  return naarBase64Url(samen);
}
async function leesTicket(sleutel, ticket, campagne, nu) {
  if (!/^[A-Za-z0-9_-]{30,400}$/.test(ticket)) return null;
  try {
    const bytes = vanBase64Url(ticket);
    const iv = bytes.slice(0, 12);
    const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, sleutel, bytes.slice(12));
    const inhoud = JSON.parse(new TextDecoder().decode(data));
    if (typeof inhoud.p !== "string" || inhoud.c !== campagne || !(inhoud.v > nu)) return null;
    return inhoud;
  } catch {
    return null;
  }
}

// packages/groepsfoto-edge/src/handler.ts
var SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;
var SELFIE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
var MAX_SELFIE_BYTES = 3e6;
var MAX_BODY_BYTES = 45e5;
var CONFIG_CACHE_MS = 3e4;
function corsHeaders(origin) {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}
function json(body, status2, origin) {
  return new Response(JSON.stringify(body), {
    status: status2,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(origin)
    }
  });
}
function fout(code, melding, status2, origin) {
  return json({ code, melding }, status2, origin);
}
var MELDING = {
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
  verlopen: "Deze kaart is niet meer beschikbaar. Maak een nieuwe."
};
var cache = /* @__PURE__ */ new Map();
async function laadConfig(slug, omg) {
  const nu = omg.nu();
  const gecacht = cache.get(slug);
  if (gecacht && nu - gecacht.op < CONFIG_CACHE_MS) return gecacht.config;
  const ruw = await omg.opslag.leesTekst(`campagnes/${slug}/config.json`);
  let config = null;
  if (ruw) {
    const gelezen = JSON.parse(ruw);
    if (gelezen?.schema === 1 && gelezen.campagne === slug) config = gelezen;
  }
  const basisfoto = gecacht?.config && config && gecacht.config.gepubliceerdOp === config.gepubliceerdOp ? gecacht.basisfoto : void 0;
  cache.set(slug, { config, basisfoto, op: nu });
  return config;
}
async function laadBasisfoto(config, omg) {
  const gecacht = cache.get(config.campagne);
  if (gecacht?.basisfoto) return gecacht.basisfoto;
  const bytes = await omg.opslag.leesBytes(config.basisfoto.pad);
  if (!bytes) throw new Error(`Basisfoto ontbreekt: ${config.basisfoto.pad}`);
  let binair = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    binair += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  const dataUrl = `data:${config.basisfoto.contentType};base64,${btoa(binair)}`;
  if (gecacht) gecacht.basisfoto = dataUrl;
  return dataUrl;
}
async function replicate(omg, pad, init) {
  const res = await omg.fetch(`${omg.replicateBasis ?? "https://api.replicate.com/v1"}${pad}`, {
    ...init,
    headers: { Authorization: `Bearer ${omg.replicateToken}`, "Content-Type": "application/json" }
  });
  if (!res.ok) {
    const tekst = await res.text().catch(() => "");
    throw new Error(`Replicate ${pad}: HTTP ${res.status} ${tekst.slice(0, 300)}`);
  }
  return await res.json();
}
function eersteAfbeelding(output) {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const url = eersteAfbeelding(item);
      if (url) return url;
    }
    return void 0;
  }
  if (output && typeof output === "object") {
    const url = output.url;
    if (typeof url === "string") return url;
  }
  return void 0;
}
function isReplicateBeeld(ruw) {
  try {
    const url = new URL(ruw);
    return url.protocol === "https:" && (url.hostname === "replicate.delivery" || url.hostname.endsWith(".replicate.delivery"));
  } catch {
    return false;
  }
}
function isWeigering(fout2) {
  return /safety|nsfw|sensitive|flagged|blocked|refus|policy|moderation/i.test(fout2 ?? "");
}
async function controleerTurnstile(token, ip, omg) {
  if (typeof token !== "string" || !token || token.length > 4096) return false;
  const body = new URLSearchParams({ secret: omg.turnstileSecret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await omg.fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body
    });
    const uitslag = await res.json();
    return uitslag.success === true;
  } catch (err) {
    omg.log?.("Turnstile onbereikbaar", err);
    return false;
  }
}
function ipVan(req, header) {
  const waarde = req.headers.get(header) ?? req.headers.get("x-forwarded-for") ?? "";
  return waarde.split(",")[0].trim().slice(0, 64);
}
async function maak(req, config, origin, omg) {
  const lengte = Number(req.headers.get("content-length") ?? "0");
  if (lengte > MAX_BODY_BYTES) return fout("te-groot", MELDING.teGroot, 413, origin);
  let body;
  try {
    const tekst = await req.text();
    if (tekst.length > MAX_BODY_BYTES) return fout("te-groot", MELDING.teGroot, 413, origin);
    body = JSON.parse(tekst);
  } catch {
    return fout("ongeldig", MELDING.selfie, 400, origin);
  }
  if (body.toestemming !== true) return fout("toestemming", MELDING.toestemming, 400, origin);
  const selfie = typeof body.selfie === "string" ? body.selfie : "";
  if (!SELFIE.test(selfie)) return fout("selfie", MELDING.selfie, 400, origin);
  if (Math.floor((selfie.length - selfie.indexOf(",") - 1) * 3 / 4) > MAX_SELFIE_BYTES) {
    return fout("te-groot", MELDING.teGroot, 413, origin);
  }
  const positie = String(body.positie ?? config.keuzes.posities[0]);
  const kleding = String(body.kleding ?? config.keuzes.kleding[0]);
  const prompt = config.prompts[`${positie}|${kleding}`];
  if (!prompt) return fout("keuze", MELDING.keuze, 400, origin);
  const ip = ipVan(req, omg.ipHeader);
  if (!await controleerTurnstile(body.turnstile, ip, omg)) return fout("robot", MELDING.robot, 403, origin);
  const nu = omg.nu();
  if (ip && !omg.ipLimiet.probeer(`${config.campagne}|${ip}`, config.limieten.perIpPerUur, nu)) {
    return fout("te-vaak", MELDING.teVaak, 429, origin);
  }
  try {
    if (!await omg.dagTeller.reserveer(config.campagne, config.limieten.perDag, nu)) {
      return fout("vol", MELDING.vol, 429, origin);
    }
    const basisfoto = await laadBasisfoto(config, omg);
    const r = config.replicate;
    const input = {
      ...r.vasteInvoer,
      [r.promptVeld]: prompt,
      // De volgorde is vast en de prompt leunt erop: eerst de foto, dan de selfie.
      [r.referentieVeld]: [basisfoto, selfie]
    };
    const voorspelling = await replicate(omg, r.pad, {
      method: "POST",
      body: JSON.stringify(r.versie ? { version: r.versie, input } : { input })
    });
    const ticket = await maakTicket(omg.ticketSleutel, {
      p: voorspelling.id,
      c: config.campagne,
      v: nu + TICKET_GELDIG_MS
    });
    return json({ ticket }, 200, origin);
  } catch (err) {
    omg.log?.("Maken mislukt", config.campagne, err);
    return fout("storing", MELDING.storing, 502, origin);
  }
}
async function status(ticket, config, origin, omg) {
  const inhoud = await leesTicket(omg.ticketSleutel, ticket, config.campagne, omg.nu());
  if (!inhoud) return fout("ticket", MELDING.ticket, 404, origin);
  try {
    const v = await replicate(omg, `/predictions/${encodeURIComponent(inhoud.p)}`);
    if (v.status === "succeeded") {
      return eersteAfbeelding(v.output) ? json({ status: "klaar" }, 200, origin) : json({ status: "mislukt", melding: MELDING.storing }, 200, origin);
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
async function beeld(ticket, config, origin, omg) {
  const inhoud = await leesTicket(omg.ticketSleutel, ticket, config.campagne, omg.nu());
  if (!inhoud) return fout("ticket", MELDING.ticket, 404, origin);
  try {
    const v = await replicate(omg, `/predictions/${encodeURIComponent(inhoud.p)}`);
    const url = v.status === "succeeded" ? eersteAfbeelding(v.output) : void 0;
    if (!url || !isReplicateBeeld(url)) return fout("ticket", MELDING.ticket, 404, origin);
    const res = await omg.fetch(url);
    if (!res.ok || !res.body) return fout("verlopen", MELDING.verlopen, 410, origin);
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/png",
        "Cache-Control": "no-store",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        ...corsHeaders(origin)
      }
    });
  } catch (err) {
    omg.log?.("Beeld mislukt", config.campagne, err);
    return fout("storing", MELDING.storing, 502, origin);
  }
}
async function verwerk(req, omg) {
  const url = new URL(req.url);
  const delen = url.pathname.split("/").filter(Boolean);
  if (delen[0] !== "groepsfoto" || !SLUG.test(delen[1] ?? "")) {
    return new Response("Not found", { status: 404 });
  }
  const slug = delen[1];
  const actie = delen[2];
  let config;
  try {
    config = await laadConfig(slug, omg);
  } catch (err) {
    omg.log?.("Config lezen mislukt", slug, err);
    return fout("storing", MELDING.storing, 503, null);
  }
  if (!config) return fout("onbekend", MELDING.onbekend, 404, null);
  const origin = req.headers.get("origin");
  if (!origin || !config.origins.includes(origin)) {
    return fout("herkomst", MELDING.onbekend, 403, null);
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (actie === "maak" && delen.length === 3 && req.method === "POST") {
    if (!config.actief) return fout("gesloten", MELDING.gesloten, 503, origin);
    return maak(req, config, origin, omg);
  }
  if (actie === "status" && delen.length === 4 && req.method === "GET") return status(delen[3], config, origin, omg);
  if (actie === "beeld" && delen.length === 4 && req.method === "GET") return beeld(delen[3], config, origin, omg);
  return fout("onbekend", MELDING.onbekend, 404, origin);
}

// packages/groepsfoto-edge/src/limieten.ts
function dagVan(nu) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(nu));
}
var tellerPad = (campagne, dag) => `tellers/${campagne}/${dag}.json`;
function opslagDagTeller(opslag) {
  return {
    async reserveer(campagne, plafond, nu) {
      const pad = tellerPad(campagne, dagVan(nu));
      const ruw = await opslag.leesTekst(pad);
      let aantal = 0;
      if (ruw) {
        try {
          aantal = Number(JSON.parse(ruw).aantal) || 0;
        } catch {
          aantal = 0;
        }
      }
      if (aantal >= plafond) return false;
      await opslag.schrijf(pad, JSON.stringify({ aantal: aantal + 1, bijgewerkt: new Date(nu).toISOString() }), "application/json");
      return true;
    }
  };
}
var UUR = 60 * 60 * 1e3;
var GeheugenLimiet = class {
  tijden = /* @__PURE__ */ new Map();
  probeer(sleutel, max, nu) {
    const recent = (this.tijden.get(sleutel) ?? []).filter((t) => nu - t < UUR);
    if (recent.length >= max) {
      this.tijden.set(sleutel, recent);
      return false;
    }
    recent.push(nu);
    this.tijden.set(sleutel, recent);
    if (this.tijden.size > 1e4) {
      for (const [k, v] of this.tijden) if (!v.some((t) => nu - t < UUR)) this.tijden.delete(k);
    }
    return true;
  }
};

// packages/groepsfoto-edge/src/opslag.ts
function bunnyOpslag(opties) {
  const f = opties.fetch ?? fetch;
  const basis = `https://${opties.host || "storage.bunnycdn.com"}/${opties.zone}/`;
  async function haal(pad) {
    const res = await f(basis + pad, { headers: { AccessKey: opties.sleutel } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Opslag lezen mislukt (HTTP ${res.status}) voor ${pad}`);
    return res;
  }
  return {
    async leesTekst(pad) {
      const res = await haal(pad);
      return res ? res.text() : null;
    },
    async leesBytes(pad) {
      const res = await haal(pad);
      return res ? new Uint8Array(await res.arrayBuffer()) : null;
    },
    async schrijf(pad, inhoud, contentType) {
      const res = await f(basis + pad, {
        method: "PUT",
        headers: { AccessKey: opties.sleutel, "Content-Type": contentType },
        body: inhoud
      });
      if (!res.ok) throw new Error(`Opslag schrijven mislukt (HTTP ${res.status}) voor ${pad}`);
    }
  };
}

// packages/groepsfoto-edge/src/main.ts
function env(naam) {
  try {
    if (typeof Deno !== "undefined") return Deno.env.get(naam);
  } catch {
  }
  return globalThis.process?.env?.[naam];
}
function verplicht(naam) {
  const waarde = env(naam)?.trim();
  if (!waarde) throw new Error(`${naam} ontbreekt in de omgeving van het script.`);
  return waarde;
}
async function bouwOmgeving() {
  const opslag = bunnyOpslag({
    zone: verplicht("STORAGE_ZONE"),
    sleutel: verplicht("STORAGE_KEY"),
    host: env("STORAGE_HOST")
  });
  return {
    opslag,
    dagTeller: opslagDagTeller(opslag),
    ipLimiet: new GeheugenLimiet(),
    ticketSleutel: await maakTicketSleutel(verplicht("TICKET_SLEUTEL")),
    replicateToken: verplicht("REPLICATE_API_TOKEN"),
    turnstileSecret: verplicht("TURNSTILE_SECRET"),
    ipHeader: env("IP_HEADER")?.trim().toLowerCase() || "x-real-ip",
    fetch: (input, init) => fetch(input, init),
    nu: () => Date.now(),
    log: (...args) => console.error("[groepsfoto]", ...args)
  };
}
var omgeving = null;
BunnySDK.net.http.serve(async (req) => {
  try {
    omgeving ??= bouwOmgeving();
    return await verwerk(req, await omgeving);
  } catch (err) {
    console.error("[groepsfoto] Script niet ingesteld:", err);
    omgeving = null;
    return new Response(JSON.stringify({ code: "storing", melding: "Er ging iets mis. Probeer het later opnieuw." }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
});
