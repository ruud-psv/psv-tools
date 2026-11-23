import Anthropic from "@anthropic-ai/sdk";
import type { PlekId } from "@/lib/modellen/config";
import { modelVoor } from "@/lib/modellen/store";

export class InsightConfigError extends Error {}
export class InsightAnalysisError extends Error {
  // Uitgeschreven veld in plaats van een parameter property: die kan
  // `node --test` (alleen types strippen) niet lezen.
  readonly details?: string;
  constructor(message: string, details?: string) {
    super(message);
    this.details = details;
  }
}

const DEFAULT_MAX_TOKENS = 2048;

export async function runInsightAnalysis<T>(args: {
  /** De plek in Beheer > Model garden; bepaalt het model. */
  plek: PlekId;
  systemPrompt: string;
  userMessage: string;
  /** Alleen meegeven wanneer de verwachte JSON niet in 2048 tokens past. */
  maxTokens?: number;
}): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new InsightConfigError("ANTHROPIC_API_KEY ontbreekt.");

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: (await modelVoor(args.plek)).model,
    max_tokens: args.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: args.systemPrompt,
    messages: [{ role: "user", content: args.userMessage }],
  });

  const responseText = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch =
    responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    responseText.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) throw new InsightAnalysisError("Analyse retourneerde geen geldige JSON.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[1].trim());
  } catch {
    throw new InsightAnalysisError("Analyse retourneerde geen geldige JSON.");
  }

  return normalizeArrays(parsed) as T;
}

function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return String(o.text ?? o.value ?? o.content ?? JSON.stringify(v));
  }
  return String(v ?? "");
}

function normalizeArrays(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const result = input as Record<string, unknown>;
  if (Array.isArray(result.recommendations)) {
    result.recommendations = (result.recommendations as unknown[]).map(toStr);
  }
  if (Array.isArray(result.highlights)) {
    result.highlights = (result.highlights as unknown[]).map((h) => {
      if (h && typeof h === "object") {
        const o = h as Record<string, unknown>;
        return { type: String(o.type ?? "trend"), text: toStr(o.text ?? h) };
      }
      return { type: "trend", text: toStr(h) };
    });
  }
  return result;
}
