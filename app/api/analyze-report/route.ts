import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";

const MAX_ROWS_PER_SHEET = 500;

function parseBasicAuth(header: string | null) {
  if (!header?.startsWith("Basic ")) return null;
  const encoded = header.slice(6).trim();
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep === -1) return null;
    return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

function authorize(sessionCookie: string | undefined): string | null {
  const expectedUser = process.env.PSV_AUTH_USER;
  const expectedPass = process.env.PSV_AUTH_PASS;

  if (!expectedUser || !expectedPass) {
    return "Beveiliging is niet geconfigureerd.";
  }
  if (!sessionCookie) return "Geen sessie gevonden. Log opnieuw in.";

  const credentials = parseBasicAuth(sessionCookie);
  if (!credentials) return "Ongeldige sessie.";
  if (credentials.user !== expectedUser || credentials.pass !== expectedPass) {
    return "Ongeldige inloggegevens.";
  }
  return null;
}

function parseExcel(buffer: ArrayBuffer): Record<string, unknown[]> {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheets: Record<string, unknown[]> = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    sheets[sheetName] = rows.slice(0, MAX_ROWS_PER_SHEET);
  }

  return sheets;
}

const SYSTEM_PROMPT = `Je bent een senior data-analist voor PSV Eindhoven met diepgaande kennis van marketing, e-mail, ticketverkoop en social media metrics.

WERKWIJZE — volg altijd deze stappen intern voordat je output genereert:
1. Begrijp de datastructuur: welke kolommen zijn er, wat zijn de datatypes, welke tijdsperiode dekt de data?
2. Bereken statistische basiswaarden per numerieke kolom (min, max, gemiddelde, uitschieters)
3. Identificeer opvallende patronen, anomalieën of uitschieters die aandacht verdienen
4. Bepaal het rapport-type en kies de meest informatieve visualisaties
5. Formuleer concrete, actionable aanbevelingen — geen vage observaties

RAPPORT-TYPES:
- campaign_performance: e-mailcampagnes (opens, clicks, CTR, bounces, unsubscribes, conversies)
- ticket_sales: ticketverkoop (kaarten, bezetting, revenue, evenementen, zitplaatsen)
- social_media: social media (bereik, impressies, likes, shares, comments, volgers)
- general: overige data

BRANCHE-BENCHMARKS (gebruik als referentie bij de analyse):
E-mail marketing:
- Open rate: <20% = slecht, 20-30% = gemiddeld, >30% = goed, >40% = uitstekend
- CTR: <1% = slecht, 1-3% = gemiddeld, >3% = goed
- Bounce rate: >2% = zorgwekkend
- Unsubscribe rate: >0.5% = zorgwekkend

Social media (sport):
- Engagement rate: <1% = laag, 1-3% = gemiddeld, >3% = goed
- Bereikgroei: vergelijk met vorige periodes

VERPLICHT RESPONSE FORMAT (retourneer ALLEEN geldige JSON, geen markdown, geen tekst buiten de JSON):
{
  "reportType": "campaign_performance" | "ticket_sales" | "social_media" | "general",
  "title": "Korte beschrijvende titel van het rapport",
  "summary": "2-3 zinnen met de meest opvallende bevinding én een concrete aanbeveling",
  "kpis": [
    { "label": "KPI naam", "value": "Geformatteerde waarde", "change": "+8% t.o.v. vorige periode" }
  ],
  "charts": [
    {
      "type": "bar" | "line" | "pie",
      "title": "Grafiek titel",
      "dataKey": "kolom naam voor de y-as (numerieke waarde)",
      "categoryKey": "kolom naam voor de x-as of categorie",
      "data": [{ "key": "waarde" }]
    }
  ],
  "insights": ["Concreet inzicht met cijfer", "Anomalie of uitschieter die opvalt", "Concrete aanbeveling met onderbouwing"]
}

REGELS:
- Maximaal 3 zinvolle grafieken; kies het type op basis van de data (trend → line, vergelijking → bar, verdeling → pie)
- KPI's: 3-6 meest relevante cijfers, vergelijk met benchmarks waar mogelijk
- Inzichten: minimaal één anomalie/uitschieter benoemen, minimaal één concrete aanbeveling met cijfermatige onderbouwing
- Formatteer getallen leesbaar: "12.450" of "€ 45.230" of "24,3%"
- Schrijf altijd in het Nederlands
- Als data te beperkt is voor een bepaald element, laat dat element weg (geen lege arrays tenzij echt geen data)`;

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY ontbreekt in de server omgeving." },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Kon het formulier niet lezen." },
      { status: 400 }
    );
  }

  const extraPrompt = (formData.get("prompt") as string | null)?.trim() || null;
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Geen bestand ontvangen." }, { status: 400 });
  }

  const validTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ];
  const validExtensions = [".xlsx", ".xls"];
  const hasValidType = validTypes.includes(file.type);
  const hasValidExtension = validExtensions.some((ext) =>
    file.name.toLowerCase().endsWith(ext)
  );

  if (!hasValidType && !hasValidExtension) {
    return NextResponse.json(
      { error: "Ongeldig bestandstype. Upload een .xlsx of .xls bestand." },
      { status: 400 }
    );
  }

  let sheets: Record<string, unknown[]>;
  try {
    const buffer = await file.arrayBuffer();
    sheets = parseExcel(buffer);
  } catch {
    return NextResponse.json(
      { error: "Kon het Excel bestand niet lezen. Controleer of het bestand niet beschadigd is." },
      { status: 400 }
    );
  }

  const sheetNames = Object.keys(sheets);
  if (sheetNames.length === 0) {
    return NextResponse.json(
      { error: "Het Excel bestand bevat geen bruikbare data." },
      { status: 400 }
    );
  }

  const dataDescription = sheetNames
    .map((name) => {
      const rows = sheets[name];
      if (rows.length === 0) return null;
      const columns = Object.keys(rows[0] as object);
      return `Sheet "${name}": ${rows.length} rijen, kolommen: ${columns.join(", ")}\nData (eerste 50 rijen):\n${JSON.stringify(rows.slice(0, 50), null, 2)}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  if (!dataDescription) {
    return NextResponse.json(
      { error: "Het Excel bestand bevat geen bruikbare data." },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyseer de volgende Excel data en retourneer een JSON rapport:${extraPrompt ? `\n\nExtra instructies van de gebruiker: ${extraPrompt}` : ""}\n\n${dataDescription}`,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Extract JSON from response (Claude may wrap it in markdown code blocks)
    const jsonMatch =
      responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
      responseText.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Claude retourneerde geen geldige JSON analyse." },
        { status: 500 }
      );
    }

    const analysisJson = JSON.parse(jsonMatch[1].trim());
    return NextResponse.json(analysisJson);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Claude retourneerde geen geldige JSON analyse." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      {
        error: "Analyse mislukt.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
