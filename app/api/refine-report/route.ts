import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { authorize } from "@/lib/auth";


const SYSTEM_PROMPT = `Je bent een senior data-analist voor PSV Eindhoven. Je ontvangt een bestaande rapportage als JSON en een opdracht van de gebruiker om iets te wijzigen of toe te voegen.

Pas de rapportage aan op basis van de opdracht. Regels:
- Retourneer altijd de VOLLEDIGE bijgewerkte rapportage als JSON (zelfde schema als de input)
- Wijzig alleen wat de opdracht vraagt; laat de rest ongewijzigd
- Als de opdracht vraagt om iets toe te voegen (bijv. een grafiek of inzicht), voeg het toe aan de bestaande lijst
- Als de opdracht vraagt om iets te verwijderen of aan te passen, doe dat gericht
- Schrijf altijd in het Nederlands
- Retourneer ALLEEN geldige JSON, geen markdown, geen tekst buiten de JSON

JSON schema (zelfde als input):
{
  "reportType": string,
  "title": string,
  "summary": string,
  "kpis": [{ "label": string, "value": string, "change": string }],
  "charts": [{
    "type": "bar"|"bar-horizontal"|"bar-grouped"|"bar-stacked"|"line"|"area"|"area-stacked"|"pie"|"composed"|"scatter",
    "title": string,
    "categoryKey": string,
    "dataKey": string,
    "dataKeys": string[],
    "seriesTypes": Record<string, "bar"|"line"|"area">,
    "data": array
  }],
  "insights": [string]
}`;

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY ontbreekt in de server omgeving." },
      { status: 500 }
    );
  }

  const body = await req.json();
  const { currentResult, prompt } = body;

  if (!currentResult || !prompt?.trim()) {
    return NextResponse.json({ error: "Ongeldig verzoek." }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Huidige rapportage:\n${JSON.stringify(currentResult, null, 2)}\n\nOpdracht: ${prompt.trim()}`,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    const jsonMatch =
      responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
      responseText.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Claude retourneerde geen geldige JSON." },
        { status: 500 }
      );
    }

    return NextResponse.json(JSON.parse(jsonMatch[1].trim()));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Claude retourneerde geen geldige JSON." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "Verfijning mislukt.", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
