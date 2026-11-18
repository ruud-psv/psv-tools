import { ToolFout, type ChatTool } from "../assistent/toegang";
import { McpSession } from "./client";
import { activeTools, checkToolInput, modelInputSchema, modelToolNames } from "./config";
import { readServers } from "./store";

/**
 * De tools van MCP-servers voor de assistent. Een collega krijgt de tools van
 * de servers waarvan hij de gekoppelde pagina mag zien, en alleen de tools die
 * een admin in Beheer > MCP-servers heeft aangezet.
 *
 * Het model krijgt de beschrijving en het schema uit de opslag, zoals een admin
 * ze heeft goedgekeurd. Er wordt pas verbinding gemaakt als het model een tool
 * aanroept; `sessie.close()` sluit na de vraag alle verbindingen.
 */
export async function mcpToolsVoor(
  pages: readonly string[],
  signal?: AbortSignal
): Promise<{ tools: ChatTool[]; sessie: McpSession }> {
  const sessie = new McpSession();
  const tools: ChatTool[] = [];
  const servers = (await readServers()).filter((s) => s.enabled && pages.includes(s.page));

  for (const server of servers) {
    const namen = modelToolNames(server.id, server.tools.map((t) => t.name));
    for (const tool of activeTools(server)) {
      tools.push({
        name: namen.get(tool.name)!,
        label: `${server.name} · ${tool.title ?? tool.name}`,
        page: server.page,
        description: `${tool.description || tool.title || tool.name}\n\n(Via MCP, rechtstreeks van ${server.name}.)`,
        inputSchema: modelInputSchema(tool.inputSchema),
        lees(invoer) {
          const gelezen = checkToolInput(tool.inputSchema, invoer);
          return "error" in gelezen ? { fout: gelezen.error } : { invoer: gelezen.input };
        },
        async run(invoer) {
          const uitkomst = await sessie.callTool(server, tool.name, invoer, signal);
          console.info(`[assistent] mcp ${server.id}/${tool.name}: ${uitkomst.isError ? "fout" : "ok"} in ${uitkomst.ms} ms`);
          // De melding van de server mag het model lezen, zodat het de invoer kan aanpassen.
          if (uitkomst.isError) throw new ToolFout(`${server.name} gaf een fout: ${uitkomst.text.slice(0, 2_000)}`);
          return uitkomst.text;
        },
      });
    }
  }
  return { tools, sessie };
}
