import { get, put } from "@vercel/blob";

import type { McpServer } from "./config";

/**
 * De MCP-servers staan als één JSON-bestand in Vercel Blob, net als de
 * toegangslijst van het beheer. Er zijn hooguit een handvol servers en alleen
 * admins schrijven, dus één bestand is genoeg.
 *
 * De assistent leest de lijst bij elke vraag; daarom een korte cache per
 * serverinstantie. Een wijziging is binnen `CACHE_MS` overal actief.
 */
const PATH = "beheer/mcp-servers.json";
const CACHE_MS = 15_000;

let cache: { servers: McpServer[]; at: number } | null = null;

async function load(): Promise<McpServer[]> {
  const result = await get(PATH, { access: "private", useCache: false });
  if (!result?.stream) return [];
  const data = JSON.parse(await new Response(result.stream).text()) as { servers?: McpServer[] };
  return Array.isArray(data.servers) ? data.servers : [];
}

/**
 * Voor de assistent: bij een storing de laatst bekende lijst, of geen servers.
 * Een vraag aan de assistent werkt dan nog, alleen zonder MCP-tools.
 */
export async function readServers(): Promise<McpServer[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.servers;
  try {
    const servers = await load();
    cache = { servers, at: Date.now() };
    return servers;
  } catch (err) {
    console.error("[mcp] Serverlijst lezen mislukt:", err instanceof Error ? err.message : err);
    return cache?.servers ?? [];
  }
}

/**
 * Voor het beheer: altijd vers, en een storing gooit een fout. Anders zou een
 * wijziging op een lege lijst worden opgeslagen en alle servers wissen.
 */
export async function readServersStrict(): Promise<McpServer[]> {
  const servers = await load();
  cache = { servers, at: Date.now() };
  return servers;
}

export async function writeServers(servers: McpServer[]): Promise<void> {
  const sorted = [...servers].sort((a, b) => a.name.localeCompare(b.name, "nl"));
  await put(PATH, JSON.stringify({ servers: sorted }, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  cache = { servers: sorted, at: Date.now() };
}
