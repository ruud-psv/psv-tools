import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { FileflowFout, PAGINA, bronVanItem, haalBeeldOp, naarBeeld, zoekBeelden, type FileflowItem } from "./client";

const item: FileflowItem = {
  id: 12847,
  name: "PSV - Go Ahead Eagles sfeer Oost",
  filename: "psv-gae-oost.jpg",
  media_kind: "image",
  category_name: "Wedstrijden 26-27",
  original_created_at: "2026-11-28T19:45:00Z",
  created_at: "2026-11-29T08:00:00Z",
  tags: ["sfeer", "oosttribune"],
  image_width: 6000,
  image_height: 4000,
  processed: true,
  url: "https://cdn.fileflow.com/psv/items/12847/original.jpg?sig=1",
  thumbs: { small: "https://cdn.fileflow.com/s.jpg", medium: "https://cdn.fileflow.com/m.jpg", large: "https://cdn.fileflow.com/l.jpg" },
};

const echteFetch = globalThis.fetch;
let verzoeken: { url: string; headers: Record<string, string> }[] = [];

function zetFetch(antwoord: (url: string) => Response) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    verzoeken.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return antwoord(url);
  }) as typeof fetch;
}

beforeEach(() => {
  verzoeken = [];
  process.env.FILEFLOW_SECRET = "ffpat_test";
  delete process.env.FILEFLOW_SUBDOMAIN;
});
afterEach(() => {
  globalThis.fetch = echteFetch;
});

test("naarBeeld: wat de kiezer nodig heeft; zonder thumbnail of nog niet verwerkt valt hij weg", () => {
  assert.deepEqual(naarBeeld(item), {
    id: 12847,
    naam: "PSV - Go Ahead Eagles sfeer Oost",
    thumb: "https://cdn.fileflow.com/m.jpg",
    voorbeeld: "https://cdn.fileflow.com/l.jpg",
    breedte: 6000,
    hoogte: 4000,
    categorie: "Wedstrijden 26-27",
    datum: "2026-11-28",
    tags: ["sfeer", "oosttribune"],
  });
  assert.equal(naarBeeld({ ...item, thumbs: null }), null);
  assert.equal(naarBeeld({ ...item, processed: false }), null);
  assert.equal(naarBeeld({ ...item, name: "", filename: null })?.naam, "Foto 12847");
  assert.equal(naarBeeld({ ...item, expires_at: "2027-06-30T00:00:00Z" })?.verlooptOp, "2027-06-30");
});

test("zoeken: account-subdomein, token in de header, alleen afbeeldingen, met paginering", async () => {
  zetFetch(() => Response.json({ items: [item, { ...item, id: 2, thumbs: null }], meta: { total: 95, facets: [] } }));
  const r = await zoekBeelden({ q: " vol stadion ", offset: 40, categorie: 7 });
  const url = new URL(verzoeken[0].url);
  assert.equal(url.origin + url.pathname, "https://psv.fileflow.com/api/v1/items");
  assert.equal(verzoeken[0].headers.Authorization, "Token token=ffpat_test");
  assert.equal(url.searchParams.get("q"), "vol stadion");
  assert.deepEqual(url.searchParams.getAll("media_type[]"), ["images"]);
  assert.equal(url.searchParams.get("archived"), "false");
  assert.equal(url.searchParams.get("offset"), "40");
  assert.equal(url.searchParams.get("size"), String(PAGINA));
  assert.equal(url.searchParams.get("category_id"), "7");
  assert.equal(url.searchParams.get("sort"), null); // met een zoekterm: de volgorde van FileFlow
  assert.equal(r.totaal, 95);
  assert.equal(r.beelden.length, 1); // het item zonder thumbnail valt weg
  assert.equal(r.volgende, 42);

  process.env.FILEFLOW_SUBDOMAIN = "PSV-test";
  await zoekBeelden({});
  const leeg = new URL(verzoeken[1].url);
  assert.equal(leeg.host, "psv-test.fileflow.com");
  assert.equal(leeg.searchParams.get("sort"), "uploaded+desc");
  assert.equal(leeg.searchParams.get("q"), null);
});

test("zoeken: volgorde op de datum van de foto, nieuw naar oud of oud naar nieuw", async () => {
  zetFetch(() => Response.json({ items: [], meta: { total: 0 } }));
  await zoekBeelden({ q: "stadion", volgorde: "nieuw" });
  await zoekBeelden({ q: "stadion", volgorde: "oud" });
  await zoekBeelden({ q: "stadion" });
  const sort = verzoeken.map((v) => new URL(v.url).searchParams.get("sort"));
  assert.deepEqual(sort, ["created+desc", "created+asc", null]);
});

test("zoeken: de laatste pagina heeft geen volgende", async () => {
  zetFetch(() => Response.json({ items: [item], meta: { total: 41 } }));
  assert.equal((await zoekBeelden({ q: "x", offset: 40 })).volgende, null);
});

test("fouten: geen token, verkeerd token, te veel verzoeken", async () => {
  delete process.env.FILEFLOW_SECRET;
  await assert.rejects(zoekBeelden({ q: "x" }), /FILEFLOW_SECRET ontbreekt/);
  process.env.FILEFLOW_SECRET = "ffpat_test";
  zetFetch(() => new Response("{}", { status: 401 }));
  await assert.rejects(zoekBeelden({ q: "x" }), (e: Error) => e instanceof FileflowFout && /weigert/.test(e.message));
  zetFetch(() => new Response("{}", { status: 429 }));
  await assert.rejects(zoekBeelden({ q: "x" }), (e: Error) => e instanceof FileflowFout && e.status === 429);
});

test("foto ophalen: de grote versie, niet als de rechten verlopen zijn", async () => {
  assert.equal(bronVanItem(item), item.url); // het origineel, voor de kwaliteit
  assert.equal(bronVanItem({ ...item, filesize: 90 * 1024 * 1024 }), "https://cdn.fileflow.com/l.jpg"); // te groot: de grote versie
  assert.equal(bronVanItem({ ...item, url: null }), "https://cdn.fileflow.com/l.jpg");
  assert.equal(bronVanItem({ ...item, media_kind: "video" }), null);

  zetFetch((url) => (url.includes("/api/v1/items/12847") ? Response.json({ item }) : new Response(new Uint8Array([0xff, 0xd8, 0xff]))));
  const { bytes } = await haalBeeldOp(12847);
  assert.deepEqual([...bytes], [0xff, 0xd8, 0xff]);
  assert.equal(verzoeken[1].url, item.url);
  assert.equal(verzoeken[1].headers.Authorization, undefined); // het token gaat niet naar de CDN

  zetFetch(() => Response.json({ item: { ...item, expires_at: "2020-01-01T00:00:00Z" } }));
  await assert.rejects(haalBeeldOp(12847), /rechten van deze foto zijn verlopen/);
  await assert.rejects(haalBeeldOp(-1), /Ongeldige foto/);
});
