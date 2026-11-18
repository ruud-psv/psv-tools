import { test } from "node:test";
import assert from "node:assert/strict";
import { createShareToken, verifyShareToken } from "./share-token";
import { createShareToken as createStadionToken } from "./ticketing-stadion/share";

process.env.SESSION_SECRET = "ab".repeat(32);

const REPORT_A = "11111111-2222-3333-4444-555555555555";
const REPORT_B = "99999999-8888-7777-6666-555555555555";
const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);

function encode(body: object): string {
  return Buffer.from(JSON.stringify(body)).toString("base64url");
}

test("een geldig token geeft zijn scope terug", () => {
  const token = createShareToken({ kind: "report", id: REPORT_A });
  assert.deepEqual(verifyShareToken(token), { kind: "report", id: REPORT_A });

  const dm = createShareToken({ kind: "dm", q: "seizoenkaart", preset: "30d", customFrom: "", customTo: "" });
  assert.deepEqual(verifyShareToken(dm), { kind: "dm", q: "seizoenkaart", preset: "30d", customFrom: "", customTo: "" });

  const ticket = createShareToken({ kind: "ticket-event", params: { eventId: "abc", compare: ["x"] } });
  assert.deepEqual(verifyShareToken(ticket), { kind: "ticket-event", params: { eventId: "abc", compare: ["x"] } });
});

test("een zelfgemaakt token geldt niet", () => {
  // `e30` is base64url van `{}`: werkte vóór de ondertekening overal.
  assert.equal(verifyShareToken("e30"), null);
  assert.equal(verifyShareToken(encode({ kind: "report", id: REPORT_A })), null);
  assert.equal(verifyShareToken(`${encode({ v: 1, kind: "report", id: REPORT_A })}.verzonnen`), null);
  assert.equal(verifyShareToken(`${encode({ v: 1, kind: "report", id: REPORT_A })}.`), null);
  assert.equal(verifyShareToken(""), null);
  assert.equal(verifyShareToken(null), null);
  assert.equal(verifyShareToken(undefined), null);
});

test("een gewijzigde payload maakt de handtekening ongeldig", () => {
  const token = createShareToken({ kind: "report", id: REPORT_A });
  const [, signature] = token.split(".");
  const toB = encode({ v: 1, kind: "report", id: REPORT_B });
  assert.equal(verifyShareToken(`${toB}.${signature}`), null);

  // Ook een langere geldigheid erbij zetten mag niet.
  const short = createShareToken({ kind: "report", id: REPORT_A }, { expiresInSeconds: 60, now: NOW });
  const [, shortSig] = short.split(".");
  const longer = encode({ v: 1, kind: "report", id: REPORT_A, exp: Math.floor(NOW / 1000) + 365 * 86400 });
  assert.equal(verifyShareToken(`${longer}.${shortSig}`, NOW), null);

  assert.equal(verifyShareToken(`${token}x`), null);
  assert.equal(verifyShareToken(`${token}.extra`), null);
});

test("een verlopen token geldt niet", () => {
  const token = createShareToken({ kind: "report", id: REPORT_A }, { expiresInSeconds: 3600, now: NOW });
  assert.deepEqual(verifyShareToken(token, NOW + 3599_000), {
    kind: "report",
    id: REPORT_A,
    exp: Math.floor(NOW / 1000) + 3600,
  });
  assert.equal(verifyShareToken(token, NOW + 3601_000), null);
});

test("een token van Ticketing Stadion geldt hier niet", () => {
  const stadion = createStadionToken(REPORT_A);
  assert.equal(verifyShareToken(stadion), null);
});

test("een ander geheim maakt het token ongeldig", () => {
  const token = createShareToken({ kind: "report", id: REPORT_A });
  process.env.SESSION_SECRET = "cd".repeat(32);
  try {
    assert.equal(verifyShareToken(token), null);
  } finally {
    process.env.SESSION_SECRET = "ab".repeat(32);
  }
});

test("ondertekend, maar met een onbekende vorm, geldt ook niet", () => {
  // Alleen te maken met het geheim; dit vangt fouten in eigen code af.
  const bad = createShareToken({ kind: "report", id: "../../etc" } as never);
  assert.equal(verifyShareToken(bad), null);
  const unknown = createShareToken({ kind: "campaign" } as never);
  assert.equal(verifyShareToken(unknown), null);
});
