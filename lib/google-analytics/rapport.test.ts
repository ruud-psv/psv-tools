import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GaInvoerFout,
  gaFoutTekst,
  rapportTekst,
  rapportVerzoek,
  realtimeTekst,
  realtimeVerzoek,
  veldenTekst,
  vindSite,
  type GaSite,
  type RapportInvoer,
} from "./rapport";

const psv: GaSite = { key: "psv", label: "psv.nl", propertyId: "111" };

const basis: RapportInvoer = {
  site: "psv",
  metrics: ["screenPageViews"],
  dimensies: ["pagePath", "pageTitle"],
  van: "yesterday",
  tot: "yesterday",
};

test("verzoek: property, periode, standaard top 10 op de eerste metric aflopend, met totaal", () => {
  const v = rapportVerzoek(basis, psv);
  assert.equal(v.property, "properties/111");
  assert.deepEqual(v.dateRanges, [{ startDate: "yesterday", endDate: "yesterday", name: "periode" }]);
  assert.deepEqual(v.metrics, [{ name: "screenPageViews" }]);
  assert.deepEqual(v.dimensions, [{ name: "pagePath" }, { name: "pageTitle" }]);
  assert.deepEqual(v.orderBys, [{ metric: { metricName: "screenPageViews" }, desc: true }]);
  assert.equal(v.limit, 10);
  assert.equal(v.dimensionFilter, undefined);
  assert.equal(v.metricAggregations?.length, 1);
});

test("verzoek: sorteren op een dimensie, oplopend, en de limiet binnen de grenzen", () => {
  const v = rapportVerzoek({ ...basis, dimensies: ["date"], sorteer_op: "date", oplopend: true, limiet: 1000 }, psv);
  assert.deepEqual(v.orderBys, [{ dimension: { dimensionName: "date" }, desc: false }]);
  assert.equal(v.limit, 250);
  assert.equal(rapportVerzoek({ ...basis, limiet: 0 }, psv).limit, 10);
});

test("verzoek: filters en een vergelijkingsperiode", () => {
  const een = rapportVerzoek({ ...basis, filters: [{ dimensie: "deviceCategory", type: "gelijk", waarde: "mobile" }] }, psv);
  assert.deepEqual(een.dimensionFilter, {
    filter: { fieldName: "deviceCategory", stringFilter: { matchType: "EXACT", value: "mobile", caseSensitive: false } },
  });

  const twee = rapportVerzoek(
    {
      ...basis,
      filters: [
        { dimensie: "pagePath", type: "begint_met", waarde: "/nieuws" },
        { dimensie: "country", type: "gelijk", waarde: "Netherlands", uitsluiten: true },
      ],
    },
    psv
  );
  const groep = twee.dimensionFilter?.andGroup?.expressions ?? [];
  assert.equal(groep.length, 2);
  assert.equal(groep[0].filter?.stringFilter?.matchType, "BEGINS_WITH");
  assert.equal(groep[1].notExpression?.filter?.fieldName, "country");

  const vergelijk = rapportVerzoek({ ...basis, vergelijk_van: "14daysAgo", vergelijk_tot: "8daysAgo" }, psv);
  assert.deepEqual(vergelijk.dateRanges?.[1], { startDate: "14daysAgo", endDate: "8daysAgo", name: "vergelijking" });
  assert.throws(() => rapportVerzoek({ ...basis, vergelijk_van: "14daysAgo" }, psv), GaInvoerFout);
});

test("realtime: geen periode, wel limiet en sortering", () => {
  const v = realtimeVerzoek({ site: "psv", metrics: ["activeUsers"], dimensies: ["unifiedScreenName"] }, psv);
  assert.equal(v.property, "properties/111");
  assert.equal("dateRanges" in v, false);
  assert.equal(v.limit, 10);
});

test("onbekende site geeft een melding met de keuzes", () => {
  assert.throws(() => vindSite([psv], "anders"), /Kies uit: psv/);
});

test("tekst: kop, tabel, totaal, eenheden en meldingen", () => {
  const tekst = rapportTekst(
    {
      dimensionHeaders: [{ name: "pagePath" }, { name: "pageTitle" }],
      metricHeaders: [{ name: "screenPageViews", type: "TYPE_INTEGER" }, { name: "averageSessionDuration", type: "TYPE_SECONDS" }],
      rows: [
        { dimensionValues: [{ value: "/" }, { value: "Home" }], metricValues: [{ value: "1200" }, { value: "65.123456789" }] },
        { dimensionValues: [{ value: "/nieuws" }, { value: "Nieuws" }], metricValues: [{ value: "800" }, { value: "40" }] },
      ],
      totals: [{ dimensionValues: [{ value: "RESERVED_TOTAL" }, { value: "RESERVED_TOTAL" }], metricValues: [{ value: "5000" }, { value: "50.5" }] }],
      rowCount: 312,
      metadata: { subjectToThresholding: true },
    },
    basis,
    psv
  );
  const regels = tekst.split("\n");
  assert.equal(regels[0], "GOOGLE ANALYTICS · psv.nl (property 111) · yesterday tot en met yesterday");
  assert.equal(regels[1], "2 van 312 rijen, gesorteerd op screenPageViews (aflopend).");
  assert.match(tekst, /drempelwaarden/);
  assert.ok(regels.includes("pagePath | pageTitle | screenPageViews | averageSessionDuration (seconden)"));
  assert.ok(regels.includes("/ | Home | 1200 | 65.1235"));
  assert.ok(regels.includes("TOTAAL |  | 5000 | 50.5"));
  assert.match(tekst, /Er zijn meer rijen \(312\)/);
});

test("tekst: geen rijen, en zonder dimensies geen aparte totaalregel", () => {
  assert.match(rapportTekst({ rows: [], rowCount: 0 }, basis, psv), /Geen rijen voor deze vraag en periode\./);
  const zonder = rapportTekst(
    {
      metricHeaders: [{ name: "sessions" }],
      rows: [{ metricValues: [{ value: "42" }] }],
      totals: [{ metricValues: [{ value: "42" }] }],
      rowCount: 1,
    },
    { ...basis, metrics: ["sessions"], dimensies: [] },
    psv
  );
  assert.ok(!zonder.includes("TOTAAL"));
  assert.ok(zonder.endsWith("sessions\n42"));
  assert.match(realtimeTekst({ rows: [] }, psv), /Geen activiteit/);
});

test("velden: zoeken in naam en beschrijving, of alleen de eigen velden", () => {
  const metadata = {
    dimensions: [
      { apiName: "pagePath", uiName: "Page path", description: "The web pages visited." },
      { apiName: "customEvent:speler", uiName: "Speler", customDefinition: true },
    ],
    metrics: [{ apiName: "purchaseRevenue", uiName: "Purchase revenue", description: "Revenue from purchases." }],
  };
  const zoek = veldenTekst(metadata, psv, "revenue");
  assert.match(zoek, /VELDEN VAN psv.nl MET "revenue" \(1\)/);
  assert.match(zoek, /metric purchaseRevenue: Purchase revenue/);
  const eigen = veldenTekst(metadata, psv);
  assert.match(eigen, /EIGEN VELDEN VAN psv.nl \(1\)/);
  assert.match(eigen, /dimensie customEvent:speler: Speler/);
});

test("foutmelding van de Data API zonder gRPC-code", () => {
  assert.equal(gaFoutTekst(new Error("3 INVALID_ARGUMENT: Field foo is not a valid metric.")), "Field foo is not a valid metric.");
  assert.equal(gaFoutTekst("los"), "los");
});

test("geen toegang: welk account welke rol nodig heeft, of welke API aan moet", async () => {
  const { geenToegangTekst } = await import("./rapport");
  const site = { ...psv, envVar: "GA_PROPERTY_PSV" };
  const geen = Object.assign(new Error("7 PERMISSION_DENIED: User does not have sufficient permissions for this property."), { code: 7 });
  const tekst = geenToegangTekst(geen, site, "sa@x.iam.gserviceaccount.com")!;
  assert.match(tekst, /^Google Analytics geeft geen toegang tot psv\.nl \(property 111\): User does not have sufficient permissions/);
  assert.match(tekst, /geef het service-account sa@x\.iam\.gserviceaccount\.com de rol Lezer op property 111/);
  assert.match(tekst, /pas dan GA_PROPERTY_PSV in Vercel aan/);

  const uit = Object.assign(new Error("7 PERMISSION_DENIED: Google Analytics Data API has not been used in project 123 before or it is disabled."), { code: 7 });
  assert.match(geenToegangTekst(uit, site, null)!, /zet de Google Analytics Data API aan/);
  assert.equal(geenToegangTekst(new Error("3 INVALID_ARGUMENT: kapot"), site, null), null);
});
