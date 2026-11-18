import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

import {
  resultText,
  type McpAuth,
  type McpServer,
  type McpServerView,
  type McpToolAnnotations,
  type McpToolSnapshot,
} from "./config";

/**
 * Praat met MCP-servers over Streamable HTTP. Alleen op de server gebruiken:
 * de tokens komen uit omgevingsvariabelen en gaan nooit naar de browser.
 *
 * Een verbinding leeft niet langer dan één request. Een Vercel-functie houdt
 * niets vast tussen requests, en zo ziet elke vraag de actuele instellingen.
 */

const CLIENT_INFO = { name: "psv-tools", version: "1.0.0" };
const CONNECT_TIMEOUT_MS = 15_000;
const LIST_TIMEOUT_MS = 20_000;
const CALL_TIMEOUT_MS = 60_000;
/** Zoveel pagina's met tools leest het beheer; daarna is er iets mis met de server. */
const MAX_TOOL_PAGES = 20;
/** Langere beschrijvingen worden afgekapt: ze gaan bij elke vraag naar het model. */
const MAX_DESCRIPTION = 4_000;

/** Ontbrekende of onjuiste instelling aan onze kant, geen fout van de server. */
export class McpConfigError extends Error {}

export function authHeaders(auth: McpAuth, env: Record<string, string | undefined> = process.env): Record<string, string> {
  if (auth.type === "geen") return {};
  const value = env[auth.envVar]?.trim();
  if (!value) throw new McpConfigError(`De omgevingsvariabele ${auth.envVar} is niet gezet.`);
  // Zelfde reden als `assertCleanSecret` bij Paid Ads: een plakfout zou anders
  // met de volledige waarde in een foutmelding belanden.
  if (/\s/.test(value)) throw new McpConfigError(`De waarde van ${auth.envVar} bevat spaties of regeleindes.`);
  return auth.type === "bearer" ? { Authorization: `Bearer ${value}` } : { [auth.header]: value };
}

/** Of het token van deze server gezet is; de waarde zelf verlaat de server nooit. */
export function authIsSet(auth: McpAuth): boolean {
  return auth.type === "geen" || Boolean(process.env[auth.envVar]?.trim());
}

async function connect(server: Pick<McpServer, "url" | "auth">, signal?: AbortSignal) {
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers: authHeaders(server.auth) },
  });
  const client = new Client(CLIENT_INFO, { capabilities: {} });
  try {
    await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS, signal });
  } catch (err) {
    await client.close().catch(() => {});
    throw err;
  }
  return { client, transport };
}

function annotationsOf(raw: Record<string, unknown> | undefined): McpToolAnnotations | undefined {
  if (!raw) return undefined;
  const result: McpToolAnnotations = {};
  if (typeof raw.title === "string") result.title = raw.title;
  for (const key of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const) {
    if (typeof raw[key] === "boolean") result[key] = raw[key] as boolean;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export interface McpInspection {
  serverName?: string;
  serverVersion?: string;
  protocolVersion?: string;
  ms: number;
  tools: McpToolSnapshot[];
}

/** Verbindt, leest de serverinfo en alle tools, en sluit weer. Voor het beheer. */
export async function inspectServer(server: Pick<McpServer, "url" | "auth">): Promise<McpInspection> {
  const start = Date.now();
  const { client, transport } = await connect(server);
  try {
    const tools: McpToolSnapshot[] = [];
    if (client.getServerCapabilities()?.tools) {
      let cursor: string | undefined;
      for (let page = 0; page < MAX_TOOL_PAGES; page++) {
        const res = await client.listTools(cursor ? { cursor } : undefined, { timeout: LIST_TIMEOUT_MS });
        for (const tool of res.tools) {
          if (tools.some((t) => t.name === tool.name)) continue;
          const annotations = annotationsOf(tool.annotations as Record<string, unknown> | undefined);
          const title = tool.title ?? annotations?.title;
          tools.push({
            name: tool.name,
            ...(title ? { title } : {}),
            description: (tool.description ?? "").slice(0, MAX_DESCRIPTION),
            inputSchema: tool.inputSchema as Record<string, unknown>,
            ...(annotations ? { annotations } : {}),
          });
        }
        cursor = res.nextCursor;
        if (!cursor) break;
      }
    }
    const version = client.getServerVersion();
    return {
      serverName: version?.name,
      serverVersion: version?.version,
      protocolVersion: transport.protocolVersion,
      ms: Date.now() - start,
      tools,
    };
  } finally {
    await client.close().catch(() => {});
  }
}

export interface McpCallResult {
  text: string;
  isError: boolean;
  ms: number;
}

/**
 * Verbindingen voor de duur van één request. Meerdere aanroepen naar dezelfde
 * server delen één verbinding; `close()` ruimt alles op.
 */
export class McpSession {
  private connections = new Map<string, Promise<Client>>();

  async callTool(
    server: Pick<McpServer, "id" | "url" | "auth">,
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<McpCallResult> {
    const start = Date.now();
    let pending = this.connections.get(server.id);
    if (!pending) {
      pending = connect(server, signal).then((c) => c.client);
      this.connections.set(server.id, pending);
      // Een mislukte verbinding niet bewaren: de volgende aanroep probeert opnieuw.
      pending.catch(() => this.connections.delete(server.id));
    }
    const client = await pending;
    const result = await client.callTool({ name: toolName, arguments: args }, undefined, {
      timeout: CALL_TIMEOUT_MS,
      signal,
    });
    return {
      text: resultText(result as { content?: unknown; structuredContent?: unknown }),
      isError: result.isError === true,
      ms: Date.now() - start,
    };
  }

  async close(): Promise<void> {
    const open = [...this.connections.values()];
    this.connections.clear();
    await Promise.all(open.map((p) => p.then((client) => client.close()).catch(() => {})));
  }
}

/**
 * De melding die een server in zijn foutantwoord zette, zoals
 * `{"jsonrpc":"2.0","error":{"message":"..."}}`. De SDK zet dat antwoord als
 * ruwe tekst in de foutmelding.
 */
export function serverMessage(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  try {
    const body = JSON.parse(text.slice(start)) as { error?: unknown; message?: unknown };
    const error = body.error as { message?: unknown } | string | undefined;
    const message = typeof error === "string" ? error : typeof error?.message === "string" ? error.message : body.message;
    return typeof message === "string" && message.trim() ? message.trim().slice(0, 300) : null;
  } catch {
    return null;
  }
}

/** Een foutmelding voor het beheer: wat er misging en waar je moet kijken. */
export function describeError(err: unknown): string {
  if (err instanceof McpConfigError) return err.message;
  if (err instanceof UnauthorizedError) {
    return "De server vraagt om in te loggen (401). Controleer het token in de omgevingsvariabele.";
  }
  if (err instanceof StreamableHTTPError) {
    if (err.code === 401) return "De server weigert het token (401). Controleer de omgevingsvariabele.";
    if (err.code === 403) return "De server geeft geen toegang (403). Heeft het token de juiste rechten?";
    if (err.code === 404) return "Op deze URL staat geen MCP-server (404). Controleer het pad, vaak eindigt het op /mcp.";
    if (err.code === 405) return "De server ondersteunt geen Streamable HTTP (405). Alleen Streamable HTTP wordt ondersteund.";
    const message = serverMessage(err.message);
    if (message) return err.code ? `De server gaf een fout (${err.code}): ${message}` : `De server gaf een fout: ${message}`;
  }
  if (err instanceof McpError && err.code === ErrorCode.RequestTimeout) return "De server reageerde niet op tijd.";
  if (err instanceof TypeError && /fetch failed/i.test(err.message)) {
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    return `De server is niet bereikbaar${cause ? ` (${cause})` : ""}. Controleer de URL.`;
  }
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 300 ? `${message.slice(0, 300)}…` : message;
}

export function serverViews(servers: McpServer[]): McpServerView[] {
  return servers.map((server) => ({ ...server, authIsSet: authIsSet(server.auth) }));
}
