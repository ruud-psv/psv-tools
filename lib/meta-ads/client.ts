import type { MetaApi } from "../mcp/servers/meta-ads";
import { GRAPH_HOST, MetaFout, redact, type MetaConfig } from "./rapport";

/**
 * Leest de Graph API van Meta voor de MCP-server, met het token en account
 * van Paid Ads. Alleen GET: deze client kan niets aanmaken of wijzigen. Het
 * token gaat als header mee, nooit in de URL.
 */
export function metaApi(config: MetaConfig, signal?: AbortSignal): MetaApi {
  async function get<T>(pad: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${GRAPH_HOST}/${config.apiVersion}/${pad}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    const text = await res.text();
    let body: (T & { error?: { message?: string; code?: number; error_user_msg?: string } }) | null = null;
    try {
      body = JSON.parse(text);
    } catch {
      // Valt hieronder door naar de foutmelding.
    }
    if (!res.ok || !body || body.error) {
      const melding = body?.error?.error_user_msg ?? body?.error?.message ?? text.slice(0, 300);
      const code = body?.error?.code ? ` (code ${body.error.code})` : "";
      throw new MetaFout(redact(`${melding}${code}`, config.token), res.status);
    }
    return body;
  }

  return {
    accountPath: config.accountPath,
    account: () => get(config.accountPath, { fields: "name,currency,timezone_name" }),
    insights: (params) => get(`${config.accountPath}/insights`, params),
    objecten: (edge, params) => get(`${config.accountPath}/${edge}`, params),
  };
}
