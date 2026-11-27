import { ToolFout, type ChatTool } from "./toegang";

/**
 * Vaardigheden van de assistent: instructies die een admin in Beheer >
 * Assistent schrijft, zoals "zo maak je een campagne-evaluatie" of "zo
 * beoordeel je copy". Net als skills in Claude: het model ziet van elke
 * vaardigheid alleen de naam en wanneer hij geldt, en leest de instructies
 * pas met `vaardigheid_lezen` als een vraag erom vraagt. Zo kunnen er veel
 * zijn zonder dat elke vraag ze allemaal meekrijgt.
 *
 * Puur: geen opslag. Zie `vaardigheden-store.ts`.
 */

export interface Vaardigheid {
  /** Kleine letters, cijfers en streepjes; ook de naam voor het model. */
  id: string;
  /** Leesbare naam in Beheer. */
  naam: string;
  /** Wanneer het model deze vaardigheid gebruikt. Dit ziet het model bij elke vraag. */
  wanneer: string;
  /** De instructies zelf. */
  instructies: string;
  aan: boolean;
  /** Alleen voor wie een van deze pagina's mag zien; leeg is iedereen met de assistent. */
  paginas: string[];
  bijgewerktOp?: string;
  bijgewerktDoor?: string;
}

export const VAARDIGHEID_LIMIETEN = { naam: 80, wanneer: 400, instructies: 20_000, aantal: 50 } as const;

export const VAARDIGHEID_TOOL_NAAM = "vaardigheid_lezen";

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Een id uit een naam: "Copy beoordelen" wordt "copy-beoordelen". */
export function idVan(naam: string): string {
  return naam
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

function tekst(waarde: unknown, veld: string, max: number): string {
  if (typeof waarde !== "string" || !waarde.trim()) throw new Error(`${veld} is verplicht.`);
  const t = waarde.trim();
  if (t.length > max) throw new Error(`${veld} is te lang: ${t.length} tekens, hooguit ${max}.`);
  return t;
}

/**
 * Controleert een vaardigheid uit Beheer. `bestaand` is de huidige lijst;
 * `bewerkId` het id van de vaardigheid die wordt gewijzigd. Geeft de nieuwe
 * vaardigheid of een melding voor de admin.
 */
export function leesVaardigheid(
  invoer: unknown,
  bestaand: Vaardigheid[],
  geldigePaginas: readonly string[],
  bewerkId?: string
): { vaardigheid: Omit<Vaardigheid, "bijgewerktOp" | "bijgewerktDoor"> } | { fout: string } {
  if (!invoer || typeof invoer !== "object") return { fout: "Ongeldige invoer." };
  const o = invoer as Record<string, unknown>;
  try {
    const naam = tekst(o.naam, "Naam", VAARDIGHEID_LIMIETEN.naam);
    const wanneer = tekst(o.wanneer, "Wanneer", VAARDIGHEID_LIMIETEN.wanneer);
    const instructies = tekst(o.instructies, "Instructies", VAARDIGHEID_LIMIETEN.instructies);
    const id = bewerkId ?? idVan(naam);
    if (!ID.test(id)) return { fout: "Gebruik letters of cijfers in de naam." };
    if (!bewerkId && bestaand.some((v) => v.id === id)) {
      return { fout: `Er is al een vaardigheid "${id}". Kies een andere naam.` };
    }
    if (bewerkId && !bestaand.some((v) => v.id === bewerkId)) return { fout: "Deze vaardigheid bestaat niet meer." };
    if (!bewerkId && bestaand.length >= VAARDIGHEID_LIMIETEN.aantal) {
      return { fout: `Hooguit ${VAARDIGHEID_LIMIETEN.aantal} vaardigheden.` };
    }
    const paginas = Array.isArray(o.paginas)
      ? [...new Set(o.paginas.filter((p): p is string => typeof p === "string" && geldigePaginas.includes(p)))]
      : [];
    return { vaardigheid: { id, naam, wanneer, instructies, aan: o.aan !== false, paginas } };
  } catch (error) {
    return { fout: error instanceof Error ? error.message : "Ongeldige invoer." };
  }
}

/** De vaardigheden die deze collega krijgt: aan, en voor een pagina die hij mag zien. */
export function vaardighedenVoor(alle: Vaardigheid[], pages: readonly string[]): Vaardigheid[] {
  return alle.filter((v) => v.aan && (v.paginas.length === 0 || v.paginas.some((p) => pages.includes(p))));
}

/** Het stuk systeemprompt met de lijst; `null` als er geen zijn. */
export function vaardighedenContext(vaardigheden: Vaardigheid[]): string | null {
  if (vaardigheden.length === 0) return null;
  return [
    `Vaardigheden: instructies van het team voor bepaalde soorten vragen. Past een vraag bij een vaardigheid, lees die dan eerst met ${VAARDIGHEID_TOOL_NAAM} en volg de instructies, ook als je denkt het al te weten. Ze gaan voor op je algemene werkwijze, maar niet op de regels over data en bronnen. Lees alleen wat bij de vraag past.`,
    ...vaardigheden.map((v) => `- ${v.id}: ${v.wanneer}`),
  ].join("\n");
}

/** De tool waarmee het model een vaardigheid leest. */
export function vaardigheidTool(vaardigheden: Vaardigheid[]): ChatTool | null {
  if (vaardigheden.length === 0) return null;
  const ids = vaardigheden.map((v) => v.id);
  return {
    name: VAARDIGHEID_TOOL_NAAM,
    label: "Vaardigheid lezen",
    page: "/dashboard/assistent",
    geenBron: true,
    description: "Leest de instructies van een vaardigheid uit de lijst in de systeemprompt. Doe dit voordat je aan zo'n vraag begint.",
    inputSchema: {
      type: "object",
      properties: { naam: { type: "string", enum: ids, description: "Het id van de vaardigheid." } },
      required: ["naam"],
      additionalProperties: false,
    },
    lees(invoer) {
      const naam = (invoer as { naam?: unknown } | null)?.naam;
      if (typeof naam !== "string" || !ids.includes(naam)) return { fout: `Kies een van: ${ids.join(", ")}.` };
      return { invoer: { naam } };
    },
    async run(invoer) {
      const v = vaardigheden.find((x) => x.id === invoer.naam);
      if (!v) throw new ToolFout("Deze vaardigheid bestaat niet.");
      return `Vaardigheid "${v.naam}". Volg deze instructies van het team:\n\n${v.instructies}`;
    },
  };
}
