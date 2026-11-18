/**
 * De toegangsregel van `/api/maileon` en `/api/maileon/archive`: sessie,
 * geldig deeltoken (alleen de gedeelde periode en mailings), of niets.
 * De routes worden zelf aangeroepen, met een nagebootste Maileon-API.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { resolveMaileonAccess } from "./access";
import { createSessionToken } from "@/lib/auth";
import { createShareToken } from "@/lib/share-token";
import { GET as getMailings } from "@/app/api/maileon/route";
import { GET as getArchive } from "@/app/api/maileon/archive/route";

process.env.SESSION_SECRET = "ab".repeat(32);
process.env.MAILEON_API_KEY = "test-sleutel";

/* ---------- Nagebootste Maileon ---------- */

const MAILINGS = [
  { id: 1, name: "Kerstactie DMID1", schedule: "2026-03-10 09:00:00" },
  { id: 2, name: "Abonnementen DMID2", schedule: "2026-03-15 09:00:00" },
  { id: 3, name: "Kerstactie later DMID3", schedule: "2026-06-01 09:00:00" },
  { id: 4, name: "Oude kerstactie DMID4", schedule: "2026-01-05 09:00:00" },
];

function mailingsXml(after: string): string {
  const items = MAILINGS.filter((m) => m.schedule >= after).map((m) => `
    <mailing><id>${m.id}</id><fields>
      <field><name>name</name><value>${m.name}</value></field>
      <field><name>state</name><value>done</value></field>
      <field><name>type</name><value>regular</value></field>
      <field><name>scheduleTime</name><value>${m.schedule}</value></field>
    </fields></mailing>`);
  return `<mailings>${items.join("")}</mailings>`;
}

function summariesXml(ids: string[]): string {
  const items = ids.map((id) => `
    <mailing_summary><mailing_id>${id}</mailing_id><recipients>100</recipients>
      <opens>50</opens><opens_unique>40</opens_unique><clicks>10</clicks><clicks_unique>8</clicks_unique>
      <bounces>1</bounces><unsubscriptions>2</unsubscriptions></mailing_summary>`);
  return `<mailing_summaries>${items.join("")}</mailing_summaries>`;
}

let calls: string[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.pathname + url.search);
    if (url.pathname.endsWith("/mailings/filter/scheduletime")) {
      return new Response(mailingsXml(url.searchParams.get("scheduleTime") ?? ""));
    }
    if (url.pathname.endsWith("/reports/mailing_summaries")) {
      return new Response(summariesXml(url.searchParams.getAll("mailing_id")));
    }
    const archive = url.pathname.match(/\/mailings\/(\d+)\/archiveurl$/);
    if (archive) {
      return new Response(`<archive_url>https://archief.example.com/${archive[1]}</archive_url>`);
    }
    return new Response("onbekend", { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

/* ---------- Hulpjes ---------- */

const SESSION = createSessionToken("collega@example.com");
const MARCH_KERST = createShareToken({
  kind: "dm", q: "kerst", preset: "custom", customFrom: "2026-03-01", customTo: "2026-03-31",
});

function request(path: string, { session, token }: { session?: string; token?: string } = {}) {
  const url = new URL(`http://localhost${path}`);
  if (token) url.searchParams.set("token", token);
  return new NextRequest(url, { headers: session ? { cookie: `psv_session=${session}` } : {} });
}

const YEAR = "/api/maileon?from=2026-01-01&to=2026-12-31";

/* ---------- /api/maileon ---------- */

test("zonder sessie en zonder token: 401, en Maileon wordt niet gevraagd", async () => {
  const res = await getMailings(request(YEAR));
  assert.equal(res.status, 401);
  assert.deepEqual(calls, []);
});

test("met een zelfgemaakt of verlopen token: 401", async () => {
  const unsigned = Buffer.from(JSON.stringify({ kind: "dm", preset: "1y", q: "" })).toString("base64url");
  for (const token of [unsigned, `${MARCH_KERST}x`, "abc"]) {
    const res = await getMailings(request(YEAR, { token }));
    assert.equal(res.status, 401, token);
  }
  // Een ongeldige sessiecookie telt ook niet.
  const res = await getMailings(request(YEAR, { session: "nep.cookie" }));
  assert.equal(res.status, 401);
  assert.deepEqual(calls, []);
});

test("met een sessie: alle mailings in de gevraagde periode", async () => {
  const res = await getMailings(request(YEAR, { session: SESSION }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.mailings.map((m: { id: number }) => m.id), [3, 2, 1, 4]);
  assert.equal(body.totals.mailings, 4);
  assert.ok(calls[0].includes("scheduleTime=2026-01-01+00%3A00%3A00"));
});

test("met een deeltoken: alleen de periode en de mailings van de deellink", async () => {
  const res = await getMailings(request(YEAR, { token: MARCH_KERST }));
  assert.equal(res.status, 200);
  const body = await res.json();
  // Alleen de kerstmailing uit maart; niet de abonnementenmailing (andere zoekterm)
  // en niet de kerstmailings van januari en juni (buiten de periode).
  assert.deepEqual(body.mailings.map((m: { id: number }) => m.id), [1]);
  assert.equal(body.totals.mailings, 1);
  assert.equal(body.totals.recipients, 100);
  // De periode is ingeperkt tot maart, met een dag speling.
  assert.ok(calls[0].includes("scheduleTime=2026-02-28+00%3A00%3A00"), calls[0]);
});

test("een deeltoken zonder DM-data (zoals een ticketlink): 403", async () => {
  const token = createShareToken({ kind: "ticket-event", eventId: "123" });
  const res = await getMailings(request(YEAR, { token }));
  assert.equal(res.status, 403);
  assert.deepEqual(calls, []);
});

test("toegang komt vóór de controle van de parameters", async () => {
  assert.equal((await getMailings(request("/api/maileon"))).status, 401);
  assert.equal((await getMailings(request("/api/maileon", { session: SESSION }))).status, 400);
  assert.equal((await getMailings(request("/api/maileon?from=gisteren&to=vandaag", { session: SESSION }))).status, 400);
});

/* ---------- /api/maileon/archive ---------- */

test("archief zonder sessie en zonder token: 401", async () => {
  const res = await getArchive(request("/api/maileon/archive?mailingId=1"));
  assert.equal(res.status, 401);
  assert.deepEqual(calls, []);
});

test("archief met een sessie: elke mailing", async () => {
  const res = await getArchive(request("/api/maileon/archive?mailingId=2", { session: SESSION }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { archiveUrl: "https://archief.example.com/2" });
});

test("archief met een deeltoken: alleen mailings van de deellink", async () => {
  const ok = await getArchive(request("/api/maileon/archive?mailingId=1", { token: MARCH_KERST }));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { archiveUrl: "https://archief.example.com/1" });

  for (const id of [2, 3, 4, 999]) {
    calls = [];
    const res = await getArchive(request(`/api/maileon/archive?mailingId=${id}`, { token: MARCH_KERST }));
    assert.equal(res.status, 403, `mailing ${id}`);
    assert.ok(!calls.some((c) => c.includes("archiveurl")), `mailing ${id}`);
  }
});

/* ---------- De regel zelf, ook voor opgeslagen rapporten ---------- */

const REPORT = {
  sources: { dm: { enabled: true, period: { preset: "custom", from: "2026-02-01", to: "2026-02-28" }, queries: ["abonnement"] } },
};
const loadReport = async (id: string) => (id === "rapport-1" ? REPORT : null);

test("rapporttoken: de periode en zoektermen van het opgeslagen rapport", async () => {
  const access = await resolveMaileonAccess({ token: createShareToken({ kind: "report", id: "rapport-1" }) }, loadReport);
  assert.deepEqual(access, { ok: true, scope: { from: "2026-02-01", to: "2026-02-28", queries: ["abonnement"] } });
});

test("rapporttoken van een verwijderd rapport: 403", async () => {
  const access = await resolveMaileonAccess({ token: createShareToken({ kind: "report", id: "weg" }) }, loadReport);
  assert.equal(access.ok, false);
  assert.equal(!access.ok && access.status, 403);
});

test("een sessie gaat voor: geen beperking, ook met een token erbij", async () => {
  const access = await resolveMaileonAccess({ sessionCookie: SESSION, token: MARCH_KERST }, loadReport);
  assert.deepEqual(access, { ok: true, scope: null });
});

test("zonder sessie en token, of met een ongeldig token: 401", async () => {
  for (const input of [{}, { token: "abc" }, { sessionCookie: "nep", token: "" }]) {
    const access = await resolveMaileonAccess(input, loadReport);
    assert.equal(!access.ok && access.status, 401, JSON.stringify(input));
  }
});
