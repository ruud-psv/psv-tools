import { test } from "node:test";
import assert from "node:assert/strict";

import { leegCache, queryCache, ttlVoor, KORT_MS } from "./cache";
import { capabilitiesVoor, leesCapabilities, onderdeel, vergeetCapabilities } from "./capabilities";
import { JwFout, type AnalyticsQuery, type Rij } from "./client";
import { vergeetMedia } from "./media";
import { media, nepApi, nepCtx, volleCaps } from "./nep";
import { kiesPeriode } from "./periode";
import { content, kpis, live, opVolgorde, overzicht, publiek, vraag, zoekMedia } from "./rapport";
import { archiefRijen, maakSnapshot, snapshotRun, teDoen, type DagSnapshot } from "./snapshot";
import { geheugenOpslag, paden } from "./store";

const NU = new Date("2026-11-23T12:00:00Z");
const k30 = () => kiesPeriode({ preset: "30d" }, NU);

const VIDEOS = [
  media("aaaaaaa1", "Persconferentie Peter Bosz", ["type:persconferentie", "team:psv1"]),
  media("aaaaaaa2", "Samenvatting PSV - Ajax", ["type:samenvatting", "team:psv1"]),
  media("aaaaaaa3", "Training in beeld", []),
  media("aaaaaaa4", "Kort clipje", ["type:interview"], { duur: 20 }),
];

function perMedia(): Rij[] {
  return [
    { media_id: "aaaaaaa1", plays: 100, time_watched: 36_000, unique_viewers: 80, completes: 40, "25_percent_completes": 90, "50_percent_completes": 70, "75_percent_completes": 50 },
    { media_id: "aaaaaaa2", plays: 300, time_watched: 54_000, unique_viewers: 250, completes: 200, "25_percent_completes": 280, "50_percent_completes": 250, "75_percent_completes": 220 },
    { media_id: "aaaaaaa3", plays: 50, time_watched: 18_000, unique_viewers: 45, completes: 10, "25_percent_completes": 40, "50_percent_completes": 30, "75_percent_completes": 20 },
    { media_id: "aaaaaaa4", plays: 10, time_watched: 200, unique_viewers: 10, completes: 9, "25_percent_completes": 0, "50_percent_completes": 0, "75_percent_completes": 0 },
    { media_id: "weg00000", plays: 5, time_watched: 100, unique_viewers: 5, completes: 1 },
  ];
}

test("unieke kijkers: één query zonder dimensie over de hele periode, nooit dagwaarden optellen", async () => {
  vergeetMedia();
  const { api, vragen } = nepApi((q) =>
    q.dimensions?.length ? [] : [{ plays: 1000, time_watched: 720_000, unique_viewers: 400, completes: 500 }]
  );
  const k = await kpis(nepCtx(api), k30().periode);
  assert.equal(vragen.length, 1);
  assert.deepEqual(vragen[0].dimensions, []);
  assert.equal(k.unieke_kijkers, 400);
  assert.equal(k.kijktijd_uren, 200);
  assert.equal(k.kijktijd_per_kijker_min, 30);
  assert.equal(k.complete_rate_pct, 50);
});

test("zonder totaal zonder dimensie: unieke kijkers null in plaats van een som van dagen", async () => {
  const { api } = nepApi(() => [
    { eastern_date: "2026-11-01", plays: 10, time_watched: 3600, unique_viewers: 8, completes: 5 },
    { eastern_date: "2026-11-02", plays: 20, time_watched: 3600, unique_viewers: 9, completes: 5 },
  ]);
  const k = await kpis(nepCtx(api, volleCaps({ totalsWithoutDimension: false })), k30().periode);
  assert.equal(k.plays, 30);
  assert.equal(k.unieke_kijkers, null);
  assert.equal(k.kijktijd_per_kijker_min, null);
});

test("periode langer dan de API toelaat: in stukken, additief opgeteld, unieke kijkers weggelaten", async () => {
  const { api, vragen } = nepApi((q) => [{ plays: 10, time_watched: 100, ...(q.metrics.some((m) => m.field === "unique_viewers") ? { unique_viewers: 7 } : {}) }]);
  const rijen = await vraag(nepCtx(api, volleCaps({ maxRangeDays: 31 })), { van: "2026-09-01", tot: "2026-11-22" }, [], ["plays", "time_watched", "unique_viewers"]);
  assert.equal(vragen.length, 3);
  assert.ok(vragen.every((q) => !q.metrics.some((m) => m.field === "unique_viewers")));
  assert.deepEqual(rijen, [{ plays: 30, time_watched: 300, unique_viewers: null }]);
});

test("capability-fallback: metrics die niet werken gaan niet mee, onderdelen geven een uitleg", async () => {
  const cap = volleCaps({ metrics: { plays: "sum", time_watched: "sum", completes: "sum", unique_viewers: "sum" } });
  assert.equal(onderdeel(cap, "afhaakcurve").ok, false);
  assert.match((onderdeel(cap, "afhaakcurve") as { uitleg: string }).uitleg, /Enterprise/);
  const zonder = volleCaps({ dimensions: { eastern_date: true }, live: { filter: false, hasData: false } });
  for (const o of ["content", "live", "platform", "device", "land"] as const) assert.equal(onderdeel(zonder, o).ok, false, o);
  assert.equal(onderdeel(null, "content").ok, false);

  const { api, vragen } = nepApi(() => perMedia());
  vergeetMedia();
  const c = await content(nepCtx(api, cap), k30());
  assert.ok(vragen[0].metrics.every((m) => !m.field.includes("percent")));
  assert.equal((c as { top: { afhaakcurve: unknown }[] }).top[0].afhaakcurve, null);

  const p = (await publiek(nepCtx(nepApi(() => []).api, zonder), k30())) as Record<string, unknown>;
  assert.equal(p.platform, null);
  assert.equal(p.land, null);
  assert.equal((p.niet_beschikbaar as string[]).length, 5);
  assert.equal(p.browser, null);
  assert.equal(p.videoduur, null);
  const l = (await live(nepCtx(nepApi(() => []).api, zonder), k30())) as { beschikbaar: boolean; uitleg: string };
  assert.equal(l.beschikbaar, false);
  assert.match(l.uitleg, /Enterprise/);
});

test("content: titels in plaats van id's, groepen per type en team, aandeel ongecategoriseerd", async () => {
  vergeetMedia();
  const { api } = nepApi(() => perMedia(), VIDEOS);
  const c = (await content(nepCtx(api), k30(), { limiet: 3 })) as Awaited<ReturnType<typeof content>> & Record<string, never>;
  const top = (c as unknown as { top: { titel: string; afhaakcurve: { p25: number } | null; media_id: string }[] }).top;
  assert.deepEqual(top.map((v) => v.titel), ["Samenvatting PSV - Ajax", "Persconferentie Peter Bosz", "Training in beeld"]);
  assert.equal(top[1].afhaakcurve?.p25, 90);
  const alles = (await content(nepCtx(api), k30(), { limiet: 10 })) as unknown as {
    top: { titel: string; afhaakcurve: unknown; media_id: string }[];
    per_type: { groep: string; kijktijd_uren: number }[];
    ongecategoriseerd: { videos: number; aandeel_kijktijd_pct: number };
  };
  assert.equal(alles.top.find((v) => v.media_id === "aaaaaaa4")?.afhaakcurve, null, "korter dan 30 s: geen curve");
  assert.equal(alles.top.find((v) => v.media_id === "weg00000")?.titel, "Verwijderde video (weg00000)");
  assert.deepEqual(alles.per_type[0], { ...alles.per_type[0], groep: "Samenvatting", kijktijd_uren: 15 });
  assert.equal(alles.ongecategoriseerd.videos, 2);
  // (18.000 + 100) van 108.300 seconden.
  assert.equal(alles.ongecategoriseerd.aandeel_kijktijd_pct, 16.7);
  const gefilterd = (await content(nepCtx(api), k30(), { filter: { type: "persconferentie" } })) as unknown as { top: unknown[] };
  assert.equal(gefilterd.top.length, 1);
});

test("overzicht: delta ten opzichte van de vorige periode en notes over tijdzone en unieke kijkers", async () => {
  const { api } = nepApi((q) => {
    if (q.dimensions?.length) return [{ eastern_date: q.start_date, plays: 1, time_watched: 3600, unique_viewers: 1, completes: 0 }];
    return [{ plays: q.start_date === "2026-10-24" ? 200 : 100, time_watched: 36_000, unique_viewers: 50, completes: 20 }];
  });
  const o = await overzicht(nepCtx(api), k30());
  assert.equal(o.delta_pct.plays, 100);
  assert.equal(o.data_through, "2026-11-22");
  assert.equal(o.periode.start_date, "2026-10-24");
  assert.ok(o.notes.some((n) => n.includes("US Eastern")));
  assert.ok(o.notes.some((n) => n.includes("niet optelbaar")));
});

test("live: nakijk-plays = on-demand plays van dezelfde video plus een opname met dezelfde titel", async () => {
  vergeetMedia();
  const lijst = [
    media("live0001", "Oefenwedstrijd PSV - Genk", ["type:oefenwedstrijd"], { gepubliceerd: "2026-11-10T18:00:00Z" }),
    media("opname01", "Oefenwedstrijd PSV - Genk", ["type:oefenwedstrijd"], { gepubliceerd: "2026-11-11T09:00:00Z" }),
  ];
  const { api } = nepApi((q: AnalyticsQuery) => {
    const isLive = q.filter?.some((f) => f.field === "player_playback_mode");
    if (isLive && q.dimensions?.length === 1) return [{ media_id: "live0001", plays: 500, unique_viewers: 400, time_watched: 1_800_000 }];
    if (isLive) return [{ media_id: "live0001", eastern_date: "2026-11-10", plays: 500, time_watched: 1_800_000 }];
    return [
      { media_id: "live0001", eastern_date: "2026-11-10", plays: 540, time_watched: 1_836_000 },
      { media_id: "live0001", eastern_date: "2026-11-12", plays: 20, time_watched: 7_200 },
      { media_id: "opname01", eastern_date: "2026-11-11", plays: 100, time_watched: 36_000 },
      { media_id: "opname01", eastern_date: "2026-11-30", plays: 999, time_watched: 1 },
    ];
  }, lijst);
  const l = (await live(nepCtx(api), k30())) as unknown as { uitzendingen: { titel: string; datum: string; live: { plays: number }; nakijk: { plays: number; opnames: string[] } }[]; per_type: { type: string }[] };
  const u = l.uitzendingen[0];
  assert.equal(u.titel, "Oefenwedstrijd PSV - Genk");
  assert.equal(u.datum, "2026-11-10");
  assert.equal(u.live.plays, 500);
  assert.equal(u.nakijk.plays, 40 + 20 + 100);
  assert.deepEqual(u.nakijk.opnames, ["Oefenwedstrijd PSV - Genk"]);
  assert.equal(l.per_type[0].type, "Oefenwedstrijd");
});

test("publiek: top 10 landen plus buitenland totaal", async () => {
  const landen = ["NL", "BE", "DE", "US", "GB", "FR", "ES", "IT", "MX", "KR", "JP", "BR"];
  const { api } = nepApi((q) => (q.dimensions?.[0] === "country_code" ? landen.map((c, i) => ({ country_code: c, plays: c === "NL" ? 1000 : 100 - i, time_watched: 3600 })) : []));
  const p = (await publiek(nepCtx(api), k30())) as { land: { top10: { label: string }[]; buitenland_totaal: { landen: number; plays: number }; nederland_pct: number } };
  assert.equal(p.land.top10.length, 10);
  assert.equal(p.land.top10[0].label, "Nederland");
  assert.equal(p.land.buitenland_totaal.landen, 11);
  assert.equal(p.land.buitenland_totaal.plays, 99 + 98 + 97 + 96 + 95 + 94 + 93 + 92 + 91 + 90 + 89);
});

test("zoeken op titel, tag en publicatiedatum", async () => {
  vergeetMedia();
  const { api } = nepApi(() => [], [
    media("aaaaaaa1", "Persconferentie Peter Bosz", ["type:persconferentie"], { gepubliceerd: "2026-11-20T10:00:00Z" }),
    media("aaaaaaa2", "Persconferentie vrouwen", ["type:persconferentie", "team:vrouwen"], { gepubliceerd: "2026-11-13T10:00:00Z" }),
    media("aaaaaaa3", "Samenvatting", ["type:samenvatting"], { gepubliceerd: "2026-11-21T10:00:00Z" }),
  ]);
  const z = (await zoekMedia(nepCtx(api), { zoek: "persconferentie", gepubliceerd_van: "2026-11-20", gepubliceerd_tot: "2026-11-20" })) as { videos: { titel: string }[] };
  assert.deepEqual(z.videos.map((v) => v.titel), ["Persconferentie Peter Bosz"]);
  const t = (await zoekMedia(nepCtx(api), { tag: "team: vrouwen" })) as { videos: { media_id: string; team: string }[] };
  assert.equal(t.videos[0].team, "PSV Vrouwen");
});

test("cache: vandaag/gisteren kort en alleen in het geheugen, afgesloten dagen lang en in Blob", async () => {
  leegCache();
  assert.deepEqual(ttlVoor("2026-11-22", NU), { ms: KORT_MS, duurzaam: false });
  assert.equal(ttlVoor("2026-11-21", NU).duurzaam, true);
  const opslag = geheugenOpslag();
  const cache = queryCache(opslag, () => NU);
  let geladen = 0;
  const laad = async () => {
    geladen++;
    return [{ plays: 1 }];
  };
  await cache.haal("a", "2026-11-21", laad);
  await cache.haal("a", "2026-11-21", laad);
  assert.equal(geladen, 1);
  assert.ok(opslag.inhoud.has(paden.cache("a")));
  await cache.haal("b", "2026-11-22", laad);
  assert.ok(!opslag.inhoud.has(paden.cache("b")));
  // Een nieuwe instantie (leeg geheugen) leest een afgesloten periode uit Blob.
  leegCache();
  await cache.haal("a", "2026-11-21", laad);
  assert.equal(geladen, 2);
});

test("capabilities: zonder opgeslagen uitkomst draait de probe en wordt de uitkomst bewaard", async () => {
  vergeetCapabilities();
  const opslag = geheugenOpslag();
  let verzoeken = 0;
  const cap = await capabilitiesVoor({ id: "abcd1234", label: "PSV Play" }, [{ id: "abcd1234", label: "PSV Play" }], async (v) => {
    verzoeken++;
    return v.method === "GET" ? { status: 200, body: { media: [] } } : { status: 400, body: { errors: [{ code: "invalid" }] } };
  }, opslag);
  assert.ok(verzoeken > 10);
  assert.equal(cap.metrics.plays, null);
  assert.equal(onderdeel(cap, "content").ok, false);
  vergeetCapabilities();
  const gelezen = await leesCapabilities(opslag);
  assert.ok(gelezen.probedAt);
  assert.ok(gelezen.sites.abcd1234);
});

test("snapshot: welke dagen, archief-rijen zonder unieke kijkers op te tellen, en een run", async () => {
  assert.deepEqual(teDoen(new Set(["2026-11-20", "2026-11-19", "2026-11-18", "2026-11-17", "2026-11-16"]), "2026-11-22"), ["2026-11-22", "2026-11-21"]);
  assert.deepEqual(teDoen(new Set(["2026-11-21"]), "2026-11-22", "2026-11-19"), ["2026-11-22", "2026-11-20", "2026-11-19"]);

  const dag = (datum: string, uniek: number): DagSnapshot => ({
    versie: 1, site: "abcd1234", datum, at: "", totaal: { plays: 10, unique_viewers: uniek }, media: { m1: { plays: 4, unique_viewers: 3 } }, live: null, per: {},
  });
  assert.deepEqual(archiefRijen([dag("2026-01-01", 8), dag("2026-01-02", 9)], [], ["plays", "unique_viewers"]), [{ plays: 20, unique_viewers: null }]);
  assert.deepEqual(archiefRijen([dag("2026-01-01", 8)], [], ["plays", "unique_viewers"]), [{ plays: 10, unique_viewers: 8 }]);
  assert.deepEqual(archiefRijen([dag("2026-01-01", 8), dag("2026-01-02", 9)], ["media_id"], ["plays"]), [{ media_id: "m1", plays: 8 }]);
  assert.equal(archiefRijen([dag("2026-01-01", 8)], ["platform_id"], ["plays"]), null);

  const { api } = nepApi((q) => (q.dimensions?.[0] === "eastern_date" ? [{ eastern_date: q.start_date, plays: 5 }] : [{ [q.dimensions?.[0] ?? "x"]: "w", plays: 1 }]));
  const s = await maakSnapshot(api, "abcd1234", volleCaps(), "2026-11-22");
  assert.equal(s.totaal.plays, 5);
  assert.deepEqual(Object.keys(s.per).sort(), ["country_code", "device_id", "platform_id", "tag"]);
  assert.ok(s.live);

  const opslag = geheugenOpslag();
  const run = await snapshotRun({ api, siteId: "abcd1234", cap: volleCaps(), opslag, dataThrough: "2026-11-22", budgetMs: 60_000 });
  assert.equal(run.gedaan.length, 7);
  assert.equal(run.over, 0);
  assert.ok(opslag.inhoud.has(paden.dag("abcd1234", "2026-11-16")));
});

test("capabilities: een geweigerde sleutel wordt een fout, niet een lege uitkomst", async () => {
  vergeetCapabilities();
  const opslag = geheugenOpslag();
  const site = { id: "abcd1234", label: "PSV Play" };
  await assert.rejects(
    capabilitiesVoor(site, [site], async () => ({ status: 401, body: { errors: [{ code: "unauthorized", description: "invalid" }] } }), opslag),
    (err: unknown) => err instanceof Error && "status" in err && (err as { status: number }).status === 401
  );
  assert.equal(opslag.inhoud.has(paden.capabilities), false);

  // Een eerder opgeslagen mislukte uitkomst (zonder plays) wordt opnieuw getest.
  await opslag.schrijf(paden.capabilities, JSON.stringify({ probedAt: new Date().toISOString(), sites: { abcd1234: volleCaps({ metrics: { plays: null } }) } }), "application/json");
  vergeetCapabilities();
  let opnieuw = 0;
  const cap = await capabilitiesVoor(site, [site], async (v) => {
    opnieuw++;
    return v.method === "GET" ? { status: 200, body: { media: [] } } : { status: 200, body: { data: { rows: [] } } };
  }, opslag);
  assert.ok(opnieuw > 0);
  assert.equal(cap.metrics.plays, "sum");
});

test("JW-grens voor advanced query's (92 dagen): opnieuw in stukken, en die grens onthouden", async () => {
  const fout = () => new JwFout("Advanced query objects available for date ranges spanning over less than or equal to 92 day(s).", 403);
  const { api, vragen } = nepApi((q) => {
    const dagen = (Date.parse(q.end_date) - Date.parse(q.start_date)) / 86_400_000 + 1;
    if (q.dimensions?.includes("media_id") && dagen > 92) throw fout();
    return [{ media_id: "aaaaaaa1", plays: 10, time_watched: 100, unique_viewers: 5 }];
  });
  const ctx = nepCtx(api, volleCaps({ maxRangeDays: 1827 }));
  const p = { van: "2026-07-01", tot: "2026-11-22" };
  const rijen = await vraag(ctx, p, ["media_id"], ["plays", "unique_viewers"]);
  assert.deepEqual(rijen, [{ media_id: "aaaaaaa1", plays: 20, unique_viewers: null }]);
  assert.equal(vragen.length, 3, "één mislukte vraag, daarna twee stukken");
  await vraag(ctx, p, ["media_id"], ["plays", "unique_viewers"]);
  assert.equal(vragen.length, 5, "de grens is onthouden: meteen in stukken");
  // Een gewone query zonder media_id blijft één vraag over de hele periode.
  await vraag(ctx, p, [], ["plays"]);
  assert.equal(vragen.length, 6);
});

test("foutmelding bij de JW-bereikgrens zegt niet dat de sleutel fout is", async () => {
  const { foutAntwoord } = await import("./fouten");
  const m = foutAntwoord(new JwFout("Advanced query objects available for date ranges spanning over less than or equal to 92 day(s).", 403)).melding;
  assert.doesNotMatch(m, /sleutel/);
  assert.match(foutAntwoord(new JwFout("unauthorized: invalid", 401)).melding, /sleutel/);
});

test("publiek: browser en videoduur, videoduur op volgorde van de groepen", async () => {
  const { api } = nepApi((q) => {
    const d = q.dimensions?.[0];
    if (d === "video_duration") return [["10-30 min", 50], ["< 1 min", 300], ["1-10 min", 200], ["30+ min", 20]].map(([w, p]) => ({ video_duration: w, plays: p, time_watched: 1 }));
    if (d === "browser") return Array.from({ length: 12 }, (_, i) => ({ browser: `B${i}`, plays: 100 - i, time_watched: 1 }));
    if (d === "platform_id") return [{ platform_id: "web", plays: 500, time_watched: 1 }];
    return [];
  });
  const p = (await publiek(nepCtx(api), k30())) as { browser: { label: string }[]; videoduur: { label: string }[]; notes: string[] };
  assert.equal(p.browser.length, 10);
  assert.deepEqual(p.videoduur.map((v) => v.label), ["< 1 min", "1-10 min", "10-30 min", "30+ min"]);
  assert.ok(p.notes.some((n) => n.includes("één platform (Web)")));
  // Zonder getal in elk label: gewoon op plays.
  const r = [{ waarde: "kort", label: "kort", plays: 1, kijktijd_uren: 0, aandeel_plays_pct: null }, { waarde: "1 min", label: "1 min", plays: 2, kijktijd_uren: 0, aandeel_plays_pct: null }];
  assert.deepEqual(opVolgorde(r), r);
});
