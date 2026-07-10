import { put, get, del } from "@vercel/blob";
import type { CombinedInsightResult } from "@/lib/insights/combined";

/** Opgeslagen gecombineerde AI-analyse per rapport. Zo hoeft een page-refresh
 *  geen nieuwe (kostbare) AI-call te doen — alleen de knop triggert dat. */
export interface StoredAnalysis {
  result: CombinedInsightResult;
  sig: string; // data-signatuur op moment van analyse, voor "nieuwe data"-detectie
  generatedAt: string;
}

const PREFIX = "rapportage-analyses/";
const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

function pathFor(id: string): string {
  return `${PREFIX}${id}.json`;
}

export async function saveAnalysis(id: string, data: StoredAnalysis): Promise<void> {
  if (!ID_RE.test(id)) return;
  await put(pathFor(id), JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function getAnalysis(id: string): Promise<StoredAnalysis | null> {
  if (!ID_RE.test(id)) return null;
  try {
    const result = await get(pathFor(id), { access: "private", useCache: false });
    if (!result || !result.stream) return null;
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text) as StoredAnalysis;
    if (!parsed || typeof parsed !== "object" || !parsed.result) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function deleteAnalysis(id: string): Promise<void> {
  if (!ID_RE.test(id)) return;
  try {
    await del(pathFor(id));
  } catch {
    // best-effort opruimen
  }
}
