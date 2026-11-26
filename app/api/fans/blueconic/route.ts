import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  blueconicApi,
  blueconicConfig,
  dagUitWaarde,
  isBlueconicIngesteld,
  kiesEigenschappen,
  leesProfielPagina,
} from "@/lib/fans/blueconic";

/**
 * Controle van de BlueConic-koppeling voor Active & Engaged Fans: kan Tools
 * inloggen, welk segment, welke eigenschappen, en hoe ziet een pagina profielen
 * eruit. Bedoeld om één keer te openen na het instellen. Toont geen SSO-id's:
 * van elke waarde alleen of hij er is en hoe lang hij is; van de logindatum
 * wel de dag.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fout(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function GET(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;
  const headers = { "Cache-Control": "no-store, max-age=0" };

  if (!isBlueconicIngesteld()) {
    return NextResponse.json({ ingesteld: false, uitleg: "Zet BLUECONIC_CLIENT_ID en BLUECONIC_CLIENT_SECRET in Vercel." }, { headers });
  }
  const config = blueconicConfig();
  const api = blueconicApi(config);
  const uit: Record<string, unknown> = { ingesteld: true, host: config.host, segmentId: config.segmentId };

  try {
    const segment = await api.get(`/segments/${config.segmentId}`);
    uit.segment =
      typeof segment === "object" && segment
        ? Object.fromEntries(Object.entries(segment as Record<string, unknown>).filter(([, v]) => typeof v !== "object"))
        : segment;
  } catch (err) {
    uit.segment = { fout: fout(err) };
  }

  let gekozen: { sso: string; login: string } | null =
    config.eigenschapSso && config.eigenschapLogin ? { sso: config.eigenschapSso, login: config.eigenschapLogin } : null;
  try {
    const k = kiesEigenschappen(await api.get("/properties", [["count", "10000"]]));
    uit.eigenschappen = { gekozen: gekozen ?? { sso: k.sso, login: k.login }, uitVercel: Boolean(gekozen), kandidaten: k.kandidaten };
    gekozen ??= { sso: k.sso, login: k.login };
  } catch (err) {
    uit.eigenschappen = { gekozen, fout: fout(err) };
  }

  try {
    const begin = Date.now();
    const params: [string, string][] = [
      ["segment", config.segmentId],
      ["count", "100"],
      ["startIndex", "0"],
    ];
    if (gekozen) params.push(["properties", `${gekozen.sso},${gekozen.login}`]);
    const body = await api.get("/profiles", params);
    const pagina = leesProfielPagina(body);
    const eerste = pagina.profielen[0];
    uit.profielen = {
      ms: Date.now() - begin,
      sleutels: typeof body === "object" && body ? Object.keys(body) : typeof body,
      opPagina: pagina.profielen.length,
      totaal: pagina.totaal,
      cursor: Boolean(pagina.volgende),
      metSsoId: gekozen ? pagina.profielen.filter((p) => p.eigenschappen.get(gekozen!.sso)?.[0]).length : null,
      metLogindatum: gekozen ? pagina.profielen.filter((p) => dagUitWaarde(p.eigenschappen.get(gekozen!.login)?.[0])).length : null,
      voorbeeld: eerste
        ? Object.fromEntries(
            [...eerste.eigenschappen].map(([id, w]) => [
              id,
              gekozen && id === gekozen.login ? w.map((x) => ({ dag: dagUitWaarde(x), vorm: x.replace(/\d/g, "9") })) : w.map((x) => ({ lengte: x.length })),
            ])
          )
        : null,
    };
  } catch (err) {
    uit.profielen = { fout: fout(err) };
  }

  return NextResponse.json(uit, { headers });
}
