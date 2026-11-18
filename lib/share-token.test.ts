import { test } from "node:test";
import assert from "node:assert/strict";
import { createShareToken, isValidShareToken, readShareToken } from "./share-token";
import { createSessionToken } from "./auth";
import { createShareToken as createStadionToken } from "./ticketing-stadion/share";

process.env.SESSION_SECRET = "ab".repeat(32);

const DM = { kind: "dm", q: "kerst", preset: "30d", customFrom: "", customTo: "" };

test("een deeltoken geeft zijn payload terug", () => {
  const token = createShareToken(DM);
  assert.deepEqual(readShareToken(token), DM);
  assert.equal(isValidShareToken(token), true);
});

test("een aangepaste payload valt op de handtekening af", () => {
  const token = createShareToken(DM);
  const [, signature] = token.split(".");
  const other = Buffer.from(JSON.stringify({ ...DM, preset: "1y" })).toString("base64url");
  assert.equal(readShareToken(`${other}.${signature}`), null);
  assert.equal(readShareToken(`${token}x`), null);
  assert.equal(readShareToken(`${token}.extra`), null);
});

test("een zelfgemaakt token zonder handtekening geldt niet meer", () => {
  // Zo zagen deeltokens er vóór de ondertekening uit; die maakte iedereen zelf.
  const unsigned = Buffer.from(JSON.stringify({ kind: "report", id: "x" })).toString("base64url");
  assert.equal(readShareToken(unsigned), null);
  assert.equal(isValidShareToken(unsigned), false);
  assert.equal(isValidShareToken("abc"), false);
  assert.equal(isValidShareToken(""), false);
  assert.equal(isValidShareToken(null), false);
});

test("een sessie of een Ticketing Stadion-token is geen deeltoken", () => {
  assert.equal(readShareToken(createSessionToken("collega@example.com")), null);
  assert.equal(readShareToken(createStadionToken("11111111-2222-3333-4444-555555555555")), null);
});

test("een ander geheim maakt het token ongeldig", () => {
  const token = createShareToken(DM);
  process.env.SESSION_SECRET = "cd".repeat(32);
  assert.equal(readShareToken(token), null);
  process.env.SESSION_SECRET = "ab".repeat(32);
});
