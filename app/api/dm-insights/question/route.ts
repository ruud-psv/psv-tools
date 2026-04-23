import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildAnalysisContext } from "@/lib/dm-analysis";
import type { MailingSummary, Totals } from "@/lib/dm-analysis";
import { authorize } from "@/lib/auth";


/* ---------- Types ---------- */

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: ConversationMessage[];
  mailings: MailingSummary[];
  totals: Totals;
  dateRange: { preset: string; from: string; to: string };
}

/* ---------- System Prompt ---------- */

const ROLE_INSTRUCTIONS = `Je bent een senior e-mail marketing strateeg voor PSV Eindhoven. Je beantwoordt vragen over Maileon mailing-prestaties op basis van de aangeleverde data.

CONTEXT: PSV is een profvoetbalclub. Mailings gaan over wedstrijden, merchandise, seizoenskaarten, acties, en clubnieuws.

REGELS:
- Beantwoord de gestelde vraag direct en concreet
- Noem mailingnamen, datums en percentages waar relevant
- Schrijf altijd in het Nederlands
- Gebruik **vetgedrukte tekst** voor nadruk en - voor opsommingen waar passend
- Als de data onvoldoende is om de vraag te beantwoorden, zeg dat dan eerlijk`;

/* ---------- POST Handler ---------- */

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "ANTHROPIC_API_KEY ontbreekt in de server omgeving." }, { status: 500 });

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  if (!body.messages?.length) return NextResponse.json({ error: "Geen berichten opgegeven." }, { status: 400 });
  if (!body.mailings?.length) return NextResponse.json({ error: "Geen data beschikbaar om de vraag te beantwoorden." }, { status: 400 });

  const context = buildAnalysisContext(body.mailings, body.totals, body.dateRange);
  const systemPrompt = `${ROLE_INSTRUCTIONS}\n\nHUIDIGE DATA:\n${context}`;
  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const answer = message.content[0].type === "text" ? message.content[0].text.trim() : "";
    return NextResponse.json({ answer });
  } catch (error) {
    return NextResponse.json(
      { error: "Vraag beantwoorden mislukt.", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
