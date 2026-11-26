import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ADMIN_HREF,
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
  assert.ok(!canAccessPath(access, ADMIN_HREF));
  assert.ok(!canAccessApi(access, "/api/users"));
  assert.ok(!canAccessApi(access, "/api/beheer/mcp"));
  assert.ok(!canAccessApi(access, "/api/beheer/mcp/proberen"));
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
  assert.ok(canAccessPath(resolveAccess("baas@psv.nl", users, []), ADMIN_HREF));
  const viaEnv = resolveAccess("beperkt@psv.nl", users, parseAdminEmails("x@psv.nl, BEPERKT@psv.nl"));
  assert.ok(viaEnv.isAdmin);
  assert.ok(canAccessApi(viaEnv, "/api/users"));
  assert.ok(canAccessApi(viaEnv, "/api/beheer/mcp/sync"));
  assert.equal(pageForPath("/dashboard/beheer"), ADMIN_HREF);
});

test("testpagina's onder /marnix: alleen admins, ook de API", () => {
  for (const email of ["Nieuw@PSV.nl", "alles@psv.nl", "beperkt@psv.nl"]) {
    const access = resolveAccess(email, users, []);
    assert.ok(!canAccessPath(access, "/marnix/maileon-concept"), email);
    assert.ok(!canAccessPath(access, "/marnix"), email);
    assert.ok(!canAccessApi(access, "/api/marnix/maileon-concept"), email);
  }
  const admin = resolveAccess("baas@psv.nl", users, []);
  assert.ok(canAccessPath(admin, "/marnix/maileon-concept"));
  assert.ok(canAccessApi(admin, "/api/marnix/maileon-concept"));
  // Segmentgrens: een ander pad dat toevallig zo begint valt er niet onder.
  assert.ok(canAccessPath(resolveAccess("alles@psv.nl", users, []), "/marnixx"));
});

test("Playable loader is een beta tool, los van Landingspagina's", () => {
  const beta = resolveAccess("Nieuw@PSV.nl", users, []);
  assert.ok(canAccessPath(beta, "/dashboard/playable-loader"));
  assert.ok(canAccessApi(beta, "/api/playable-loader"));

  const zonderBeta = resolveAccess("alles@psv.nl", users, []);
  assert.ok(canAccessPath(zonderBeta, "/dashboard/landingspaginas"));
  assert.ok(canAccessApi(zonderBeta, "/api/playable"));
  assert.ok(!canAccessPath(zonderBeta, "/dashboard/playable-loader"));
  assert.ok(!canAccessApi(zonderBeta, "/api/playable-loader"));
});

test("Active & Engaged Fans is een beta tool, met de eigen API erbij", () => {
  const beta = resolveAccess("Nieuw@PSV.nl", users, []);
  assert.ok(canAccessPath(beta, "/dashboard/fans"));
  assert.ok(canAccessApi(beta, "/api/fans"));
  assert.ok(canAccessApi(beta, "/api/fans/snapshot"));

  const zonderBeta = resolveAccess("alles@psv.nl", users, []);
  assert.ok(!canAccessPath(zonderBeta, "/dashboard/fans"));
  assert.ok(!canAccessApi(zonderBeta, "/api/fans"));
  // FANdesk begint met dezelfde letters maar valt er niet onder.
  assert.ok(canAccessApi(zonderBeta, "/api/fandesk"));
});

test("paden matchen op segmentgrens en langste pagina wint", () => {
  assert.equal(pageForPath("/dashboard/ticketing-stadion/123"), "/dashboard/ticketing-stadion");
  assert.equal(pageForPath("/dashboard/auth/google/callback"), null);
  const access = resolveAccess("x@psv.nl", [{ email: "x@psv.nl", level: "custom", pages: ["/dashboard/playable"] }], []);
  assert.ok(!canAccessApi(access, "/api/playable-insights"));
});

test("wie Ticket Inzichten of Ringside mocht zien, mag Ticketing Stadion zien", () => {
  for (const old of ["/dashboard/ticket-inzichten", "/dashboard/ticket-inzichten-new"]) {
    const access = resolveAccess("x@psv.nl", [{ email: "x@psv.nl", level: "custom", pages: [old] }], []);
    assert.ok(canAccessPath(access, "/dashboard/ticketing-stadion"));
    assert.ok(canAccessPath(access, "/dashboard/ticketing-stadion/abc"));
    assert.ok(canAccessApi(access, "/api/ticketing-stadion"));
    assert.ok(canAccessApi(access, "/api/ringside/matches"));
  }
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
