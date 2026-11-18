/**
 * Welke tools de assistent voor iemand mag gebruiken, en of de invoer van een
 * tool klopt. Puur (geen opslag, geen data), zodat de route en de tests
 * dezelfde regels gebruiken.
 *
 * Elke tool hoort bij een pagina van PSV Tools. Wie die pagina niet mag zien,
 * krijgt de tool niet: de assistent kan dan ook niet bij die data.
 */

export interface ToolVeld {
  type: "string";
  description: string;
  /** Alleen waarden die hierop passen worden doorgelaten. */
  pattern?: string;
}

export interface AssistentTool {
  /** Naam voor het model: kleine letters en underscores. */
  name: string;
  /** Wat de chat toont als de tool is gebruikt. */
  label: string;
  /** De pagina waar deze data bij hoort; bepaalt wie de tool krijgt. */
  page: string;
  description: string;
  velden: Record<string, ToolVeld>;
  verplicht: string[];
  run(invoer: Record<string, string>): Promise<string>;
}

/**
 * Een tool zoals de chat hem aan het model geeft en uitvoert: de eigen tools
 * hierboven en de tools van MCP-servers (`lib/mcp/assistent.ts`). Voor beide
 * geldt hetzelfde: de pagina bepaalt wie hem krijgt, de invoer wordt eerst
 * gecontroleerd, en de uitkomst is tekst.
 */
export interface ChatTool {
  name: string;
  label: string;
  page: string;
  description: string;
  inputSchema: { type: "object"; [key: string]: unknown };
  lees(invoer: unknown): { invoer: Record<string, unknown> } | { fout: string };
  run(invoer: Record<string, unknown>): Promise<string>;
}

/**
 * Een fout die het model mag lezen en waarop het de aanroep kan aanpassen,
 * zoals de melding van een MCP-server over een ongeldig veld. Andere fouten
 * krijgt het model niet te zien.
 */
export class ToolFout extends Error {}

export function alsChatTool(tool: AssistentTool): ChatTool {
  return {
    name: tool.name,
    label: tool.label,
    page: tool.page,
    description: tool.description,
    inputSchema: invoerSchema(tool),
    lees: (invoer) => leesInvoer(tool, invoer),
    // `lees` gaf alleen tekstvelden door (zie `leesInvoer`).
    run: (invoer) => tool.run(invoer as Record<string, string>),
  };
}

export function toolsVoor<T extends Pick<AssistentTool, "page">>(pages: readonly string[], tools: readonly T[]): T[] {
  return tools.filter((tool) => pages.includes(tool.page));
}

/** Het JSON-schema van de invoer, zoals het model het krijgt. */
export function invoerSchema(tool: Pick<AssistentTool, "velden" | "verplicht">) {
  return {
    type: "object" as const,
    properties: Object.fromEntries(
      Object.entries(tool.velden).map(([naam, { type, description }]) => [naam, { type, description }])
    ),
    required: tool.verplicht,
    additionalProperties: false,
  };
}

/**
 * Controleert wat het model als invoer meegaf. Geeft de opgeschoonde velden
 * terug, of een melding die het model kan lezen om het opnieuw te proberen.
 */
export function leesInvoer(
  tool: Pick<AssistentTool, "velden" | "verplicht">,
  invoer: unknown
): { invoer: Record<string, string> } | { fout: string } {
  const bron = invoer && typeof invoer === "object" && !Array.isArray(invoer) ? (invoer as Record<string, unknown>) : {};
  const schoon: Record<string, string> = {};
  for (const [naam, veld] of Object.entries(tool.velden)) {
    const waarde = bron[naam];
    if (waarde === undefined || waarde === null || waarde === "") {
      if (tool.verplicht.includes(naam)) return { fout: `Het veld "${naam}" ontbreekt.` };
      continue;
    }
    if (typeof waarde !== "string") return { fout: `Het veld "${naam}" moet tekst zijn.` };
    const tekst = waarde.trim();
    if (veld.pattern && !new RegExp(veld.pattern).test(tekst)) {
      return { fout: `Het veld "${naam}" heeft een ongeldige waarde: ${veld.description}` };
    }
    schoon[naam] = tekst;
  }
  return { invoer: schoon };
}
