import { test } from "node:test";
import assert from "node:assert/strict";
import { createShareToken, readShareToken } from "./share";

process.env.SESSION_SECRET = "ab".repeat(32);
const ID = "11111111-2222-3333-4444-555555555555";

test("een deeltoken wijst naar zijn wedstrijd", () => {
  assert.equal(readShareToken(createShareToken(ID)), ID);
});

test("een aangepast of verzonnen token geldt niet", () => {
  const token = createShareToken(ID);
  const [, signature] = token.split(".");
  const other = Buffer.from(JSON.stringify({ e: "99999999-2222-3333-4444-555555555555" })).toString("base64url");
  assert.equal(readShareToken(`${other}.${signature}`), null);
  assert.equal(readShareToken(`${token}x`), null);
  assert.equal(readShareToken("abc"), null);
  assert.equal(readShareToken(null), null);
});

test("een ander geheim maakt het token ongeldig", () => {
  const token = createShareToken(ID);
  process.env.SESSION_SECRET = "cd".repeat(32);
  assert.equal(readShareToken(token), null);
  process.env.SESSION_SECRET = "ab".repeat(32);
});
