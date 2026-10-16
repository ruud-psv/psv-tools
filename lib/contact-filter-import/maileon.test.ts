import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { createFilterOnFirstField, EXTERNAL_ID_FIELDS, MAILEON_FIELDS } from "./maileon";

const realFetch = globalThis.fetch;

/** Maileon na: wijst de velden in `rejected` af met `status`, maakt anders filter 42. */
function fakeMaileon(rejected: string[], status = 400) {
  const tried: string[] = [];
  process.env.MAILEON_API_KEY = "test";
  globalThis.fetch = async (_url, init) => {
    const field = JSON.parse(String(init?.body)).rules[0].selection.criterion.field_name;
    tried.push(field);
    if (rejected.includes(field)) {
      return new Response('{"error":{"message":"Unable to create the contact filter"}}', { status });
    }
    return Response.json({ contact_filter_id: 42 });
  };
  return tried;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.MAILEON_API_KEY;
});

test("velden: relatienummer, SSO-ID en GroupID", () => {
  assert.deepEqual(MAILEON_FIELDS.relatienummer.fields, ["MEMBERNUMBERPRIOR"]);
  assert.deepEqual(MAILEON_FIELDS["sso-id"].fields, ["SSOID"]);
  assert.deepEqual(MAILEON_FIELDS.groupid.fields, EXTERNAL_ID_FIELDS);
});

test("External ID: bij een 400 de volgende schrijfwijze", async () => {
  const tried = fakeMaileon(["EXTERNAL_ID"]);
  const result = await createFilterOnFirstField("Naam", EXTERNAL_ID_FIELDS, ["111"]);
  assert.deepEqual(result, { contactFilterId: 42, field: "external_id" });
  assert.deepEqual(tried, ["EXTERNAL_ID", "external_id"]);
});

test("andere fouten dan een 400 stoppen meteen", async () => {
  const tried = fakeMaileon(["EXTERNAL_ID"], 401);
  await assert.rejects(createFilterOnFirstField("Naam", EXTERNAL_ID_FIELDS, ["111"]), /Maileon 401/);
  assert.deepEqual(tried, ["EXTERNAL_ID"]);
});

test("alles afgewezen: de melding noemt de geprobeerde velden", async () => {
  fakeMaileon([...EXTERNAL_ID_FIELDS]);
  await assert.rejects(
    createFilterOnFirstField("Naam", EXTERNAL_ID_FIELDS, ["111"]),
    /elk geprobeerd veld \(EXTERNAL_ID, external_id, EXTERNAL-ID\)/
  );
  fakeMaileon(["SSOID"]);
  await assert.rejects(createFilterOnFirstField("Naam", ["SSOID"], ["abc1"]), /Maileon 400: Unable to create/);
});
