import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MetaConfigError,
  MetaInvoerFout,
  metaConfig,
  objectenParams,
  objectenTekst,
  rapportKolommen,
  rapportParams,
  rapportTekst,
  redact,
  type RapportInvoer,
} from "./rapport";

const basis: RapportInvoer = { niveau: "campaign", velden: ["spend", "inline_link_clicks"], periode: "last_7d" };
const account = { name: "PSV", currency: "EUR", timezone_name: "Europe/Amsterdam" };

test("config: token en account van Paid Ads, met act_-prefix en standaardversie", () => {
  assert.deepEqual(metaConfig({ META_ADS_ACCESS_TOKEN: "abc", META_ADS_ACCOUNT_ID: "123" }), {
    token: "abc",
    accountPath: "act_123",
    apiVersion: "v21.0",
  });
  assert.equal(metaConfig({ META_ADS_ACCESS_TOKEN: "abc", META_ADS_ACCOUNT_ID: "act_9", META_ADS_API_VERSION: "v23.0" }).apiVersion, "v23.0");
  assert.throws(() => metaConfig({ META_ADS_ACCESS_TOKEN: "abc" }), /META_ADS_ACCOUNT_ID/);
  assert.throws(() => metaConfig({ META_ADS_ACCESS_TOKEN: "a b", META_ADS_ACCOUNT_ID: "1" }), MetaConfigError);
});

test("rapport: niveau, naamvelden, periode, sortering en attributie zoals Ads Manager", () => {
  const p = rapportParams(basis);
  assert.equal(p.level, "campaign");
  assert.equal(p.fields, "campaign_name,spend,inline_link_clicks");
  assert.equal(p.date_preset, "last_7d");
  assert.equal(p.time_range, undefined);
  assert.equal(p.sort, '["spend_descending"]');
  assert.equal(p.limit, "25");
  assert.equal(p.use_unified_attribution_setting, "true");
});

test("rapport: eigen periode, per dag of maand, uitsplitsing en filters", () => {
  const p = rapportParams({
    ...basis,
    niveau: "ad",
    periode: undefined,
    van: "2026-11-01",
    tot: "2026-11-17",
    per: "maand",
    uitsplitsing: ["age", "gender"],
    filters: [
      { veld: "campaign.name", operator: "CONTAIN", waarde: "Seizoenkaart" },
      { veld: "campaign.id", operator: "IN", waarde: "1, 2,3" },
    ],
    sorteer_op: "inline_link_clicks",
    oplopend: true,
    limiet: 9999,
  });
  assert.equal(p.time_range, '{"since":"2026-11-01","until":"2026-11-17"}');
  assert.equal(p.time_increment, "monthly");
  assert.equal(p.breakdowns, "age,gender");
  assert.deepEqual(JSON.parse(p.filtering), [
    { field: "campaign.name", operator: "CONTAIN", value: "Seizoenkaart" },
    { field: "campaign.id", operator: "IN", value: ["1", "2", "3"] },
  ]);
  assert.equal(p.sort, '["inline_link_clicks_ascending"]');
  assert.equal(p.limit, "250");
  assert.equal(p.fields, "campaign_name,adset_name,ad_name,ad_id,spend,inline_link_clicks");
  assert.equal(rapportParams({ ...basis, per: "dag" }).time_increment, "1");
});

test("rapport: periode moet kloppen", () => {
  assert.throws(() => rapportParams({ ...basis, periode: undefined }), MetaInvoerFout);
  assert.throws(() => rapportParams({ ...basis, van: "2026-11-01", tot: "2026-11-02" }), /niet allebei/);
  assert.throws(() => rapportParams({ ...basis, periode: undefined, van: "2026-11-01" }), /zowel van als tot/);
});

test("tekst: kolommen, acties per soort, valuta en meer rijen", () => {
  const invoer: RapportInvoer = { ...basis, velden: ["spend", "actions"], per: "dag", actie_types: ["link_click", "purchase"] };
  assert.deepEqual(rapportKolommen(invoer), ["date_start", "campaign_name", "spend", "actions"]);
  const tekst = rapportTekst(
    {
      data: [
        {
          date_start: "2026-11-17",
          campaign_name: "Seizoenkaart",
          spend: "123.456789",
          actions: [
            { action_type: "link_click", value: "40" },
            { action_type: "post_engagement", value: "900" },
            { action_type: "purchase", value: "3" },
          ],
        },
      ],
      paging: { next: "https://graph.facebook.com/next" },
    },
    invoer,
    account,
    "act_123"
  );
  const regels = tekst.split("\n");
  assert.equal(regels[0], "META ADS · PSV (act_123), valuta EUR, tijdzone Europe/Amsterdam · niveau campaign · last_7d · per dag");
  assert.ok(regels.includes("date_start | campaign_name | spend | actions"));
  assert.ok(regels.includes("2026-11-17 | Seizoenkaart | 123.4568 | link_click=40; purchase=3"));
  assert.match(tekst, /Er zijn meer rijen/);
  assert.match(rapportTekst({ data: [] }, basis, account, "act_123"), /Geen rijen/);
});

test("campagnes: alleen actief, zoeken op naam en budgetten in euro's", () => {
  const p = objectenParams({ niveau: "campaign", alleen_actief: true, zoek: " Seizoen " });
  assert.equal(p.effective_status, '["ACTIVE"]');
  assert.deepEqual(JSON.parse(p.filtering), [{ field: "name", operator: "CONTAIN", value: "Seizoen" }]);
  assert.equal(p.limit, "50");
  assert.equal(objectenParams({ niveau: "ad" }).effective_status, undefined);

  const tekst = objectenTekst(
    { data: [{ id: "1", name: "Seizoenkaart", effective_status: "ACTIVE", objective: "OUTCOME_SALES", daily_budget: "2500" }] },
    { niveau: "campaign", alleen_actief: true },
    account,
    "act_123"
  );
  assert.match(tekst, /campagnes \(alleen actief\)/);
  assert.match(tekst, /1 \| Seizoenkaart \| ACTIVE \| OUTCOME_SALES \| 25\.00 EUR \|/);

  const sets = objectenTekst({ data: [{ id: "2", name: "Set", campaign: { name: "Seizoenkaart", id: "1" } }] }, { niveau: "adset" }, account, "act_1");
  assert.match(sets, /2 \| Set \|  \| Seizoenkaart/);
});

test("het token komt nooit in een melding", () => {
  assert.equal(redact("fout met token abc123 erin", "abc123"), "fout met token [token] erin");
});
