import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  blueconicApi,
  blueconicConfig,
  dagUitWaarde,
  eigenschappenVoor,
  isBlueconicIngesteld,
  leesProfielPagina,
  profielVraag,
  zoekSegment,
} from "@/lib/fans/blueconic";

/**
 * Controle van de BlueConic-koppeling voor Active & Engaged Fans: kan Tools
 * inloggen, staat het segment er (met het aantal profielen volgens BlueConic),
 * welke eigenschappen, en hoe ziet de eerste pagina profielen eruit. Bedoeld om
 * te openen na het instellen. Toont geen SSO-id's: van elke waarde alleen of hij
 * er is en hoe lang hij is; van de logindatum wel de dag.
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
    uit.token = await api.tokenInfo();
  } catch (err) {
    uit.token = { fout: fout(err) };
    return NextResponse.json(uit, { headers });
  }

  try {
    uit.segment = (await zoekSegment(api, config.segmentId)) ?? { fout: "Het segment staat niet in GET /segments." };
  } catch (err) {
    uit.segment = { fout: fout(err) };
  }

  let eigenschappen: { sso: string; login: string } | null = null;
  try {
    eigenschappen = await eigenschappenVoor(api, config);
    uit.eigenschappen = { ...eigenschappen, uitVercel: Boolean(config.eigenschapSso && config.eigenschapLogin) };
  } catch (err) {
    uit.eigenschappen = { fout: fout(err) };
  }

  try {
    const begin = Date.now();
    const vraag = profielVraag(config.segmentId, eigenschappen ? [eigenschappen.sso, eigenschappen.login] : [], "*", 20);
    const body = await api.get(vraag.pad, vraag.params);
    const pagina = leesProfielPagina(body);
    const e = eigenschappen;
    uit.profielen = {
      ms: Date.now() - begin,
      sleutels: typeof body === "object" && body ? Object.keys(body) : typeof body,
      opPagina: pagina.profielen.length,
      totaal: pagina.totaal,
      volgendeCursor: Boolean(pagina.volgende),
      metSsoId: e ? pagina.profielen.filter((p) => p.eigenschappen.get(e.sso)?.[0]).length : null,
      metLogindatum: e ? pagina.profielen.filter((p) => dagUitWaarde(p.eigenschappen.get(e.login)?.[0])).length : null,
      voorbeeld: pagina.profielen[0]
        ? Object.fromEntries(
            [...pagina.profielen[0].eigenschappen].map(([id, w]) => [
              id,
              e && id === e.login ? w.map((x) => ({ dag: dagUitWaarde(x), vorm: x.replace(/\d/g, "9") })) : w.map((x) => ({ lengte: x.length })),
            ])
          )
        : null,
    };
  } catch (err) {
    uit.profielen = { fout: fout(err) };
  }

  return NextResponse.json(uit, { headers });
}
