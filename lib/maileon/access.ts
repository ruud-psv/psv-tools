/**
 * Wie mag mailingresultaten en -inhoud uit Maileon opvragen via
 * `/api/maileon` en `/api/maileon/archive`?
 *
 * - Met een geldige sessie: alles, zoals DM Performance en de Rapportage
 *   generator nodig hebben.
 * - Zonder sessie, met een geldig deeltoken (`?token=`, zie
 *   `lib/share-token.ts`): alleen de periode en de mailings van de gedeelde
 *   weergave (`maileonScopeFromShare` in `lib/dm-scope.ts`).
 * - Anders niets (401). Een geldig token dat geen DM-data deelt, of van een
 *   verwijderd rapport is, krijgt 403.
 *
 * De middleware laat API-routes zonder sessie door, dus deze controle hoort in
 * de routes zelf. De routes staan bewust niet in `API_PAGES` in
 * `lib/access.ts`, omdat de openbare deelpagina's ze ook gebruiken.
 */

import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth";
import { readShareToken } from "@/lib/share-token";
import { getReport } from "@/lib/reports";
import { maileonScopeFromShare, type MaileonScope } from "@/lib/dm-scope";

export type MaileonAccess =
  /** Ingelogd: geen beperking. */
  | { ok: true; scope: null }
  /** Deeltoken: alleen deze periode en zoektermen. */
  | { ok: true; scope: MaileonScope }
  | { ok: false; status: 401 | 403; error: string };

/** Laadt een opgeslagen rapport; in tests te vervangen. */
export type ReportLoader = (id: string) => Promise<{ sources?: unknown } | null>;

export async function resolveMaileonAccess(
  { sessionCookie, token }: { sessionCookie?: string | null; token?: string | null },
  loadReport: ReportLoader = getReport
): Promise<MaileonAccess> {
  if (sessionCookie && verifySession(sessionCookie)) return { ok: true, scope: null };

  if (!token) {
    return { ok: false, status: 401, error: "Geen geldige sessie. Log opnieuw in." };
  }
  const payload = readShareToken(token);
  if (!payload) {
    return { ok: false, status: 401, error: "Deze deellink is ongeldig. Vraag om een nieuwe link." };
  }

  let report: { sources?: unknown } | null = null;
  if (payload.kind === "report") {
    report = typeof payload.id === "string" ? await loadReport(payload.id) : null;
    if (!report) return { ok: false, status: 403, error: "Dit rapport bestaat niet meer." };
  }

  const scope = maileonScopeFromShare(payload, report);
  if (!scope) {
    return { ok: false, status: 403, error: "Deze deellink geeft geen toegang tot mailings." };
  }
  return { ok: true, scope };
}

/** `resolveMaileonAccess` voor een binnenkomend API-request: sessiecookie en `?token=`. */
export function maileonAccessFor(req: NextRequest, loadReport?: ReportLoader): Promise<MaileonAccess> {
  return resolveMaileonAccess(
    {
      sessionCookie: req.cookies.get("psv_session")?.value,
      token: req.nextUrl.searchParams.get("token"),
    },
    loadReport
  );
}
