import { canUseTool, modelToolNames, type McpServer } from "@/lib/mcp/config";
import { alsChatTool, type ChatTool } from "./toegang";
import { ASSISTENT_TOOLS } from "./tools";
import { stukTools } from "./stukken-tools";
import { creativeTools } from "./creative-tools";
import { VAARDIGHEID_TOOL_NAAM } from "./vaardigheden";

/**
 * Alle tools van de assistent, voor het overzicht in Beheer > Assistent. De
 * eigen tools worden hier opgebouwd zoals de chat-route dat doet (met lege
 * opslag en callbacks: er wordt niets uitgevoerd), zodat de lijst nooit
 * achterloopt op de code. De MCP-tools komen uit de opslag van Beheer > MCP.
 */

export type ToolStatus = "aan" | "uit" | "server uit" | "gewijzigd" | "geblokkeerd";

export interface CatalogusTool {
  /** De naam zoals het model hem ziet. */
  naam: string;
  label: string;
  beschrijving: string;
  /** De pagina die bepaalt wie de tool krijgt. */
  pagina: string;
  /** De invoervelden, met een sterretje voor verplichte. */
  velden: string[];
  status: ToolStatus;
  /** Extra voorwaarde, zoals "als Meta is ingesteld". */
  voorwaarde?: string;
  /** Telt niet als bron onder het antwoord. */
  geenBron?: boolean;
}

export interface CatalogusGroep {
  id: string;
  titel: string;
  uitleg: string;
  /** Alleen bij MCP: de id van de server, om naar Beheer > MCP te linken. */
  mcpServer?: string;
  tools: CatalogusTool[];
}

function velden(schema: ChatTool["inputSchema"]): string[] {
  const props = (schema.properties ?? {}) as Record<string, unknown>;
  const verplicht = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  return Object.keys(props).map((k) => (verplicht.has(k) ? `${k}*` : k));
}

function regel(tool: ChatTool, extra: Partial<CatalogusTool> = {}): CatalogusTool {
  return {
    naam: tool.name,
    label: tool.label,
    beschrijving: tool.description,
    pagina: tool.page,
    velden: velden(tool.inputSchema),
    status: "aan",
    ...(tool.geenBron && { geenBron: true }),
    ...extra,
  };
}

const niets = async () => {
  throw new Error("Alleen voor het overzicht.");
};

/** De eigen tools van PSV Tools, in groepen. */
export function eigenTools(): CatalogusGroep[] {
  const stukken = stukTools({
    gesprekId: "0".repeat(32),
    email: "overzicht",
    opslag: { get: async () => null, save: niets },
    vandaag: "2000-01-01",
    onGewijzigd: () => undefined,
  });
  const creatives = creativeTools({ haal: niets, onGetoond: () => undefined, beeldVoorStuk: niets });

  return [
    {
      id: "data",
      titel: "Data uit PSV Tools",
      uitleg: "Dezelfde data als de pagina's van PSV Tools. Een collega krijgt een tool alleen als hij de pagina mag zien.",
      tools: ASSISTENT_TOOLS.map((t) => regel(alsChatTool(t))),
    },
    {
      id: "creatives",
      titel: "Paid Ads creatives",
      uitleg: "Meta-advertenties als kaart in de chat laten zien en hun beeld in een rapport of deck zetten.",
      tools: creatives.map((t) => regel(t, { voorwaarde: "als Meta Ads is ingesteld" })),
    },
    {
      id: "stukken",
      titel: "Stukken",
      uitleg: "Een rapport of slide deck bij het gesprek maken en bijwerken. Iedereen met de assistent krijgt deze tools.",
      tools: stukken.map((t) => regel(t, { pagina: "/dashboard/assistent" })),
    },
    {
      id: "vaardigheden",
      titel: "Vaardigheden",
      uitleg: "De instructies uit de vaardigheden hieronder lezen.",
      tools: [
        {
          naam: VAARDIGHEID_TOOL_NAAM,
          label: "Vaardigheid lezen",
          beschrijving:
            "Leest de instructies van een vaardigheid. Het model ziet bij elke vraag de naam en wanneer van de vaardigheden die aan staan.",
          pagina: "/dashboard/assistent",
          velden: ["naam*"],
          status: "aan",
          voorwaarde: "als er een vaardigheid aan staat",
          geenBron: true,
        },
      ],
    },
  ];
}

/** De tools van de MCP-servers, per server, met of ze aan staan. */
export function mcpGroepen(servers: McpServer[]): CatalogusGroep[] {
  return servers.map((server) => {
    const namen = modelToolNames(server.id, server.tools.map((t) => t.name));
    return {
      id: `mcp-${server.id}`,
      titel: `MCP: ${server.name}`,
      uitleg: server.enabled
        ? "Aan- en uitzetten per tool in het tabblad MCP Servers."
        : "Deze server staat uit; de assistent krijgt geen van deze tools.",
      mcpServer: server.id,
      tools: server.tools.map((t) => ({
        naam: namen.get(t.name) ?? t.name,
        label: `${server.name} · ${t.title ?? t.name}`,
        beschrijving: t.description || t.title || t.name,
        pagina: server.page,
        velden: velden({ type: "object", ...(t.inputSchema as Record<string, unknown>) }),
        status: !server.enabled
          ? "server uit"
          : t.changed
            ? "gewijzigd"
            : !canUseTool(t)
              ? "geblokkeerd"
              : t.enabled
                ? "aan"
                : "uit",
      })),
    };
  });
}
