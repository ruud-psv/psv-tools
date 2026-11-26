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

  // Dezelfde eerste pagina op vier manieren: zonder eigenschappen, met alleen de
  // logindatum, met alleen het SSO-id, en met beide. Komen er alleen profielen
  // zonder het SSO-id, dan houdt BlueConic ze tegen om PII.
  const e = eigenschappen;
  const varianten: [string, string[]][] = [
    ["zonderEigenschappen", []],
    ...(e
      ? ([
          ["alleenLogindatum", [e.login]],
          ["alleenSsoId", [e.sso]],
          ["beide", [e.sso, e.login]],
        ] as [string, string[]][])
      : []),
  ];
  const proeven: Record<string, unknown> = {};
  for (const [naam, props] of varianten) {
    try {
      const begin = Date.now();
      const vraag = profielVraag(config.segmentId, props, "*", 5);
      const body = await api.get(vraag.pad, vraag.params);
      const pagina = leesProfielPagina(body);
      const eerste = pagina.profielen[0];
      proeven[naam] = {
        ms: Date.now() - begin,
        opPagina: pagina.profielen.length,
        totaal: pagina.totaal,
        volgendeCursor: Boolean(pagina.volgende),
        metSsoId: e ? pagina.profielen.filter((p) => p.eigenschappen.get(e.sso)?.[0]).length : null,
        metLogindatum: e ? pagina.profielen.filter((p) => dagUitWaarde(p.eigenschappen.get(e.login)?.[0])).length : null,
        // Van het eerste profiel alleen welke eigenschappen er zijn, en van de logindatum de dag.
        eigenschapIds: eerste ? [...eerste.eigenschappen.keys()].sort().slice(0, 60) : null,
        logindag: e && eerste ? dagUitWaarde(eerste.eigenschappen.get(e.login)?.[0]) : null,
        // Alles behalve de profielen zelf: zo is te zien hoe BlueConic de vraag las.
        rest:
          typeof body === "object" && body && !Array.isArray(body)
            ? Object.fromEntries(Object.entries(body as Record<string, unknown>).filter(([k]) => k !== "profiles"))
            : null,
      };
    } catch (err) {
      proeven[naam] = { fout: fout(err) };
    }
  }
  uit.profielen = proeven;

  return NextResponse.json(uit, { headers });
}
