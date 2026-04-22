import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildAnalysisContext } from "../route";

/* ---------- Auth ---------- */

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
  if (!expectedUser || !expectedPass) return "Beveiliging is niet geconfigureerd.";
  if (!sessionCookie) return "Geen sessie gevonden. Log opnieuw in.";
  const credentials = parseBasicAuth(sessionCookie);
  if (!credentials) return "Ongeldige sessie.";
  if (credentials.user !== expectedUser || credentials.pass !== expectedPass) return "Ongeldige inloggegevens.";
  return null;
}

/* ---------- Types ---------- */

interface MailingSummary {
  id: number;
  name: string;
  scheduleTime: string;
  recipients: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  bounces: number;
  unsubscriptions: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  clickToOpenRate: number;
}

interface Totals {
  mailings: number;
  recipients: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  bounces: number;
  unsubscriptions: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgBounceRate: number;
  avgUnsubRate: number;
  avgCtor: number;
}

interface RequestBody {
  question: string;
  mailings: MailingSummary[];
  totals: Totals;
  dateRange: { preset: string; from: string; to: string };
}

/* ---------- System Prompt ---------- */

const SYSTEM_PROMPT = `Je bent een senior e-mail marketing strateeg voor PSV Eindhoven. Je beantwoordt vragen over Maileon mailing-prestaties op basis van de aangeleverde data.

CONTEXT: PSV is een profvoetbalclub. Mailings gaan over wedstrijden, merchandise, seizoenskaarten, acties, en clubnieuws.

REGELS:
- Beantwoord alleen de gestelde vraag — geef geen uitgebreide analyse
- Wees concreet: noem mailingnamen, datums en percentages waar relevant
- Schrijf altijd in het Nederlands
- Maximaal 4 zinnen tenzij de vraag een langere toelichting vereist
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

  if (!body.question?.trim()) return NextResponse.json({ error: "Geen vraag opgegeven." }, { status: 400 });
  if (!body.mailings?.length) return NextResponse.json({ error: "Geen data beschikbaar om de vraag te beantwoorden." }, { status: 400 });

  const context = buildAnalysisContext(body.mailings, body.totals, body.dateRange);
  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `DATA:\n${context}\n\nVRAAG: ${body.question.trim()}`,
        },
      ],
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
