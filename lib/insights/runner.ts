import Anthropic from "@anthropic-ai/sdk";
import { effortVoor, plek, tekstUit, type PlekId } from "@/lib/modellen/config";
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

/**
 * Ruim: nieuwere modellen denken eerst, en dat denkwerk telt mee in deze
 * limiet. Het antwoord zelf is een paar duizend tokens.
 */
const DEFAULT_MAX_TOKENS = 8000;

type Schema = Record<string, unknown>;

const TEKST: Schema = { type: "string" };

/** Een object waarin elk veld verplicht is en er niets bij mag. */
export function object(velden: Record<string, Schema>): Schema {
  return { type: "object", properties: velden, required: Object.keys(velden), additionalProperties: false };
}

/** Een uitgelicht item (topPerformer en dergelijke): tekstvelden, of null. */
export function uitgelicht(...velden: string[]): Schema {
  return { anyOf: [object(Object.fromEntries(velden.map((v) => [v, TEKST]))), { type: "null" }] };
}

/** De vorm die elke analyse deelt, plus de velden die alleen deze analyse heeft. */
export function insightSchema(extra: Record<string, Schema> = {}): Schema {
  return object({
    summary: TEKST,
    highlights: {
      type: "array",
      items: object({
        type: { type: "string", enum: ["trend", "anomaly", "achievement", "warning", "opportunity"] },
        text: TEKST,
      }),
    },
    recommendations: { type: "array", items: TEKST },
    ...extra,
  });
}

export async function runInsightAnalysis<T>(args: {
  /** De plek in Beheer > Model garden; bepaalt het model. */
  plek: PlekId;
  systemPrompt: string;
  userMessage: string;
  /** De vorm van het antwoord; de API dwingt hem af (structured outputs). */
  schema: Schema;
  maxTokens?: number;
}): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new InsightConfigError("ANTHROPIC_API_KEY ontbreekt.");

  const client = new Anthropic({ apiKey });
  const actief = await modelVoor(args.plek);
  const message = await client.messages.create({
    model: actief.model,
    max_tokens: args.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: args.systemPrompt,
    messages: [{ role: "user", content: args.userMessage }],
    output_config: {
      ...effortVoor(actief, plek(args.plek)),
      format: { type: "json_schema", schema: args.schema },
    },
  });

  if ((message.stop_reason as string) === "refusal") {
    throw new InsightAnalysisError("Het model weigerde deze analyse.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new InsightAnalysisError("De analyse werd afgekapt; probeer het opnieuw.");
  }

  const responseText = tekstUit(message.content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    // Terugval voor het geval er toch tekst omheen staat.
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || responseText.match(/(\{[\s\S]*\})/);
    try {
      parsed = jsonMatch ? JSON.parse(jsonMatch[1].trim()) : undefined;
    } catch {
      parsed = undefined;
    }
  }
  if (!parsed || typeof parsed !== "object") throw new InsightAnalysisError("Analyse retourneerde geen geldige JSON.");

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
