import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MaileonInvoerFout,
  controleerPeriode,
  leesMailings,
  leesResultaten,
  mailingsTekst,
  maileonConfig,
  resultatenTekst,
  verstuurd,
  type Mailing,
} from "./rapport";

const mailingXml = (id: number, naam: string, status: string, verzonden: string) =>
  `<mailing><id>${id}</id><fields><field><name>name</name><value><![CDATA[${naam}]]></value></field><field><name>state</name><value>${status}</value></field><field><name>type</name><value>regular</value></field><field><name>scheduleTime</name><value>${verzonden}</value></field></fields></mailing>`;

const mailings: Mailing[] = leesMailings(
  `<?xml version="1.0"?><mailings>${[
    mailingXml(1, "2026.10.02 PSV Fanstore - Coen Dillen tenue - Nieuwsbrief - DMID26-17577", "done", "2026-10-02 10:00:00"),
    mailingXml(2, "2026.10.20 PSV Ticketing - Wachtlijst SCC - DMID26-11224", "archived", "2026-10-20 09:30:00"),
    mailingXml(3, "2026.11.25 PSV Fanstore - Kerst &amp; cadeaus - DMID26-19000", "scheduled", "2026-11-25 08:00:00"),
    mailingXml(4, "2026.09.01 Oud", "done", "2026-09-01 08:00:00"),
  ].join("")}</mailings>`
);

test("config: de sleutel van DM Performance", () => {
  assert.deepEqual(maileonConfig({ MAILEON_API_KEY: " sleutel " }), { apiKey: "sleutel" });
  assert.throws(() => maileonConfig({}), /MAILEON_API_KEY/);
});

test("XML: mailings met CDATA en entiteiten, en resultaten", () => {
  assert.equal(mailings.length, 4);
  assert.deepEqual(mailings[0], {
    id: 1,
    naam: "2026.10.02 PSV Fanstore - Coen Dillen tenue - Nieuwsbrief - DMID26-17577",
    type: "regular",
    status: "done",
    verzonden: "2026-10-02 10:00:00",
  });
  assert.equal(mailings[2].naam, "2026.11.25 PSV Fanstore - Kerst & cadeaus - DMID26-19000");
  const resultaten = leesResultaten(
    "<mailing_summaries><mailing_summary><mailing_id>1</mailing_id><recipients>20000</recipients><opens>12000</opens><opens_unique>9000</opens_unique><clicks>2400</clicks><clicks_unique>1800</clicks_unique><bounces>100</bounces><unsubscriptions>20</unsubscriptions></mailing_summary></mailing_summaries>"
  );
  assert.deepEqual(resultaten[0], { mailingId: 1, ontvangers: 20000, geopend: 12000, uniekGeopend: 9000, geklikt: 2400, uniekGeklikt: 1800, bounces: 100, afmeldingen: 20 });
});

test("verstuurd: alleen done of archived, binnen de periode, nieuwste eerst, zoeken zonder spaties", () => {
  const periode = { van: "2026-10-01", tot: "2026-11-30" };
  assert.deepEqual(verstuurd(mailings, periode).map((m) => m.id), [2, 1]);
  assert.deepEqual(verstuurd(mailings, { ...periode, zoek: "Coen Dillen" }).map((m) => m.id), [1]);
  assert.deepEqual(verstuurd(mailings, { ...periode, zoek: "coendillen" }).map((m) => m.id), [1]);
  assert.deepEqual(verstuurd(mailings, { ...periode, zoek: "17577" }).map((m) => m.id), [1]);
  assert.deepEqual(verstuurd(mailings, { ...periode, mailing_ids: [2] }).map((m) => m.id), [2]);
  assert.deepEqual(verstuurd(mailings, { van: "2026-10-03", tot: "2026-10-19" }), []);
});

test("periode moet kloppen", () => {
  assert.throws(() => controleerPeriode({ van: "2026-11-01", tot: "2026-10-01" }), MaileonInvoerFout);
  assert.throws(() => controleerPeriode({ van: "1 oktober", tot: "2026-10-01" }), /JJJJ-MM-DD/);
  controleerPeriode({ van: "2026-10-01", tot: "2026-10-01" });
});

test("tekst: mailings en resultaten met percentages en een totaal over alles", () => {
  const periode = { van: "2026-10-01", tot: "2026-11-30" };
  const lijst = mailingsTekst(verstuurd(mailings, periode), periode);
  assert.match(lijst, /^MAILEON · mailings verstuurd van 2026-10-01 tot en met 2026-11-30 · 2 gevonden/);
  assert.match(lijst, /2026-10-20 09:30:00 \| 2 \| 2026\.10\.20 PSV Ticketing - Wachtlijst SCC - DMID26-11224 \| regular/);
  assert.match(mailingsTekst([], { ...periode, zoek: "x" }), /Geen verstuurde mailings gevonden/);

  const gevonden = verstuurd(mailings, periode);
  const tekst = resultatenTekst(
    gevonden,
    [
      { mailingId: 1, ontvangers: 20000, geopend: 0, uniekGeopend: 9000, geklikt: 0, uniekGeklikt: 1800, bounces: 100, afmeldingen: 20 },
      { mailingId: 2, ontvangers: 5000, geopend: 0, uniekGeopend: 1000, geklikt: 0, uniekGeklikt: 200, bounces: 0, afmeldingen: 5 },
    ],
    { ...periode, limiet: 1 }
  );
  assert.ok(tekst.includes("2026-10-20 09:30:00 | 2 | 2026.10.20 PSV Ticketing - Wachtlijst SCC - DMID26-11224 | 5000 | 1000 | 20.0 | 200 | 4.0 | 20.0 | 0 | 5"));
  assert.ok(tekst.includes("TOTAAL (2 mailings) |  |  | 25000 | 10000 | 40.0 | 2000 | 8.0 | 20.0 | 100 | 25"));
  assert.match(tekst, /De tabel toont 1 van 2 mailings; het totaal telt ze allemaal/);

  const zonder = resultatenTekst(gevonden, [], periode);
  assert.match(zonder, /2 mailings hebben \(nog\) geen resultaten/);
  assert.match(zonder, /geen resultaten/);
});
