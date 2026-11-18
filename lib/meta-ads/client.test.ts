import { test } from "node:test";
import assert from "node:assert/strict";

import { metaApi } from "./client";
import { MetaFout } from "./rapport";

const config = { token: "geheim-token", accountPath: "act_123", apiVersion: "v21.0" };

async function metNepFetch(antwoord: () => Response, werk: (verzoeken: { url: URL; init: RequestInit }[]) => Promise<void>) {
  const echt = globalThis.fetch;
  const verzoeken: { url: URL; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: URL, init: RequestInit) => {
    verzoeken.push({ url, init });
    return antwoord();
  }) as typeof fetch;
  try {
    await werk(verzoeken);
  } finally {
    globalThis.fetch = echt;
  }
}

test("alleen het eigen account, het token in de header en nooit in de URL", async () => {
  await metNepFetch(() => Response.json({ data: [] }), async (verzoeken) => {
    const api = metaApi(config);
    await api.insights({ level: "campaign", fields: "spend" });
    await api.objecten("adsets", { fields: "id,name" });
    await api.account();
    assert.deepEqual(
      verzoeken.map((v) => v.url.pathname),
      ["/v21.0/act_123/insights", "/v21.0/act_123/adsets", "/v21.0/act_123"]
    );
    for (const v of verzoeken) {
      assert.equal(v.url.origin, "https://graph.facebook.com");
      assert.ok(!v.url.toString().includes("geheim-token"));
      assert.equal((v.init.headers as Record<string, string>).Authorization, "Bearer geheim-token");
      assert.equal(v.init.method, undefined); // GET
    }
    assert.equal(verzoeken[0].url.searchParams.get("level"), "campaign");
  });
});

test("een fout van Meta wordt een MetaFout, zonder token", async () => {
  await metNepFetch(
    () => Response.json({ error: { message: "Invalid token geheim-token", code: 190 } }, { status: 401 }),
    async () => {
      await assert.rejects(metaApi(config).account(), (err: Error) => {
        assert.ok(err instanceof MetaFout);
        assert.equal(err.status, 401);
        assert.equal(err.message, "Invalid token [token] (code 190)");
        return true;
      });
    }
  );
});
