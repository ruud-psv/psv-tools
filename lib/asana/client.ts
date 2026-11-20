/**
 * Asana voor de mailflow, in de testfase: taken lezen uit het testproject,
 * een reactie plaatsen en een taak naar een andere sectie zetten.
 *
 * Alleen het testproject. Elke taak wordt eerst opgehaald en gecontroleerd
 * (`vanTestproject`) voordat er iets in komt te staan. Het testproject is
 * privé, heeft geen regels en geen custom fields, zodat een reactie of een
 * andere sectie daar niets in gang zet. In het echte productiebord kan het
 * verplaatsen van een taak wél regels starten; kijk dat na voordat het
 * project hier wordt verruimd.
 *
 * Inloggen met `ASANA_MVA` (een personal access token, of later dat van een
 * serviceaccount). Reacties komen op naam van de eigenaar van het token.
 *
 * API: https://app.asana.com/api/1.0, antwoorden in `{ data }`, fouten in
 * `{ errors: [{ message }] }`.
 */

export const ASANA_API = "https://app.asana.com/api/1.0";

/** "TEST | Mail-automatisering Claude | niet gebruiken": privé, zonder regels en custom fields. */
export const TESTPROJECT = "1220736359247687";

const GID = /^\d{1,30}$/;

export class AsanaConfigError extends Error {}

export class AsanaFout extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** `ASANA_MVA` in Vercel; `ASANA_TOKEN` werkt ook, als reserve. */
export function asanaConfig(env: Record<string, string | undefined> = process.env): { token: string } {
  const token = (env.ASANA_MVA || env.ASANA_TOKEN)?.trim();
  if (!token) throw new AsanaConfigError("Asana-koppeling ontbreekt: zet ASANA_MVA in Vercel.");
  return { token };
}

export function isGid(waarde: string): boolean {
  return GID.test(waarde);
}

export interface AsanaTaakKort {
  gid: string;
  naam: string;
  sectie?: string;
  dueOn?: string;
}

export interface AsanaTaak extends AsanaTaakKort {
  notes: string;
  url?: string;
  /** De GID's van de projecten waar de taak in staat. */
  projecten: string[];
  /** Custom fields als naam → getoonde waarde (leeg in het testproject). */
  velden: Record<string, string>;
}

export interface AsanaBijlage {
  gid: string;
  naam: string;
  isAfbeelding: boolean;
}

export interface AsanaApi {
  takenInProject(project: string): Promise<AsanaTaakKort[]>;
  /** Open taken in een sectie, met beschrijving: genoeg om de brief te lezen. */
  takenInSectie(sectieGid: string): Promise<AsanaTaak[]>;
  taak(gid: string): Promise<AsanaTaak>;
  bijlagen(taakGid: string): Promise<AsanaBijlage[]>;
  plaatsReactie(taakGid: string, htmlText: string): Promise<void>;
  secties(project: string): Promise<{ gid: string; naam: string }[]>;
  naarSectie(sectieGid: string, taakGid: string): Promise<void>;
}

export function vanTestproject(taak: Pick<AsanaTaak, "projecten">): boolean {
  return taak.projecten.includes(TESTPROJECT);
}

/* ---------- Antwoorden lezen ---------- */

interface RuweTaak {
  gid?: unknown;
  name?: unknown;
  notes?: unknown;
  due_on?: unknown;
  permalink_url?: unknown;
  memberships?: { project?: { gid?: unknown }; section?: { name?: unknown } }[];
  custom_fields?: { name?: unknown; display_value?: unknown }[];
}

function tekst(waarde: unknown): string {
  return typeof waarde === "string" ? waarde : "";
}

export function leesTaak(ruw: RuweTaak, project?: string): AsanaTaak {
  const memberships = Array.isArray(ruw.memberships) ? ruw.memberships : [];
  const projecten = memberships.map((m) => tekst(m.project?.gid)).filter(Boolean);
  const lidmaatschap = memberships.find((m) => !project || tekst(m.project?.gid) === project) ?? memberships[0];
  const velden: Record<string, string> = {};
  for (const veld of Array.isArray(ruw.custom_fields) ? ruw.custom_fields : []) {
    const naam = tekst(veld.name).trim();
    const waarde = tekst(veld.display_value).trim();
    if (naam && waarde) velden[naam] = waarde;
  }
  const sectie = tekst(lidmaatschap?.section?.name);
  const dueOn = tekst(ruw.due_on);
  const url = tekst(ruw.permalink_url);
  return {
    gid: tekst(ruw.gid),
    naam: tekst(ruw.name),
    notes: tekst(ruw.notes),
    projecten,
    velden,
    ...(sectie && { sectie }),
    ...(dueOn && { dueOn }),
    ...(url && { url }),
  };
}

function asanaMelding(tekst: string): string {
  try {
    const json = JSON.parse(tekst) as { errors?: { message?: unknown }[] };
    const berichten = (json.errors ?? []).map((e) => e.message).filter((m): m is string => typeof m === "string");
    if (berichten.length) return berichten.join(" ");
  } catch {
    // Geen JSON: dan de tekst zelf.
  }
  return tekst.trim().slice(0, 300);
}

/** HTML-veilige tekst voor een reactie in Asana. */
export function escapeAsana(tekst: string): string {
  return tekst.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------- De client ---------- */

const TAAK_VELDEN = "name,notes,due_on,permalink_url,memberships.project.gid,memberships.section.name,custom_fields.name,custom_fields.display_value";

export function asanaApi(config: { token: string }, doeFetch: typeof fetch = fetch): AsanaApi {
  async function vraag<T>(methode: "GET" | "POST", pad: string, opties: { params?: Record<string, string>; data?: unknown } = {}): Promise<T> {
    const url = new URL(`${ASANA_API}${pad}`);
    for (const [k, v] of Object.entries(opties.params ?? {})) url.searchParams.set(k, v);
    const res = await doeFetch(url, {
      method: methode,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
        ...(opties.data !== undefined && { "Content-Type": "application/json" }),
      },
      body: opties.data !== undefined ? JSON.stringify({ data: opties.data }) : undefined,
      cache: "no-store",
    });
    const antwoord = await res.text();
    if (!res.ok) throw new AsanaFout(asanaMelding(antwoord) || res.statusText, res.status);
    if (!antwoord) return undefined as T;
    return (JSON.parse(antwoord) as { data: T }).data;
  }

  function gid(waarde: string): string {
    if (!isGid(waarde)) throw new AsanaFout(`Ongeldig Asana-ID: ${waarde.slice(0, 40)}`, 400);
    return waarde;
  }

  return {
    async takenInProject(project) {
      const ruw = await vraag<RuweTaak[]>("GET", `/projects/${gid(project)}/tasks`, {
        params: { opt_fields: "name,due_on,memberships.project.gid,memberships.section.name", completed_since: "now", limit: "100" },
      });
      return (ruw ?? []).map((t) => {
        const { gid: g, naam, sectie, dueOn } = leesTaak(t, project);
        return { gid: g, naam, ...(sectie && { sectie }), ...(dueOn && { dueOn }) };
      });
    },
    async takenInSectie(sectieGid) {
      const ruw = await vraag<RuweTaak[]>("GET", `/sections/${gid(sectieGid)}/tasks`, {
        params: { opt_fields: TAAK_VELDEN, completed_since: "now", limit: "100" },
      });
      return (ruw ?? []).map((t) => leesTaak(t, TESTPROJECT));
    },
    async taak(taakGid) {
      return leesTaak(await vraag<RuweTaak>("GET", `/tasks/${gid(taakGid)}`, { params: { opt_fields: TAAK_VELDEN } }), TESTPROJECT);
    },
    async bijlagen(taakGid) {
      const ruw = await vraag<{ gid?: unknown; name?: unknown }[]>("GET", "/attachments", {
        params: { parent: gid(taakGid), opt_fields: "name" },
      });
      return (ruw ?? []).map((b) => {
        const naam = tekst(b.name);
        return { gid: tekst(b.gid), naam, isAfbeelding: /\.(jpe?g|png|gif|webp)$/i.test(naam) };
      });
    },
    async plaatsReactie(taakGid, htmlText) {
      await vraag("POST", `/tasks/${gid(taakGid)}/stories`, { data: { html_text: htmlText } });
    },
    async secties(project) {
      const ruw = await vraag<{ gid?: unknown; name?: unknown }[]>("GET", `/projects/${gid(project)}/sections`, { params: { opt_fields: "name" } });
      return (ruw ?? []).map((s) => ({ gid: tekst(s.gid), naam: tekst(s.name) }));
    },
    async naarSectie(sectieGid, taakGid) {
      await vraag("POST", `/sections/${gid(sectieGid)}/addTask`, { data: { task: gid(taakGid) } });
    },
  };
}
