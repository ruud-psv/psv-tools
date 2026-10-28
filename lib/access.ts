import { betaTools, insightTools, knowledgeTools, makeTools } from "@/lib/tools";

/**
 * Gebruikersbeheer: wie mag welke pagina zien. Nieuwe collega's worden in de
 * Azure portal toegevoegd; hier staat alleen welk niveau iemand krijgt. Wie
 * niet in de lijst staat — ook iemand die nog nooit heeft ingelogd — krijgt
 * `DEFAULT_LEVEL`.
 *
 * Dit bestand is puur (geen opslag), zodat middleware, server en tests
 * dezelfde regels gebruiken. De opslag staat in `lib/access-store.ts`.
 */

export type AccessLevel = "admin" | "all" | "all-beta" | "custom";

export const ACCESS_LEVELS: { value: AccessLevel; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Alle pagina's, beta tools en gebruikersbeheer." },
  { value: "all-beta", label: "Alles + beta", description: "Alle pagina's en de beta tools." },
  { value: "all", label: "Alles", description: "Alle pagina's, zonder de beta tools." },
  { value: "custom", label: "Specifieke pagina's", description: "Alleen de aangevinkte pagina's." },
];

/** Het niveau van iedereen die (nog) niet in de lijst staat. */
export const DEFAULT_LEVEL: AccessLevel = "all-beta";

export const USER_ADMIN_HREF = "/dashboard/gebruikersbeheer";

export interface UserAccess {
  email: string;
  level: AccessLevel;
  /** Alleen gebruikt bij `custom`: de hrefs van de toegestane pagina's. */
  pages: string[];
  updatedAt?: string;
  updatedBy?: string;
}

/** Wat iemand uiteindelijk mag: de hrefs van de pagina's en of hij admin is. */
export interface EffectiveAccess {
  level: AccessLevel;
  isAdmin: boolean;
  pages: string[];
}

/** De pagina's waar je per gebruiker een vinkje voor kunt zetten, per groep. */
export const PAGE_GROUPS: { title: string; beta: boolean; pages: { name: string; href: string }[] }[] = [
  { title: "Tools", beta: false, pages: makeTools },
  { title: "Kennisbank", beta: false, pages: knowledgeTools },
  { title: "Inzichten", beta: false, pages: insightTools },
  { title: "Beta tools", beta: true, pages: betaTools },
].map((g) => ({ ...g, pages: g.pages.map(({ name, href }) => ({ name, href })) }));

const REGULAR_PAGES = PAGE_GROUPS.filter((g) => !g.beta).flatMap((g) => g.pages.map((p) => p.href));
const BETA_PAGES = PAGE_GROUPS.filter((g) => g.beta).flatMap((g) => g.pages.map((p) => p.href));
const ALL_PAGES = [...REGULAR_PAGES, ...BETA_PAGES];

/**
 * API-routes die bij één of meer pagina's horen. Wie geen van die pagina's mag
 * zien, krijgt een 403. Routes die ook door de openbare deellinks
 * (`/share/...`) of de rapportage-generator worden gebruikt staan hier bewust
 * niet in — anders breekt een deellink voor iemand met beperkte toegang.
 */
const API_PAGES: Record<string, string[]> = {
  "/api/aangrenzende-stoelen": ["/dashboard/aangrenzende-stoelen"],
  "/api/analytics-insights": ["/dashboard/web-verkeer"],
  "/api/bunny-upload": ["/dashboard/mail-builder"],
  "/api/contact-filter-import": ["/dashboard/contact-filter-import"],
  "/api/database": ["/dashboard/database"],
  "/api/dm-insights": ["/dashboard/dm-performance"],
  "/api/fandesk": ["/dashboard/fandesk"],
  "/api/groepsfoto": ["/dashboard/groepsfoto"],
  "/api/kennisbank": ["/dashboard/kennisbank"],
  "/api/kleurplaat": ["/dashboard/kleurplaat"],
  "/api/mail-builder": ["/dashboard/mail-builder"],
  "/api/maileon-upload": ["/dashboard/mail-builder"],
  "/api/paid-ads": ["/dashboard/paid-ads"],
  "/api/playable": ["/dashboard/landingspaginas"],
  "/api/playable-insights": ["/dashboard/landingspaginas"],
  "/api/ringside": ["/dashboard/ticket-inzichten-new", "/dashboard/aangrenzende-stoelen"],
  "/api/submit": ["/dashboard/copy-generator", "/dashboard/huisstijl-checker"],
  "/api/ticket-insights": ["/dashboard/ticket-inzichten"],
  "/api/ticketing-herdgang": ["/dashboard/ticketing-herdgang"],
  "/api/utm-links": ["/dashboard/utm-builder"],
  "/api/utm-taxonomy": ["/dashboard/utm-builder"],
};

export const USERS_API = "/api/users";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** `ADMIN_EMAILS` (komma- of puntkommagescheiden) is altijd admin, zodat je jezelf niet kunt buitensluiten. */
export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map(normalizeEmail)
    .filter(Boolean);
}

export function pagesForLevel(level: AccessLevel, custom: string[] = []): string[] {
  switch (level) {
    case "admin":
    case "all-beta":
      return [...ALL_PAGES];
    case "all":
      return [...REGULAR_PAGES];
    case "custom":
      return ALL_PAGES.filter((href) => custom.includes(href));
  }
}

export function resolveAccess(
  email: string,
  users: UserAccess[],
  adminEmails: string[]
): EffectiveAccess {
  const key = normalizeEmail(email);
  const level: AccessLevel = adminEmails.includes(key)
    ? "admin"
    : users.find((u) => u.email === key)?.level ?? DEFAULT_LEVEL;
  const custom = users.find((u) => u.email === key)?.pages ?? [];
  return { level, isAdmin: level === "admin", pages: pagesForLevel(level, custom) };
}

/** Valt `pathname` onder `prefix` op een segmentgrens? (`/api/playable` ≠ `/api/playable-insights`) */
function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** De pagina waar een dashboard-pad bij hoort; `null` voor paden zonder eigen recht (zoals het overzicht). */
export function pageForPath(pathname: string): string | null {
  if (under(pathname, USER_ADMIN_HREF)) return USER_ADMIN_HREF;
  // Langste match eerst: `/dashboard/ticket-inzichten-new` mag niet als `/dashboard/ticket-inzichten` tellen.
  const match = ALL_PAGES.filter((href) => under(pathname, href)).sort((a, b) => b.length - a.length)[0];
  return match ?? null;
}

export function canAccessPath(access: EffectiveAccess, pathname: string): boolean {
  const page = pageForPath(pathname);
  if (page === null) return true;
  if (page === USER_ADMIN_HREF) return access.isAdmin;
  return access.pages.includes(page);
}

export function canAccessApi(access: EffectiveAccess, pathname: string): boolean {
  if (under(pathname, USERS_API)) return access.isAdmin;
  const prefix = Object.keys(API_PAGES).find((p) => under(pathname, p));
  if (!prefix) return true;
  return API_PAGES[prefix].some((href) => access.pages.includes(href));
}

/** Controleert en schoont een gebruiker op die via de beheerpagina binnenkomt. */
export function sanitizeUserAccess(input: unknown): Omit<UserAccess, "updatedAt" | "updatedBy"> | null {
  if (!input || typeof input !== "object") return null;
  const { email, level, pages } = input as Record<string, unknown>;
  if (typeof email !== "string" || !isValidEmail(normalizeEmail(email))) return null;
  if (!ACCESS_LEVELS.some((l) => l.value === level)) return null;
  const chosen = Array.isArray(pages) ? pages.filter((p): p is string => typeof p === "string") : [];
  return {
    email: normalizeEmail(email),
    level: level as AccessLevel,
    pages: level === "custom" ? ALL_PAGES.filter((href) => chosen.includes(href)) : [],
  };
}
