import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";

export const runtime = "nodejs";

/** Alleen de eigen CDN van Replicate — deze route mag geen open proxy worden. */
const TOEGESTANE_HOSTS = ["replicate.delivery", "pbxt.replicate.delivery"];

function isToegestaan(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  return TOEGESTANE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

/** Maakt een veilige, herkenbare bestandsnaam. */
function bestandsnaam(ruw: string | null): string {
  const schoon = (ruw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 50);
  return `kleurplaat-phoxy${schoon ? `-${schoon}` : ""}.png`;
}

/**
 * Haalt de gegenereerde afbeelding op bij Replicate en geeft hem door.
 *
 * Twee redenen om dat niet rechtstreeks vanuit de browser te doen: bij een
 * download zijn de bestandsnaam en de download-header niet te sturen, en bij
 * `?inline=1` komt de tekening van onze eigen oorsprong — anders raakt het
 * canvas dat de plaat samenstelt "besmet" en is er geen PNG meer uit te halen.
 */
export async function GET(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  const ruweUrl = req.nextUrl.searchParams.get("url");
  if (!ruweUrl) {
    return NextResponse.json({ error: "Geen afbeelding opgegeven." }, { status: 400 });
  }

  let doel: URL;
  try {
    doel = new URL(ruweUrl);
  } catch {
    return NextResponse.json({ error: "Ongeldige afbeeldings-URL." }, { status: 400 });
  }
  if (!isToegestaan(doel)) {
    return NextResponse.json(
      { error: "Deze afbeelding komt niet van Replicate en wordt niet doorgegeven." },
      { status: 400 }
    );
  }

  const res = await fetch(doel, { cache: "no-store" });
  if (!res.ok || !res.body) {
    return NextResponse.json(
      { error: `Afbeelding ophalen mislukt (HTTP ${res.status}). Waarschijnlijk is de link verlopen; genereer hem opnieuw.` },
      { status: 502 }
    );
  }

  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const headers: Record<string, string> = {
    "Content-Type": res.headers.get("content-type") ?? "image/png",
    "Cache-Control": "no-store",
  };
  if (!inline) {
    headers["Content-Disposition"] =
      `attachment; filename="${bestandsnaam(req.nextUrl.searchParams.get("naam"))}"`;
  }

  return new NextResponse(res.body, { headers });
}
