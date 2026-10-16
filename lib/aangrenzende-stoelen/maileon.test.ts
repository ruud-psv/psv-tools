import { test } from "node:test";
import assert from "node:assert/strict";
import { maileonName } from "./maileon";

test("naam volgens de conventie van Digital Marketing", () => {
  assert.equal(
    maileonName({ sendDate: "2026-10-12", eventName: "PSV - Willem II", dmid: "DMID-XXX" }),
    "2026.10.12 PSV Kaartverkoop - Aangrenzende stoelen PSV - Willem II - DMID-XXX"
  );
  assert.equal(
    maileonName({ sendDate: "2026-10-31", eventName: "  PSV  -  Ajax ", dmid: " DMID26-12345 " }),
    "2026.10.31 PSV Kaartverkoop - Aangrenzende stoelen PSV - Ajax - DMID26-12345"
  );
});
