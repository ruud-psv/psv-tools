import { getVoorbeeld, isVoorbeeldId, voorbeeldVerlopen } from "@/lib/maileon/concept-opslag";

/**
 * Het voorbeeld van een concept-mail, zonder login (de middleware laat
 * /share/ door). De HTML komt van Maileon of uit de Mail Builder; hij draait
 * in een sandbox zonder scripts, en zoekmachines slaan hem over. Er staan geen
 * persoonsgegevens in: Maileon vult een algemeen contact in.
 */

export const dynamic = "force-dynamic";

const HEADERS = {
  "Content-Security-Policy":
    "sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "private, no-store",
};

function melding(status: number, titel: string, tekst: string): Response {
  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titel}</title></head><body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem;"><h1 style="font-size: 1.25rem;">${titel}</h1><p>${tekst}</p></body></html>`;
  return new Response(html, { status, headers: { ...HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isVoorbeeldId(id)) return melding(404, "Voorbeeld niet gevonden", "Deze link klopt niet.");

  const record = await getVoorbeeld(id).catch((err) => {
    console.error("[share/mail] lezen mislukt:", err instanceof Error ? err.message : err);
    return null;
  });
  if (!record) return melding(404, "Voorbeeld niet gevonden", "Deze link klopt niet of is weggehaald.");
  if (voorbeeldVerlopen(record)) {
    return melding(410, "Voorbeeld verlopen", "Dit voorbeeld is ouder dan twee maanden. Vraag Digital Marketing om een nieuwe link.");
  }

  return new Response(record.html, { headers: { ...HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}
