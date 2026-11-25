import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import type { CampagneConfig } from "../../../lib/groepsfoto/campagne.ts";
import { leegCache, verwerk, type Omgeving } from "./handler.ts";
import { GeheugenLimiet, opslagDagTeller, tellerPad, dagVan } from "./limieten.ts";
import type { Opslag } from "./opslag.ts";
import { maakTicket, maakTicketSleutel } from "./ticket.ts";

const ORIGIN = "https://club.psv.nl";
const SELFIE = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const NU = Date.parse("2026-12-01T12:00:00Z");
const SLEUTEL = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

function config(extra: Partial<CampagneConfig> = {}): CampagneConfig {
  return {
    schema: 1,
    campagne: "kerst-2026",
    actief: true,
    gepubliceerdOp: "2026-11-24T12:00:00.000Z",
    replicate: {
      pad: "/models/google/nano-banana/predictions",
      promptVeld: "prompt",
      referentieVeld: "image_input",
      referentieIsLijst: true,
      vasteInvoer: { aspect_ratio: "match_input_image", output_format: "png" },
    },
    basisfoto: { pad: "campagnes/kerst-2026/basisfoto.jpg", contentType: "image/jpeg", breedte: 4, hoogte: 3 },
    keuzes: { posities: ["automatisch"], kleding: ["passend", "shirt"] },
    prompts: { "automatisch|passend": "PROMPT PASSEND", "automatisch|shirt": "PROMPT SHIRT" },
    limieten: { perIpPerUur: 5, perDag: 100, perAccount: 3 },
    origins: [ORIGIN],
    label: "Gemaakt met AI",
    ...extra,
  };
}

interface Opname {
  url: string;
  method: string;
  body?: string;
  auth?: string | null;
}

let bestanden: Map<string, string | Uint8Array>;
let opnames: Opname[];
let turnstileOk: boolean;
let voorspelling: { status: string; output?: unknown; error?: string | null };

function opslag(): Opslag {
  return {
    async leesTekst(pad) {
      const v = bestanden.get(pad);
      return typeof v === "string" ? v : null;
    },
    async leesBytes(pad) {
      const v = bestanden.get(pad);
      return v instanceof Uint8Array ? v : null;
    },
    async schrijf(pad, inhoud) {
      bestanden.set(pad, inhoud);
    },
  };
}

async function omgeving(extra: Partial<Omgeving> = {}): Promise<Omgeving> {
  const o = opslag();
  return {
    opslag: o,
    dagTeller: opslagDagTeller(o),
    ipLimiet: new GeheugenLimiet(),
    ticketSleutel: await maakTicketSleutel(SLEUTEL),
    replicateToken: "r8_geheim",
    turnstileSecret: "ts_geheim",
    ipHeader: "x-real-ip",
    nu: () => NU,
    fetch: async (input, init) => {
      const url = String(input);
      opnames.push({
        url,
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : init?.body?.toString(),
        auth: new Headers(init?.headers).get("Authorization"),
      });
      if (url.startsWith("https://challenges.cloudflare.com/")) return Response.json({ success: turnstileOk });
      if (url.endsWith("/predictions") && init?.method === "POST") return Response.json({ id: "pred123abc", status: "starting" });
      if (url.includes("/predictions/pred123abc")) return Response.json({ id: "pred123abc", ...voorspelling });
      if (url.startsWith("https://replicate.delivery/")) {
        return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
      }
      return new Response("onverwacht", { status: 500 });
    },
    ...extra,
  };
}

function aanvraag(pad: string, init: RequestInit & { origin?: string | null; ip?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.origin !== null) headers.set("origin", init.origin ?? ORIGIN);
  headers.set("x-real-ip", init.ip ?? "203.0.113.7");
  return new Request(`https://psv-groepsfoto.b-cdn.net${pad}`, { ...init, headers });
}

function maak(body: Record<string, unknown> = {}, init: { ip?: string } = {}): Request {
  return aanvraag("/groepsfoto/kerst-2026/maak", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ selfie: SELFIE, toestemming: true, kleding: "shirt", turnstile: "tok", ...body }),
    ...init,
  });
}

beforeEach(() => {
  leegCache();
  bestanden = new Map<string, string | Uint8Array>([
    ["campagnes/kerst-2026/config.json", JSON.stringify(config())],
    ["campagnes/kerst-2026/basisfoto.jpg", new Uint8Array([0xff, 0xd8, 0xff])],
  ]);
  opnames = [];
  turnstileOk = true;
  voorspelling = { status: "processing" };
});

/* ---------------- routes en herkomst ---------------- */

test("onbekend pad: kale 404 zonder te verraden wat hier draait", async () => {
  const res = await verwerk(aanvraag("/"), await omgeving());
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "Not found");
});

test("onbekende campagne: 404", async () => {
  const res = await verwerk(aanvraag("/groepsfoto/bestaat-niet/maak", { method: "POST" }), await omgeving());
  assert.equal(res.status, 404);
});

test("verkeerde of ontbrekende herkomst: 403 zonder CORS-headers", async () => {
  for (const origin of ["https://evil.example", null]) {
    const res = await verwerk(aanvraag("/groepsfoto/kerst-2026/maak", { method: "POST", origin }), await omgeving());
    assert.equal(res.status, 403);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  }
});

test("preflight vanaf de campagnepagina", async () => {
  const res = await verwerk(aanvraag("/groepsfoto/kerst-2026/maak", { method: "OPTIONS" }), await omgeving());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
});

/* ---------------- maken ---------------- */

test("maken: basisfoto en selfie in vaste volgorde, prompt uit de config, alleen een ticket terug", async () => {
  const res = await verwerk(maak(), await omgeving());
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.deepEqual(Object.keys(JSON.parse(body)), ["ticket"]);
  assert.doesNotMatch(body, /pred123abc|replicate|nano-banana|PROMPT/i);
  assert.equal(res.headers.get("cache-control"), "no-store");

  const start = opnames.find((o) => o.url.endsWith("/predictions"));
  assert.ok(start);
  assert.equal(start.url, "https://api.replicate.com/v1/models/google/nano-banana/predictions");
  assert.equal(start.auth, "Bearer r8_geheim");
  const { input } = JSON.parse(start.body ?? "{}") as { input: Record<string, unknown> };
  assert.equal(input.prompt, "PROMPT SHIRT");
  assert.deepEqual(input.image_input, ["data:image/jpeg;base64,/9j/", SELFIE]);
  assert.equal(input.aspect_ratio, "match_input_image");
  assert.equal(input.output_format, "png");

  const turnstile = opnames.find((o) => o.url.includes("turnstile"));
  assert.match(turnstile?.body ?? "", /secret=ts_geheim/);
  assert.match(turnstile?.body ?? "", /remoteip=203\.0\.113\.7/);
});

test("maken: zonder toestemming, met een foute selfie of een onbekende keuze gebeurt er niets", async () => {
  const omg = await omgeving();
  for (const [body, status] of [
    [{ toestemming: false }, 400],
    [{ selfie: "data:text/html;base64,PGgxPg==" }, 400],
    [{ kleding: "badpak" }, 400],
    [{ positie: "links" }, 400],
  ] as const) {
    const res = await verwerk(maak(body), omg);
    assert.equal(res.status, status, JSON.stringify(body));
  }
  assert.equal(opnames.length, 0);
});

test("maken: Turnstile afgekeurd → 403, geen Replicate en geen telling", async () => {
  turnstileOk = false;
  const res = await verwerk(maak(), await omgeving());
  assert.equal(res.status, 403);
  assert.ok(!opnames.some((o) => o.url.includes("replicate")));
  assert.equal(bestanden.has(tellerPad("kerst-2026", dagVan(NU))), false);
});

test("maken: dagplafond bereikt → 429", async () => {
  bestanden.set("campagnes/kerst-2026/config.json", JSON.stringify(config({ limieten: { perIpPerUur: 5, perDag: 1, perAccount: 3 } })));
  const omg = await omgeving();
  assert.equal((await verwerk(maak({}, { ip: "198.51.100.1" }), omg)).status, 200);
  const res = await verwerk(maak({}, { ip: "198.51.100.2" }), omg);
  assert.equal(res.status, 429);
  assert.equal(((await res.json()) as { code: string }).code, "vol");
});

test("maken: te vaak vanaf één IP → 429", async () => {
  bestanden.set("campagnes/kerst-2026/config.json", JSON.stringify(config({ limieten: { perIpPerUur: 1, perDag: 100, perAccount: 3 } })));
  const omg = await omgeving();
  assert.equal((await verwerk(maak(), omg)).status, 200);
  const res = await verwerk(maak(), omg);
  assert.equal(res.status, 429);
  assert.equal(((await res.json()) as { code: string }).code, "te-vaak");
});

test("maken: campagne uit → 503 gesloten, maar status van een lopende kaart werkt nog", async () => {
  const omg = await omgeving();
  const ticket = await maakTicket(omg.ticketSleutel, { p: "pred123abc", c: "kerst-2026", v: NU + 60_000 });
  bestanden.set("campagnes/kerst-2026/config.json", JSON.stringify(config({ actief: false })));
  const res = await verwerk(maak(), omg);
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { code: string }).code, "gesloten");
  assert.equal((await verwerk(aanvraag(`/groepsfoto/kerst-2026/status/${ticket}`), omg)).status, 200);
});

test("maken: een fout van Replicate komt niet bij de bezoeker", async () => {
  const omg = await omgeving();
  const echt = omg.fetch;
  omg.fetch = async (input, init) =>
    String(input).endsWith("/predictions") ? new Response("Invalid token r8_geheim", { status: 401 }) : echt(input, init);
  const res = await verwerk(maak(), omg);
  assert.equal(res.status, 502);
  assert.doesNotMatch(await res.text(), /r8_|Invalid|401|replicate/i);
});

/* ---------------- status en beeld ---------------- */

async function ticketVoor(omg: Omgeving, c = "kerst-2026", v = NU + 60_000): Promise<string> {
  return maakTicket(omg.ticketSleutel, { p: "pred123abc", c, v });
}

test("status: bezig, klaar en mislukt (met een vriendelijke melding bij een weigering)", async () => {
  const omg = await omgeving();
  const pad = `/groepsfoto/kerst-2026/status/${await ticketVoor(omg)}`;

  assert.deepEqual(await (await verwerk(aanvraag(pad), omg)).json(), { status: "bezig" });

  voorspelling = { status: "succeeded", output: ["https://replicate.delivery/xezq/abc/out.png"] };
  const klaar = await verwerk(aanvraag(pad), omg);
  const tekst = await klaar.text();
  assert.deepEqual(JSON.parse(tekst), { status: "klaar" });
  assert.doesNotMatch(tekst, /replicate/);

  voorspelling = { status: "failed", error: "Output flagged as sensitive (E005)" };
  const mislukt = (await (await verwerk(aanvraag(pad), omg)).json()) as { status: string; melding: string };
  assert.equal(mislukt.status, "mislukt");
  assert.match(mislukt.melding, /andere selfie/);
});

test("tickets: nagemaakt, verlopen of van een andere campagne → 404", async () => {
  const omg = await omgeving();
  bestanden.set("campagnes/huldiging/config.json", JSON.stringify(config({ campagne: "huldiging" })));
  for (const ticket of [
    "a".repeat(40),
    await ticketVoor(omg, "kerst-2026", NU - 1),
    await ticketVoor(omg, "huldiging"),
  ]) {
    const res = await verwerk(aanvraag(`/groepsfoto/kerst-2026/status/${ticket}`), omg);
    assert.equal(res.status, 404);
  }
  assert.ok(!opnames.some((o) => o.url.includes("/predictions/")));
});

test("beeld: komt via het script, zonder cache, en alleen van replicate.delivery", async () => {
  const omg = await omgeving();
  const pad = `/groepsfoto/kerst-2026/beeld/${await ticketVoor(omg)}`;

  voorspelling = { status: "succeeded", output: "https://replicate.delivery/xezq/abc/out.png" };
  const res = await verwerk(aanvraag(pad), omg);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [1, 2, 3]);

  voorspelling = { status: "succeeded", output: "https://evil.example/out.png" };
  assert.equal((await verwerk(aanvraag(pad), omg)).status, 404);
});
