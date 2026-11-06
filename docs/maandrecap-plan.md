# Maandrecap — schets

> Status: **schets, staat op de backlog**. Er is nog niets gebouwd.
> Werktitel "Maandrecap" (in de thread: "Monthly recap"). Route `/dashboard/maandrecap`,
> deelpagina `/share/maandrecap`.

## 1. Wat het wordt

Eens per maand laten we collega's binnen de afdeling, en net daarbuiten, zien wat we de
afgelopen maand hebben neergezet. Een mooie release als HOME, AWAY, THIRD of EFTELING hebben we
niet elke maand, dus de recap leunt op **cijfers**:

- hoeveel fans we hebben bereikt (e-mails verstuurd, pageviews),
- hoeveel nieuwe SSO-records erbij zijn gekomen,
- de KPI's **Active Fans** en **Engaged Fans**.

Daaronder komen de nieuwe mijlpalen van de maand en wat er nieuw is in PSV Tools.

**Afbakening.** Campagnes staan niet in de recap. Campagnestats horen bij de marketeers, en
collega's lopen daarvoor via hen.

Per kalendermaand is er **één editie**. Bij het publiceren zetten we de cijfers vast, zodat de
link over een half jaar nog steeds hetzelfde laat zien. Dat is het verschil met de Rapportage
generator: die rekent steeds opnieuw ("laatste 30 dagen").

## 2. Opbouw van een editie

Van boven naar beneden:

| # | Blok | Inhoud | Bron |
|---|---|---|---|
| 1 | **Kop** | "Oktober 2026" en een intro van 1 à 2 zinnen | Handmatig (later een AI-voorstel) |
| 2 | **Fans bereikt** | Mails verstuurd, pageviews, nieuwe SSO-records, Active Fans, Engaged Fans. Per cijfer het verschil met de vorige maand | Automatisch + handmatig, zie §3 |
| 3 | **Nieuwe mijlpalen** | 3 à 5 regels, bv. nieuwe homepage psv.nl, redesign e-mailtemplate, platformstrategie | Handmatig |
| 4 | **Nieuw in PSV Tools** | 3 à 6 regels in gewone taal | Voorstel uit de gemergde PR's, daarna geredigeerd |
| 5 | **Voetnoot** | Bronnen, meetmoment en definities van de KPI's | Automatisch |

## 3. De cijfers

| Cijfer | Bron | Hoe | Al in Tools? |
|---|---|---|---|
| **Mails verstuurd** | Maileon | Som van `recipients` over de mailings met verzenddatum in de maand (`/api/maileon?from=&to=`) | Ja, zoals DM Performance |
| Unieke opens (klein, onder mails) | Maileon | Som van `uniqueOpens` | Ja |
| **Pageviews** | GA4 | `screenPageViews` per property: psv.nl, ticketshop, fanstore, acties | Ja, zoals Web Verkeer |
| **Nieuwe SSO-records** | Database-tool | `growthByMonth["2026-10"]` van de actieve bronversie | Ja, via upload |
| **Active Fans** | — | Handmatig invullen | Nee |
| **Engaged Fans** | — | Handmatig invullen | Nee |
| App-opens | — | Niet in de eerste versie | Nee |

Waar we op letten:

- **SSO-export moet ná het maandeinde zijn.** Is `lastRecordDate` van de actieve bron ouder dan de
  laatste dag van de maand, dan is "nieuw" te laag. De tool waarschuwt dan, met dezelfde regel als
  `sourceEndsBeforeCampaign` in de Database-tool. De oplossing is een verse export uploaden.
- **Mails verstuurd is niet hetzelfde als unieke personen.** Wie vier mails kreeg, telt vier
  keer. Dat zetten we in de voetnoot.
- **Maandgrenzen in Nederlandse tijd**: 1 t/m 31 oktober in Europe/Amsterdam.
- **Handmatige KPI's krijgen een definitie** die op de pagina staat. Zonder vaste definitie kun
  je ze niet tussen maanden vergelijken.

## 4. Werkwijze per maand

1. Begin van de maand: iemand maakt de editie "Oktober 2026" aan. De tool haalt de automatische
   cijfers op voor 1 t/m 31 oktober, plus die van september voor de vergelijking.
2. De redacteur vult Active Fans en Engaged Fans in, schrijft de nieuwe mijlpalen en loopt het
   voorstel voor "Nieuw in PSV Tools" na.
3. Een conceptweergave laat zien hoe de editie eruitziet voor lezers.
4. Publiceren zet de snapshot vast. Er gaan daarna geen API-calls meer uit. Corrigeren blijft
   mogelijk, en dan verschijnt "bijgewerkt op".
5. Deellink kopiëren en in Teams of een mail zetten.

## 5. Techniek: wat we hergebruiken

| Onderdeel | Hoe |
|---|---|
| Ingang | Entry in `insightTools` (`lib/tools.ts`). Dan staat hij vanzelf in de sidebar en het gebruikersbeheer |
| Toegang | `"/api/maandrecap": ["/dashboard/maandrecap"]` in `API_PAGES` (`lib/access.ts`) |
| Opslag | Vercel Blob, `maandrecap/<YYYY-MM>.json`, net als `lib/reports.ts` |
| Maileon en GA4 | De ophaallogica uit `app/api/maileon/route.ts` en `app/api/analytics/route.ts` naar `lib/` halen, zodat de recap ze server-side aanroept in plaats van via HTTP de eigen API |
| SSO | `getActiveVersion()` uit `lib/database/source-store.ts` → `growthByMonth` en `lastRecordDate` |
| Deellink | Ondertekend token zoals `lib/ticketing-stadion/share.ts` (HMAC op `SESSION_SECRET`). **Niet** `isValidShareToken` uit `lib/share-token.ts`: die accepteert elk JSON-object |
| Deelpagina | Toont alleen de opgeslagen snapshot, dus er hoeven geen data-endpoints open voor lezers zonder login |
| Nieuw in PSV Tools | GitHub API: gemergde PR's van `ruud-psv/psv-tools` in de maand, met een read-only token (`GITHUB_TOKEN`). Haiku maakt er gewone taal van via `lib/insights/runner.ts`. Werkt GitHub niet, dan vul je het handmatig in |
| Huisstijl | `.hero--red`, `.grid-4` voor de KPI's, `.card`, `.tag`, `.section--gray` |

Datamodel (schets):

```ts
interface RecapEdition {
  month: string;                 // "2026-10"
  status: "concept" | "gepubliceerd";
  intro?: string;
  kpis: {
    mailsSent: Kpi;
    uniqueOpens: Kpi;
    pageviews: (Kpi & { site: string })[];
    newSsoRecords: Kpi & { sourceLastRecordDate: string };
    activeFans: Kpi;
    engagedFans: Kpi;
  };
  milestones: { title: string; text: string; href?: string }[];
  toolsNews: { title: string; text: string; href?: string }[];
  fetchedAt: string;
  publishedAt?: string;
  publishedBy?: string;
  updatedAt: string;
}

interface Kpi {
  value: number | null;          // null = (nog) niet beschikbaar
  previousMonth: number | null;
  source: "maileon" | "ga4" | "sso" | "handmatig";
  note?: string;                 // bv. "SSO-export loopt tot 28-10"
}
```

## 6. Fasering

1. **Eerste editie (oktober).** Pagina, editie aanmaken, automatische cijfers uit Maileon, GA4
   en SSO, handmatige velden, publiceren en een deellink. Daarmee testen we het format met een
   echte maand.
2. **Nieuw in PSV Tools** uit GitHub en een AI-voorstel voor de intro.
3. **Later:** Active Fans en Engaged Fans koppelen zodra er een bron is, vergelijking met dezelfde
   maand vorig jaar, app-opens, gebruikscijfers van Tools (daarvoor moeten we eerst gebruik gaan
   loggen) en een herinnering aan het begin van de maand.

## 7. Open vragen

- **Active Fans en Engaged Fans**: wat is de definitie, wie levert de cijfers aan, en vanaf welke
  maand zijn ze bekend (voor de vergelijking)?
- **Lezers**: deellink zonder login (iedereen met de link) of alleen met een PSV-account? Wie net
  buiten de afdeling zit heeft waarschijnlijk geen toegang tot Tools.
- **Redacteuren**: wie mag een editie maken en publiceren? Alleen admins, of een aparte rol?
- **Mails verstuurd**: alle Maileon-mailings, of zonder service- en testmails? Tellen
  partnermailings mee?
- **Pageviews**: één totaal over de vier sites als hoofdcijfer, of psv.nl als hoofdcijfer met de
  rest eronder?
- **Ritme**: wanneer verschijnt een editie, bv. uiterlijk de 5e werkdag? De SSO-export moet dan
  al geüpload zijn.
