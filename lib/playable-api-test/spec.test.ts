import { test } from "node:test";
import assert from "node:assert/strict";

import { apiBase, parseOpenApi } from "./spec";
import { SAMPLE_SPEC_YAML } from "./fixtures";

test("YAML: rechten met omschrijving", () => {
  const spec = parseOpenApi(SAMPLE_SPEC_YAML);
  assert.deepEqual(
    spec.scopes.map((s) => s.name),
    [
      "campaigns.list",
      "campaigns.view",
      "campaigns.modify",
      "campaigns.copy",
      "campaigns.sections.list",
      "campaigns.sections.view",
      "campaigns.registrations.list",
    ]
  );
  assert.equal(spec.scopes[6].description, "Grant right to list registrations");
});

test("YAML: endpoints met methode, omschrijving en rechten", () => {
  const spec = parseOpenApi(SAMPLE_SPEC_YAML);
  const ops = spec.operations.map((o) => `${o.method} ${o.path} [${o.scopes.join(",")}] ${o.summary}`);
  assert.deepEqual(ops, [
    "get /v1/campaigns [campaigns.list] List campaigns",
    "get /v1/campaign/{campaign} [campaigns.view] View a campaign",
    "put /v1/campaign/{campaign} [campaigns.modify] Modify a campaign",
    "post /v1/campaign/{campaign}/copy [campaigns.copy] copyCampaign",
    "get /v1/campaign/{campaign}/sections [campaigns.sections.list] List sections",
    "get /v1/campaign/{campaign}/sections/{section} [campaigns.sections.view] View a section",
    "get /v1/campaign/{campaign}/registrations [campaigns.registrations.list] List registrations",
  ]);
});

test("YAML: tekst in een omschrijving telt niet als endpoint", () => {
  const spec = parseOpenApi(SAMPLE_SPEC_YAML);
  assert.ok(!spec.operations.some((o) => o.path === "/niet-echt"));
});

test("YAML met vier spaties inspringing", () => {
  const wide = SAMPLE_SPEC_YAML.replace(/^( +)/gm, (spaces) => spaces + spaces);
  const spec = parseOpenApi(wide);
  assert.equal(spec.scopes.length, 7);
  assert.equal(spec.operations.length, 7);
});

test("alleen het servers-blok telt als server", () => {
  const spec = parseOpenApi(SAMPLE_SPEC_YAML);
  assert.deepEqual(spec.servers, ["https://api.playable.com", "https://api.dev.playable.com"]);
});

test("JSON-beschrijving", () => {
  const spec = parseOpenApi(
    JSON.stringify({
      openapi: "3.0.0",
      servers: [{ url: "https://api.playable.com/v1" }],
      paths: {
        "/campaign/{id}": {
          get: { summary: "View", security: [{ oauth: ["campaigns.view"] }] },
          patch: { operationId: "modify", security: [{ oauth: ["campaigns.modify"] }] },
        },
      },
      components: {
        securitySchemes: {
          oauth: {
            type: "oauth2",
            flows: { clientCredentials: { scopes: { "campaigns.view": "View", "campaigns.modify": "Modify" } } },
          },
        },
      },
    })
  );
  assert.deepEqual(spec.scopes.map((s) => s.name), ["campaigns.view", "campaigns.modify"]);
  assert.deepEqual(
    spec.operations.map((o) => `${o.method} ${o.path} ${o.scopes.join(",")}`),
    ["get /campaign/{id} campaigns.view", "patch /campaign/{id} campaigns.modify"]
  );
  assert.equal(apiBase(spec.servers), "https://api.playable.com/v1");
});

test("apiBase: alleen api.playable.com via https, anders het vaste adres", () => {
  assert.equal(apiBase(["https://api.dev.playable.com", "https://api.playable.com"]), "https://api.playable.com");
  assert.equal(apiBase(["https://elders.example.com/v1"]), "https://api.playable.com");
  assert.equal(apiBase(["http://api.playable.com"]), "https://api.playable.com");
  assert.equal(apiBase([]), "https://api.playable.com");
});

test("niets te lezen geeft lege lijsten", () => {
  const spec = parseOpenApi("<html>niet gevonden</html>");
  assert.deepEqual(spec, { scopes: [], operations: [], servers: [] });
});
