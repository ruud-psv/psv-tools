import { test } from "node:test";
import assert from "node:assert/strict";
import { BlobReadError, describeBlobError, isTransientBlobError, withBlobRetry } from "./read";

function fetchFailed(cause: Error = Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" })) {
  return new TypeError("fetch failed", { cause });
}

test("tijdelijke fouten: geen antwoord, verbinding weg, 5xx en 429", () => {
  assert.equal(isTransientBlobError(fetchFailed()), true);
  assert.equal(isTransientBlobError(new TypeError("terminated")), true);
  assert.equal(isTransientBlobError(new Error("Vercel Blob: Failed to fetch blob: 503 Service Unavailable")), true);
  assert.equal(isTransientBlobError(new Error("Vercel Blob: Failed to fetch blob: 429 Too Many Requests")), true);
});

test("geen nieuwe poging bij een fout die blijft", () => {
  assert.equal(isTransientBlobError(new Error("Vercel Blob: Failed to fetch blob: 403 Forbidden")), false);
  assert.equal(isTransientBlobError(new Error("Vercel Blob: No token found.")), false);
  assert.equal(isTransientBlobError(new TypeError("Cannot read properties of undefined")), false);
  assert.equal(isTransientBlobError("fetch failed"), false);
});

test("de oorzaak van undici komt in de melding", () => {
  assert.equal(describeBlobError(fetchFailed()), "fetch failed (UND_ERR_SOCKET: other side closed)");
  const reset = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
  assert.equal(describeBlobError(fetchFailed(reset)), "fetch failed (read ECONNRESET)");
  assert.equal(describeBlobError(new Error("kapot")), "kapot");
});

test("probeert opnieuw na een tijdelijke fout", async () => {
  let calls = 0;
  const value = await withBlobRetry(
    "pad.json",
    async () => {
      calls++;
      if (calls < 3) throw fetchFailed();
      return "inhoud";
    },
    [0, 0, 0]
  );
  assert.equal(value, "inhoud");
  assert.equal(calls, 3);
});

test("geeft het op als de pogingen op zijn, met de oorzaak in de melding", async () => {
  let calls = 0;
  await assert.rejects(
    withBlobRetry(
      "ringside/stoelen/state.json",
      async () => {
        calls++;
        throw fetchFailed();
      },
      [0, 0]
    ),
    (error: unknown) => {
      assert.ok(error instanceof BlobReadError);
      assert.equal(error.path, "ringside/stoelen/state.json");
      assert.match(error.message, /ringside\/stoelen\/state\.json: fetch failed \(UND_ERR_SOCKET: other side closed\)/);
      return true;
    }
  );
  assert.equal(calls, 3);
});

test("geen nieuwe poging bij een blijvende fout", async () => {
  let calls = 0;
  await assert.rejects(
    withBlobRetry(
      "pad.json",
      async () => {
        calls++;
        throw new Error("Vercel Blob: Failed to fetch blob: 403 Forbidden");
      },
      [0, 0]
    ),
    BlobReadError
  );
  assert.equal(calls, 1);
});
