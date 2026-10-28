import { test } from "node:test";
import assert from "node:assert/strict";

import {
  USER_ADMIN_HREF,
  canAccessApi,
  canAccessPath,
  pageForPath,
  parseAdminEmails,
  resolveAccess,
  sanitizeUserAccess,
  type UserAccess,
} from "./access";

const users: UserAccess[] = [
  { email: "alles@psv.nl", level: "all", pages: [] },
  { email: "beperkt@psv.nl", level: "custom", pages: ["/dashboard/utm-builder", "/dashboard/kleurplaat"] },
  { email: "baas@psv.nl", level: "admin", pages: [] },
];

test("onbekende gebruiker krijgt alles + beta, maar geen beheer", () => {
  const access = resolveAccess("Nieuw@PSV.nl", users, []);
  assert.equal(access.level, "all-beta");
  assert.ok(canAccessPath(access, "/dashboard/kleurplaat"));
  assert.ok(canAccessPath(access, "/dashboard/paid-ads"));
  assert.ok(!canAccessPath(access, USER_ADMIN_HREF));
  assert.ok(!canAccessApi(access, "/api/users"));
});

test("alles: geen beta tools", () => {
  const access = resolveAccess("alles@psv.nl", users, []);
  assert.ok(canAccessPath(access, "/dashboard/paid-ads"));
  assert.ok(!canAccessPath(access, "/dashboard/kleurplaat"));
  assert.ok(!canAccessApi(access, "/api/kleurplaat/genereer"));
});

test("specifieke pagina's: alleen wat is aangevinkt, plus het overzicht", () => {
  const access = resolveAccess("beperkt@psv.nl", users, []);
  assert.ok(canAccessPath(access, "/dashboard"));
  assert.ok(canAccessPath(access, "/dashboard/utm-builder"));
  assert.ok(canAccessPath(access, "/dashboard/kleurplaat/iets"));
  assert.ok(!canAccessPath(access, "/dashboard/database"));
  assert.ok(canAccessApi(access, "/api/utm-links"));
  assert.ok(!canAccessApi(access, "/api/database/campagnes"));
  // Niet gekoppelde routes (deellinks, logout) blijven bereikbaar.
  assert.ok(canAccessApi(access, "/api/logout"));
  assert.ok(canAccessApi(access, "/api/ticket-feed"));
});

test("admin en ADMIN_EMAILS mogen het beheer in", () => {
  assert.ok(canAccessPath(resolveAccess("baas@psv.nl", users, []), USER_ADMIN_HREF));
  const viaEnv = resolveAccess("beperkt@psv.nl", users, parseAdminEmails("x@psv.nl, BEPERKT@psv.nl"));
  assert.ok(viaEnv.isAdmin);
  assert.ok(canAccessApi(viaEnv, "/api/users"));
});

test("paden matchen op segmentgrens en langste pagina wint", () => {
  assert.equal(pageForPath("/dashboard/ticket-inzichten-new"), "/dashboard/ticket-inzichten-new");
  assert.equal(pageForPath("/dashboard/ticket-inzichten"), "/dashboard/ticket-inzichten");
  assert.equal(pageForPath("/dashboard/auth/google/callback"), null);
  const access = resolveAccess("x@psv.nl", [{ email: "x@psv.nl", level: "custom", pages: ["/dashboard/ticket-inzichten"] }], []);
  assert.ok(!canAccessPath(access, "/dashboard/ticket-inzichten-new"));
  assert.ok(!canAccessApi(access, "/api/playable-insights"));
});

test("sanitizeUserAccess normaliseert en filtert onbekende pagina's", () => {
  assert.deepEqual(
    sanitizeUserAccess({ email: " A@PSV.nl ", level: "custom", pages: ["/dashboard/database", "/evil", 3] }),
    { email: "a@psv.nl", level: "custom", pages: ["/dashboard/database"] }
  );
  assert.deepEqual(sanitizeUserAccess({ email: "a@psv.nl", level: "all", pages: ["/dashboard/database"] }), {
    email: "a@psv.nl",
    level: "all",
    pages: [],
  });
  assert.equal(sanitizeUserAccess({ email: "geen-adres", level: "all" }), null);
  assert.equal(sanitizeUserAccess({ email: "a@psv.nl", level: "superuser" }), null);
});
