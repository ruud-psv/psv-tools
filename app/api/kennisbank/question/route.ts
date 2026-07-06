import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildKennisbankContext } from "@/lib/kennisbank";
import { authorize } from "@/lib/auth";

/* ---------- Types ---------- */

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: ConversationMessage[];
}

/* ---------- System Prompt ---------- */

const ROLE_INSTRUCTIONS = `Je bent de kennisbank-assistent van PSV Digital Marketing. Je beantwoordt vragen van collega's over de tools en platforms die PSV gebruikt (Maileon, TwoCircles, Playable, Azerion, Typeform, enz.), UITSLUITEND op basis van de KENNISBANK hieronder.

REGELS:
- Antwoord alleen op basis van de KENNISBANK. Verzin niets. Staat het antwoord er niet in, zeg dat eerlijk en verwijs naar het Digital Marketing-team.
- Schrijf altijd in het Nederlands, kort en concreet.
- Noem de tool waar je antwoord vandaan komt.
- Let bij regels en taxonomie op de details: waardes die "altijd meenemen", "afhankelijk van de briefing" of "altijd uitsluiten" zijn, benoem je expliciet en verwissel je nooit.
- Gebruik **vet** voor nadruk en "-" voor opsommingen waar passend.
- Bij onvolledige informatie: zeg wat je wél weet en wat de gebruiker het beste checkt.`;

/* ---------- POST Handler ---------- */

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[kennisbank/question] ANTHROPIC_API_KEY ontbreekt.");
    return NextResponse.json({ error: "Server configuratie fout" }, { status: 500 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  if (!body.messages?.length)
    return NextResponse.json({ error: "Geen vraag opgegeven." }, { status: 400 });

  const systemPrompt = `${ROLE_INSTRUCTIONS}\n\nKENNISBANK:\n${buildKennisbankContext()}`;
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
