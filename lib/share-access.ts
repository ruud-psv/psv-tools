import { NextResponse } from "next/server";
import { verifyShareToken } from "@/lib/share-token";
import { getReport, type ReportRecord } from "@/lib/reports";

/**
 * Het rapport achter een deeltoken, voor de data-endpoints die een deelpagina
 * zonder login aanroept. Anders een kant-en-klare foutresponse:
 * - 401 bij een ontbrekend, vervalst, gewijzigd of verlopen token;
 * - 403 bij een geldig token dat niet voor een rapport is (bv. een DM-deellink)
 *   of bij een ander rapport hoort dan `reportId`;
 * - 404 als het rapport niet (meer) bestaat.
 * Of het verzoek binnen het rapport valt, toetst de aanroeper met `lib/share-scope.ts`.
 */
export async function reportForShareToken(
  token: string | null | undefined,
  reportId?: string
): Promise<{ report: ReportRecord } | { error: NextResponse }> {
  const share = verifyShareToken(token);
  if (!share) {
    return { error: NextResponse.json({ error: "Ongeldig of verlopen token." }, { status: 401 }) };
  }
  if (share.kind !== "report") {
    return { error: NextResponse.json({ error: "Dit token geeft geen toegang tot deze data." }, { status: 403 }) };
  }
  if (reportId !== undefined && share.id !== reportId) {
    return { error: NextResponse.json({ error: "Token hoort niet bij dit rapport." }, { status: 403 }) };
  }
  const report = await getReport(share.id);
  if (!report) {
    return { error: NextResponse.json({ error: "Rapport niet gevonden." }, { status: 404 }) };
  }
  return { report };
}

/** Hoe lang een token van een rapport-deelpagina geldt. De pagina haalt op tijd een nieuw. */
export const REPORT_TOKEN_TTL_SECONDS = 24 * 60 * 60;
