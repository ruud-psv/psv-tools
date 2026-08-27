import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireEmail } from "@/lib/api-session";
import { buildPaidAdsContext } from "@/lib/paid-ads/analysis";
import { PAID_ADS_ROLE } from "@/lib/insights/paid-ads";
import type { PaidAdsResponse } from "@/lib/paid-ads/types";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: ConversationMessage[];
  data: PaidAdsResponse;
}

const QUESTION_RULES = `
REGELS:
- Beantwoord de gestelde vraag direct en concreet
- Noem campagnenamen, bedragen en percentages waar relevant
- Schrijf altijd in het Nederlands
- Gebruik **vetgedrukte tekst** voor nadruk en - voor opsommingen waar passend
- Als de data onvoldoende is om de vraag te beantwoorden, zeg dat dan eerlijk`;

export async function POST(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session.error;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[paid-ads/insights/question] ANTHROPIC_API_KEY ontbreekt.");
    return NextResponse.json({ error: "Server configuratie fout" }, { status: 500 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  if (!body.messages?.length) {
    return NextResponse.json({ error: "Geen berichten opgegeven." }, { status: 400 });
  }
  if (!body.data?.campaigns?.length) {
    return NextResponse.json(
      { error: "Geen data beschikbaar om de vraag te beantwoorden." },
      { status: 400 }
    );
  }

  const systemPrompt = `${PAID_ADS_ROLE}\n${QUESTION_RULES}\n\nHUIDIGE DATA:\n${buildPaidAdsContext(body.data)}`;
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
