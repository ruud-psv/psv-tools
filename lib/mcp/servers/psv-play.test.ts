import { test } from "node:test";
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { Rij } from "../../jwplayer/client";
import { vergeetMedia } from "../../jwplayer/media";
import { media, nepApi, nepCtx } from "../../jwplayer/nep";
import type { PsvPlayOmgeving } from "../../jwplayer/server";
import { JwConfigError } from "../../jwplayer/sites";
import { checkToolInput, toolKind } from "../config";
import { createPsvPlayServer } from "./psv-play";

const VIDEOS = [
  media("aaaaaaa1", "Persconferentie Peter Bosz", ["type:persconferentie", "team:psv1"]),
  media("aaaaaaa2", "Samenvatting PSV - Ajax", ["type:samenvatting", "team:psv1"]),
];

function antwoord(q: { dimensions?: string[] }): Rij[] {
  const d = q.dimensions ?? [];
  if (!d.length) return [{ plays: 400, time_watched: 90_000, unique_viewers: 330, completes: 240 }];
  if (d[0] === "media_id") {
    return [
      { media_id: "aaaaaaa1", plays: 100, time_watched: 36_000, unique_viewers: 80, completes: 40, "25_percent_completes": 90, "50_percent_completes": 70, "75_percent_completes": 50 },
      { media_id: "aaaaaaa2", plays: 300, time_watched: 54_000, unique_viewers: 250, completes: 200, "25_percent_completes": 280, "50_percent_completes": 250, "75_percent_completes": 220 },
    ];
  }
  if (d[0] === "eastern_date") return [{ eastern_date: "2026-11-20", plays: 10, time_watched: 3600, unique_viewers: 9, completes: 5 }];
  return [{ [d[0]]: "x", plays: 1, time_watched: 1 }];
}

function omgeving(): PsvPlayOmgeving {
  vergeetMedia();
  const { api } = nepApi(antwoord, VIDEOS);
  return { sites: [{ id: "abcd1234", label: "PSV Play" }], ctx: async () => nepCtx(api) };
}

async function verbind(maak: () => PsvPlayOmgeving) {
  const server = createPsvPlayServer({ omgeving: maak });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

const tekst = (r: Awaited<ReturnType<Client["callTool"]>>) => ((r.content ?? []) as { text?: string }[]).map((c) => c.text ?? "").join("\n");
const json = (r: Awaited<ReturnType<Client["callTool"]>>) => JSON.parse(tekst(r));

test("zeven tools, allemaal alleen lezen, met de kanttekeningen in de beschrijving", async () => {
  const client = await verbind(omgeving);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), [
    "psvplay_overview",
    "psvplay_top_content",
    "psvplay_media_detail",
    "psvplay_compare_periods",
    "psvplay_live_events",
    "psvplay_audience",
    "psvplay_search_media",
  ]);
  for (const tool of tools) assert.equal(toolKind({ annotations: tool.annotations }), "leest");
  for (const naam of ["psvplay_overview", "psvplay_top_content", "psvplay_media_detail", "psvplay_compare_periods", "psvplay_live_events"]) {
    const d = tools.find((t) => t.name === naam)!.description!;
    assert.match(d, /NIET optelbaar/, naam);
    assert.match(d, /langer dan 30 seconden/, naam);
  }
  assert.ok("input" in checkToolInput(tools[1].inputSchema as Record<string, unknown>, { preset: "30d", metric: "plays", type: "persconferentie" }));
  assert.ok("error" in checkToolInput(tools[1].inputSchema as Record<string, unknown>, { metric: "content_score" }));
  await client.close();
});

test("elke tool geeft compacte JSON met periode, data_through en notes, en titels in plaats van id's", async () => {
  const client = await verbind(omgeving);
  const o = json(await client.callTool({ name: "psvplay_overview", arguments: { preset: "7d" } }));
  assert.equal(o.kpis.unieke_kijkers, 330);
  assert.ok(o.data_through);
  assert.equal(o.periode.datums, "eastern_date (US Eastern)");
  assert.ok(o.notes.length >= 2);

  const top = json(await client.callTool({ name: "psvplay_top_content", arguments: { limit: 1 } }));
  assert.equal(top.top[0].titel, "Samenvatting PSV - Ajax");
  assert.equal(top.top[0]._video, undefined);

  const detail = json(await client.callTool({ name: "psvplay_media_detail", arguments: { media_id: "aaaaaaa1" } }));
  assert.equal(detail.video.titel, "Persconferentie Peter Bosz");
  assert.equal(detail.cijfers.afhaakcurve.p50, 70);

  const vergelijk = json(await client.callTool({ name: "psvplay_compare_periods", arguments: { periode_a: { preset: "season" }, per: "type" } }));
  assert.ok(vergelijk.types.some((t: { type: string }) => t.type === "Persconferentie"));

  const live = await client.callTool({ name: "psvplay_live_events", arguments: {} });
  assert.equal(live.isError, undefined, tekst(live));
  const publiek = json(await client.callTool({ name: "psvplay_audience", arguments: { start_date: "2026-11-01", end_date: "2026-11-10" } }));
  assert.equal(publiek.periode.start_date, "2026-11-01");

  const zoek = json(await client.callTool({ name: "psvplay_search_media", arguments: { zoek: "bosz" } }));
  assert.equal(zoek.videos[0].media_id, "aaaaaaa1");
  await client.close();
});

test("fouten: periode, ontbrekende sleutel", async () => {
  const client = await verbind(omgeving);
  const fout = await client.callTool({ name: "psvplay_overview", arguments: { start_date: "2099-01-01" } });
  assert.equal(fout.isError, true);
  assert.match(tekst(fout), /start_date ligt na de einddatum/);
  await client.close();

  const zonder = await verbind(() => ({
    sites: [],
    ctx: async () => {
      throw new JwConfigError("JW Player-configuratie ontbreekt: JWPLAYER_SECRET.");
    },
  }));
  assert.equal(tekst(await zonder.callTool({ name: "psvplay_overview", arguments: {} })), "JW Player-configuratie ontbreekt: JWPLAYER_SECRET.");
  await zonder.close();
});
