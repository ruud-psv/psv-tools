import { test } from "node:test";
import assert from "node:assert/strict";

import { maileonApi } from "./client";
import { MaileonFout } from "./rapport";

type Verzoek = { url: URL; init: RequestInit };

async function metNepMaileon(antwoord: (url: URL) => Response, werk: (verzoeken: Verzoek[]) => Promise<void>) {
  const echt = globalThis.fetch;
  const verzoeken: Verzoek[] = [];
  globalThis.fetch = (async (url: URL | string, init: RequestInit) => {
    const u = new URL(String(url));
    verzoeken.push({ url: u, init });
    return antwoord(u);
  }) as typeof fetch;
  try {
    await werk(verzoeken);
  } finally {
    globalThis.fetch = echt;
  }
}

const mailing = (id: number) =>
  `<mailing><id>${id}</id><fields><field><name>name</name><value>M${id}</value></field><field><name>state</name><value>done</value></field><field><name>scheduleTime</name><value>2026-10-01 10:00:00</value></field></fields></mailing>`;

test("alleen GET, met Basic-auth en XML; lijst in pagina's van 1000, resultaten per 50", async () => {
  const antwoord = (url: URL): Response => {
    if (url.pathname.endsWith("/mailings/filter/scheduletime")) {
      const pagina = Number(url.searchParams.get("page_index"));
      const aantal = pagina === 1 ? 1000 : 3;
      return new Response(`<mailings>${Array.from({ length: aantal }, (_, i) => mailing((pagina - 1) * 1000 + i + 1)).join("")}</mailings>`);
    }
    const ids = url.searchParams.getAll("mailing_id");
    return new Response(
      `<mailing_summaries>${ids.map((id) => `<mailing_summary><mailing_id>${id}</mailing_id><recipients>10</recipients></mailing_summary>`).join("")}</mailing_summaries>`
    );
  };
  await metNepMaileon(antwoord, async (verzoeken) => {
    const api = maileonApi({ apiKey: "geheim" });
    const lijst = await api.mailingsSinds("2026-10-01");
    assert.equal(lijst.length, 1003);
    await api.mailingsSinds("2026-10-01"); // uit de cache
    const resultaten = await api.resultaten(Array.from({ length: 120 }, (_, i) => i + 1));
    assert.equal(resultaten.length, 120);

    const lijstVerzoeken = verzoeken.filter((v) => v.url.pathname.endsWith("/scheduletime"));
    assert.equal(lijstVerzoeken.length, 2);
    assert.equal(lijstVerzoeken[0].url.searchParams.get("scheduleTime"), "2026-10-01 00:00:00");
    assert.deepEqual(lijstVerzoeken[0].url.searchParams.getAll("fields"), ["name", "state", "type", "scheduleTime"]);
    const rapportVerzoeken = verzoeken.filter((v) => v.url.pathname.endsWith("/mailing_summaries"));
    assert.deepEqual(rapportVerzoeken.map((v) => v.url.searchParams.getAll("mailing_id").length), [50, 50, 20]);
    for (const v of verzoeken) {
      assert.equal(v.url.origin, "https://api.maileon.com");
      assert.equal(v.init.method, undefined); // GET
      const headers = v.init.headers as Record<string, string>;
      assert.equal(headers.Authorization, `Basic ${Buffer.from("geheim").toString("base64")}`);
      assert.equal(headers.Accept, "application/vnd.maileon.api+xml");
      assert.ok(!v.url.toString().includes("geheim"));
    }
  });
});

test("een fout van Maileon wordt een MaileonFout met de melding", async () => {
  await metNepMaileon(
    () => new Response("<error><message>Unauthorized: invalid API key</message></error>", { status: 401 }),
    async () => {
      await assert.rejects(maileonApi({ apiKey: "x" }).resultaten([1]), (err: Error) => {
        assert.ok(err instanceof MaileonFout);
        assert.equal(err.status, 401);
        assert.equal(err.message, "Unauthorized: invalid API key");
        return true;
      });
    }
  );
});
