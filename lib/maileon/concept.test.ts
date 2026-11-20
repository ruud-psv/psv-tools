import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ConceptFout,
  cdataXml,
  conceptNaam,
  controleerInvoer,
  htmlHash,
  leesId,
  leesStatus,
  leesVoorbeeld,
  maileonConceptApi,
  voorbeeldUitExport,
  zetConcept,
  zonderStaat,
  type MaileonConceptApi,
} from "./concept";
import { MaileonFout } from "./rapport";

const HTML = "<!DOCTYPE html><html><head></head><body><p>Hoi</p></body></html>";

/* ---------- Invoer ---------- */

test("conceptNaam zet de DMID erachter, maar niet dubbel", () => {
  assert.equal(conceptNaam("2026.11.27 PSV Kaartverkoop - Bezoekersinfo", "DMID26-22619"), "2026.11.27 PSV Kaartverkoop - Bezoekersinfo - DMID26-22619");
  assert.equal(conceptNaam("Bezoekersinfo - dmid26-22619", "DMID26-22619"), "Bezoekersinfo - dmid26-22619");
  assert.equal(conceptNaam("  Twee   spaties ", ""), "Twee spaties");
  assert.equal(conceptNaam("", "DMID26-1"), "DMID26-1");
});

test("zonderStaat haalt de opgeslagen staat van de Mail Builder weg", () => {
  const metStaat = `${HTML}\n<!-- mailbuilder-state:{"dmid":"DMID26-1","x":"--\\u003E"} -->`;
  assert.equal(zonderStaat(metStaat), HTML);
  assert.equal(zonderStaat(HTML), HTML);
});

test("controleerInvoer: geldige invoer", () => {
  const uit = controleerInvoer({
    html: `${HTML}\n<!-- mailbuilder-state:{} -->`,
    naam: "2026.11.27 PSV Kaartverkoop - Bezoekersinfo",
    dmid: "DMID26-22619",
    onderwerp: "🎟️ Belangrijke ticketinformatie",
    previewTekst: "Lees dit goed door",
  });
  assert.ok(!("fout" in uit));
  assert.equal(uit.html, HTML);
  assert.equal(uit.naam, "2026.11.27 PSV Kaartverkoop - Bezoekersinfo - DMID26-22619");
  assert.equal(uit.nieuw, false);
});

test("controleerInvoer: weigert wat Maileon niet accepteert", () => {
  const basis = { html: HTML, naam: "Naam van de mail", onderwerp: "Onderwerp" };
  const fout = (extra: Record<string, unknown>) => {
    const uit = controleerInvoer({ ...basis, ...extra });
    return "fout" in uit ? uit.fout : null;
  };
  assert.equal(fout({}), null);
  assert.match(fout({ html: "" })!, /HTML/);
  assert.match(fout({ html: "<p>los</p>" })!, /<html>/);
  assert.match(fout({ onderwerp: "  " })!, /onderwerp/);
  assert.match(fout({ onderwerp: "Regel\neen" })!, /regeleinde/);
  // Langer dan de 64 uit de documentatie mag (bestaande namen zijn langer); Maileon beslist.
  assert.equal(fout({ naam: "2026.05.03 PSV Vrouwen - Kampioenschap - Mail personeel - DMID26-11566" }), null);
  assert.match(fout({ naam: "x".repeat(256) })!, /korter/);
  assert.match(fout({ naam: "ab" })!, /3 tekens/);
  assert.match(fout({ dmid: "DMID 26" })!, /DMID/);
  assert.match(fout({ previewTekst: "x".repeat(301) })!, /300/);
  assert.equal(controleerInvoer(null).hasOwnProperty("fout"), true);
});

/* ---------- Antwoorden lezen ---------- */

test("leesId: getal als tekst of <id> in XML", () => {
  assert.equal(leesId("4317"), 4317);
  assert.equal(leesId(" 4317\n"), 4317);
  assert.equal(leesId("<?xml version='1.0'?><id>12</id>"), 12);
  assert.equal(leesId("geen"), null);
  assert.equal(leesId("0"), null);
});

test("leesStatus: XML of los woord", () => {
  assert.equal(leesStatus("<?xml version=\"1.0\"?><state>draft</state>"), "draft");
  assert.equal(leesStatus("<state><![CDATA[DONE]]></state>"), "done");
  assert.equal(leesStatus(" draft \n"), "draft");
});

test("leesVoorbeeld: JSON, CDATA, geëscapete XML en kale HTML", () => {
  assert.equal(leesVoorbeeld(JSON.stringify({ html: HTML })), HTML);
  assert.equal(leesVoorbeeld(`<?xml version="1.0"?><preview><html><![CDATA[${HTML}]]></html></preview>`), HTML);
  const gesplitst = `<preview><html><![CDATA[<html><body>a]]]]><![CDATA[>b</body></html>]]></html></preview>`;
  assert.equal(leesVoorbeeld(gesplitst), "<html><body>a]]>b</body></html>");
  const escaped = `<preview><html>&lt;html&gt;&lt;body&gt;R&amp;D&lt;/body&gt;&lt;/html&gt;</html></preview>`;
  assert.equal(leesVoorbeeld(escaped), "<html><body>R&D</body></html>");
  assert.equal(leesVoorbeeld(HTML), HTML);
  assert.equal(leesVoorbeeld(""), null);
  assert.equal(leesVoorbeeld("{\"html\":\"\"}"), null);
  assert.equal(leesVoorbeeld("<error>nee</error>"), null);
});

test("cdataXml splitst een ]]> in de tekst", () => {
  assert.equal(cdataXml("subject", "a]]>b"), `<?xml version="1.0" encoding="UTF-8"?><subject><![CDATA[a]]]]><![CDATA[>b]]></subject>`);
});

test("htmlHash negeert regeleinden en witruimte aan de randen", () => {
  assert.equal(htmlHash("<p>a</p>\r\n<p>b</p>\n"), htmlHash("<p>a</p>\n<p>b</p>"));
  assert.notEqual(htmlHash("<p>a</p>"), htmlHash("<p>b</p>"));
});

test("voorbeeldUitExport vult tokens in of haalt ze weg", () => {
  const exp =
    `<html><head><title>[[MAILING|SUBJECT|]]</title></head><body>` +
    `<span>[[PREVIEW-TEXT|]][[% unescape_html (repeat zwnjnbsp 180)]]</span>` +
    `<img src="[[MAILING|PROTOCOL|http]]://[[ACCOUNT|MAILING-DOMAIN]]/c/abc/media/kop.jpg">` +
    `<a href="[[LINK|https://www.psv.nl/?utm_source=maileon]]">Lees</a>` +
    `<a href="https://x/?id=[[CONTACT|ID]]">Af</a>` +
    // Zoals de feedbacklink in de footer: tokens binnen het linktoken.
    `<a href="[[LINK|https://psv.typeform.com/to/X?email=[% email]&forename=[% contact 'FIRSTNAME' '-onbekend-']&emailid=[MAILING|ID|]&score=1]]">Feedback</a>` +
    `<p>[Visual] blijft staan</p></body></html>`;
  const uit = voorbeeldUitExport(exp, "Tickets & info", "Kort");
  assert.match(uit, /<title>Tickets &amp; info<\/title>/);
  assert.match(uit, /<span>Kort<\/span>/);
  assert.match(uit, /src="https:\/\/images\.maileon-static\.com\/c\/abc\/media\/kop\.jpg"/);
  assert.match(uit, /href="https:\/\/www\.psv\.nl\/\?utm_source=maileon"/);
  assert.match(uit, /href="https:\/\/psv\.typeform\.com\/to\/X\?email=&forename=&emailid=&score=1"/);
  assert.match(uit, /\[Visual\] blijft staan/);
  assert.doesNotMatch(uit, /\[\[|\[%|\[MAILING/);
});

/* ---------- Client: wat er naar Maileon gaat ---------- */

interface Verzoek {
  methode: string;
  url: URL;
  headers: Record<string, string>;
  body?: string;
}

function nepFetch(antwoorden: { status?: number; body?: string }[]) {
  const verzoeken: Verzoek[] = [];
  const doeFetch = (async (input: URL | string, init?: RequestInit) => {
    verzoeken.push({
      methode: init?.method ?? "GET",
      url: new URL(String(input)),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const a = antwoorden.shift() ?? { status: 204 };
    const status = a.status ?? 200;
    return new Response(status === 204 ? null : (a.body ?? ""), { status });
  }) as typeof fetch;
  return { doeFetch, verzoeken };
}

test("client: aanmaken stuurt naam, onderwerp en type mee en leest het ID", async () => {
  const { doeFetch, verzoeken } = nepFetch([{ status: 201, body: "4317" }]);
  const api = maileonConceptApi({ apiKey: "sleutel" }, doeFetch);
  assert.equal(await api.maakAan("Naam - DMID26-1", "Onderwerp 🎟️"), 4317);
  const [v] = verzoeken;
  assert.equal(v.methode, "POST");
  assert.equal(v.url.pathname, "/1.0/mailings");
  assert.equal(v.url.searchParams.get("name"), "Naam - DMID26-1");
  assert.equal(v.url.searchParams.get("subject"), "Onderwerp 🎟️");
  assert.equal(v.url.searchParams.get("type"), "regular");
  assert.equal(v.headers.Authorization, `Basic ${Buffer.from("sleutel").toString("base64")}`);
});

test("client: HTML als text/html, zonder image grabbing of link tracking", async () => {
  const { doeFetch, verzoeken } = nepFetch([{ status: 204 }]);
  await maileonConceptApi({ apiKey: "k" }, doeFetch).zetHtml(12, HTML);
  const [v] = verzoeken;
  assert.equal(v.url.pathname, "/1.0/mailings/12/contents/html");
  assert.equal(v.url.searchParams.get("doImageGrabbing"), "false");
  assert.equal(v.url.searchParams.get("doLinkTracking"), "false");
  assert.match(v.headers["Content-Type"], /^text\/html/);
  assert.equal(v.body, HTML);
});

test("client: een fout van Maileon wordt een MaileonFout met status en melding", async () => {
  const { doeFetch } = nepFetch([{ status: 409, body: "<error><message>name already exists</message></error>" }]);
  await assert.rejects(
    maileonConceptApi({ apiKey: "k" }, doeFetch).maakAan("Dubbel", "Onderwerp"),
    (err: unknown) => err instanceof MaileonFout && err.status === 409 && err.message === "name already exists"
  );
});

test("client: het voorbeeld wordt zonder contact opgehaald", async () => {
  const { doeFetch, verzoeken } = nepFetch([{ status: 200, body: JSON.stringify({ html: HTML }) }]);
  assert.equal(await maileonConceptApi({ apiKey: "k" }, doeFetch).leesVoorbeeld(12), HTML);
  const [v] = verzoeken;
  assert.equal(v.url.pathname, "/1.0/mailings/12/preview");
  assert.equal(v.url.searchParams.get("format"), "html");
  assert.equal(v.url.searchParams.has("email"), false);
  assert.equal(v.url.searchParams.has("external_id"), false);
});

test("de client kan niet versturen, inplannen of een doelgroep kiezen", () => {
  const bron = readFileSync(new URL("./concept.ts", import.meta.url), "utf8");
  // Alleen de code, niet het commentaar dat uitlegt dat het niet kan.
  const code = bron.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const verboden of ["sendnow", "schedule", "targetgroupid", "checks/testsendout"]) {
    assert.ok(!code.toLowerCase().includes(verboden), `concept.ts noemt ${verboden}`);
  }
});

/* ---------- Concept zetten ---------- */

function nepApi(start: { status?: string; html?: string; bestaat?: boolean } = {}) {
  const log: string[] = [];
  let html = start.html ?? "";
  const api: MaileonConceptApi = {
    async maakAan(naam) { log.push(`maakAan ${naam}`); return 99; },
    async zetHtml(id, h) { log.push(`zetHtml ${id}`); html = `${h}<!-- door Maileon opgeslagen -->`; },
    async zetOnderwerp(id) { log.push(`zetOnderwerp ${id}`); },
    async zetPreviewTekst(id) { log.push(`zetPreviewTekst ${id}`); },
    async leesHtml() { return html; },
    async leesStatus(id) {
      if (start.bestaat === false) throw new MaileonFout("not found", 404);
      log.push(`leesStatus ${id}`);
      return start.status ?? "draft";
    },
    async leesVoorbeeld() { return null; },
  };
  return { api, log };
}

const INVOER = { naam: "Naam", onderwerp: "Onderwerp", previewTekst: "Kort", html: HTML };

test("zetConcept: nieuw concept, met hash van wat Maileon opsloeg", async () => {
  const { api, log } = nepApi();
  const uit = await zetConcept(api, INVOER);
  assert.deepEqual(log, ["maakAan Naam", "zetHtml 99", "zetPreviewTekst 99"]);
  assert.equal(uit.mailingId, 99);
  assert.equal(uit.nieuw, true);
  assert.equal(uit.vervangen, false);
  assert.equal(uit.hash, htmlHash(`${HTML}<!-- door Maileon opgeslagen -->`));
});

test("zetConcept: werkt een ongewijzigd concept bij", async () => {
  const opgeslagen = "<html>oud</html>";
  const { api, log } = nepApi({ html: opgeslagen });
  const uit = await zetConcept(api, INVOER, { mailingId: 12, hash: htmlHash(opgeslagen) });
  assert.deepEqual(log, ["leesStatus 12", "zetHtml 12", "zetOnderwerp 12", "zetPreviewTekst 12"]);
  assert.equal(uit.nieuw, false);
  assert.equal(uit.mailingId, 12);
});

test("zetConcept: overschrijft niets dat in Maileon is aangepast", async () => {
  const { api, log } = nepApi({ html: "<html>aangepast in Maileon</html>" });
  await assert.rejects(
    zetConcept(api, INVOER, { mailingId: 12, hash: htmlHash("<html>oud</html>") }),
    (err: unknown) => err instanceof ConceptFout && err.code === "aangepast" && err.status === 409
  );
  assert.deepEqual(log, ["leesStatus 12"]);
});

test("zetConcept: raakt een mailing die geen concept meer is niet aan", async () => {
  const { api, log } = nepApi({ status: "queued", html: "<html>oud</html>" });
  await assert.rejects(
    zetConcept(api, INVOER, { mailingId: 12, hash: htmlHash("<html>oud</html>") }),
    (err: unknown) => err instanceof ConceptFout && err.code === "geen-concept"
  );
  assert.deepEqual(log, ["leesStatus 12"]);
});

test("zetConcept: maakt een nieuw concept als het oude niet meer bestaat", async () => {
  const { api, log } = nepApi({ bestaat: false });
  const uit = await zetConcept(api, INVOER, { mailingId: 12, hash: "x" });
  assert.deepEqual(log, ["maakAan Naam", "zetHtml 99", "zetPreviewTekst 99"]);
  assert.equal(uit.vervangen, true);
  assert.equal(uit.nieuw, true);
});
