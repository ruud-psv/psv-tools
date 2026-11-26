import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import {
  blueconicApi,
  blueconicConfig,
  dagUitWaarde,
  isBlueconicIngesteld,
  kiesEigenschappen,
  leesEigenschappenLijst,
  leesProfielPagina,
  probeerScopes,
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
  const uit: Record<string, unknown> = { ingesteld: true, host: config.host, segmentId: config.segmentId, scopes: config.scopes || "(geen)" };

  // Welke rechten zitten er in het token (zonder het token zelf).
  try {
    uit.token = await api.tokenInfo();
  } catch (err) {
    uit.token = { fout: fout(err) };
  }

  // Elke schrijfwijze van de scopes: welke geeft een token dat het segment en
  // profielen mag lezen? De winnaar kan in BLUECONIC_SCOPES.
  try {
    uit.scopeProeven = await probeerScopes(config);
  } catch (err) {
    uit.scopeProeven = { fout: fout(err) };
  }

  // Hoeveel profielen BlueConic telt: zonder filter, en met het segment onder
  // twee mogelijke namen. Zo is te zien of het aan de rechten of aan de vraag ligt.
  const totalen: Record<string, unknown> = {};
  for (const [naam, params] of [
    ["zonderFilter", []],
    ["segment", [["segment", config.segmentId]]],
    ["segmentId", [["segmentId", config.segmentId]]],
  ] as [string, [string, string][]][]) {
    try {
      const p = leesProfielPagina(await api.get("/profiles", [...params, ["count", "1"], ["startIndex", "0"]]));
      totalen[naam] = { totaal: p.totaal, opPagina: p.profielen.length };
    } catch (err) {
      totalen[naam] = { fout: fout(err) };
    }
  }
  uit.totalen = totalen;

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
    const lijst = await leesEigenschappenLijst(api);
    const k = kiesEigenschappen(lijst.body);
    uit.eigenschappen = { pad: lijst.pad, gekozen: gekozen ?? { sso: k.sso, login: k.login }, uitVercel: Boolean(gekozen), kandidaten: k.kandidaten };
    gekozen ??= { sso: k.sso, login: k.login };
  } catch (err) {
    uit.eigenschappen = { gekozen, uitVercel: Boolean(gekozen), fout: fout(err) };
  }

  // Een pagina zonder eigenschappen te vragen: welke eigenschap-ID's komen er
  // standaard mee, en welke lijken een datum. Alleen ID's en aantallen.
  try {
    const pagina = leesProfielPagina(await api.get("/profiles", [["segment", config.segmentId], ["count", "20"], ["startIndex", "0"]]));
    const perId = new Map<string, { profielen: number; datums: number }>();
    for (const p of pagina.profielen) {
      for (const [id, w] of p.eigenschappen) {
        const s = perId.get(id) ?? { profielen: 0, datums: 0 };
        s.profielen++;
        if (w.length && dagUitWaarde(w[0]) && /^\d{11,14}$|^\d{4}-\d{2}-\d{2}/.test(w[0].trim())) s.datums++;
        perId.set(id, s);
      }
    }
    uit.standaardEigenschappen = { opPagina: pagina.profielen.length, ids: Object.fromEntries([...perId].sort()) };
  } catch (err) {
    uit.standaardEigenschappen = { fout: fout(err) };
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
