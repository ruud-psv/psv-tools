import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import { lookupCampaign } from "./playable";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.PLAYABLE_CLIENT_ID;
  delete process.env.PLAYABLE_SECRET;
});

function fakePlayable(campagne: (id: string) => Response) {
  process.env.PLAYABLE_CLIENT_ID = "c";
  process.env.PLAYABLE_SECRET = "s";
  const scopes: unknown[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/oauth/token")) {
      scopes.push(JSON.parse(String(init?.body)).scope);
      return Response.json({ access_token: "t", expires_in: 3600 });
    }
    return campagne(url.split("/").pop() ?? "");
  };
  return scopes;
}

test("lookupCampaign: gevonden, met alleen campaigns.view", async () => {
  const scopes = fakePlayable(() =>
    Response.json({
      data: {
        id: 244347,
        name: "PSV 1 - Pre-match B&D - DMID26-XXX",
        type: "landingpage",
        active: false,
        demo_url: "https://appv2.leadfamly.com/campaign/view/demo/244347/token:x",
        live_url: "https://club.psv.nl/psv-1-pre-match-bd-dmid26-xxx",
      },
    })
  );
  assert.deepEqual(await lookupCampaign(244347), {
    status: "gevonden",
    campaign: {
      id: 244347,
      name: "PSV 1 - Pre-match B&D - DMID26-XXX",
      type: "landingpage",
      active: false,
      demoUrl: "https://appv2.leadfamly.com/campaign/view/demo/244347/token:x",
      liveUrl: "https://club.psv.nl/psv-1-pre-match-bd-dmid26-xxx",
    },
  });
  // Het token wordt bewaard; als hij er nog was, is er geen nieuw aangevraagd.
  assert.ok(scopes.every((s) => JSON.stringify(s) === '["campaigns.view"]'));
});

test("lookupCampaign: onbekend (404 of 403) en fouten", async () => {
  fakePlayable(() => Response.json({ message: "Unable to locate campaign" }, { status: 403 }));
  assert.deepEqual(await lookupCampaign(1), { status: "niet-gevonden" });
  fakePlayable(() => new Response("", { status: 404 }));
  assert.deepEqual(await lookupCampaign(2), { status: "niet-gevonden" });
  fakePlayable(() => new Response("", { status: 500 }));
  assert.deepEqual(await lookupCampaign(3), { status: "fout", message: "Playable antwoordde met 500." });
});
