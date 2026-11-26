# Active & Engaged Fans

De twee fandoelen van het seizoen, die Marnix eerst elke maand met de hand in
Asana bijhield. Pagina: `/dashboard/fans` (Marketing > Inzichten, **Beta**:
alleen voor gebruikers met beta-toegang). Tools telt elke avond zelf, uit
Maileon en (zodra gekoppeld) BlueConic, en bewaart alleen aantallen.

## Definities

Gelijk aan de filters van de handmatige werkwijze:

| Bron | Regel |
|---|---|
| **Maileon** (e-mail) | Contactveld `SSOID` is gevuld, en het contact klikte in de periode minstens één keer (zoals contactfilter 6027). |
| **MijnPSV** (BlueConic) | Profiel in segment "[Fan Identificatie] Heeft SSO ID", met "[Persoon] SSO Ingelogd Datum (meest recent)" in de periode. Dit zijn logins op de PSV-app, PSV Play, de FANstore, Playable en de andere MijnPSV-touchpoints. |

- **Engaged Fans** in een maand: de unieke SSO-id's uit beide bronnen in die
  kalendermaand (Nederlandse tijd). Het doel is het **gemiddelde over de volle
  maanden** van het seizoen. Een lopende maand staat apart, met "incl."
- **Active Fans**: hetzelfde over het hele seizoen, vanaf 1 juli. Het doel
  geldt voor het **totaal op 30 juni**.
- **Ontdubbelen** gebeurt op SSO-id, in kleine letters en zonder spaties
  eromheen. Wie in beide bronnen voorkomt, telt één keer.
- **Niveaus** staan in `lib/fans/doelen.ts`. Het niveau van een waarde is het
  hoogste niveau waarvan de ondergrens gehaald is. Groen is niveau 3 of hoger,
  oranje 2, rood 1. In de doelstelling in Asana staat bij Engaged niveau 2 de
  bovengrens 44.4549; dat is gelezen als 44.549.
- **Prognose met verzadiging** (`prognoseModel` in `lib/fans/bereken.ts`):
  unieke fans groeien steeds langzamer, omdat wie al meetelt niet opnieuw telt.
  Tools meet de groei per dag in perioden van minstens twee weken (per bron,
  nooit over de overgang van handmatig naar automatisch), past daarop
  `g(t) = g0 · e^(−λt)` met gewogen kleinste kwadraten (de laatste zes
  perioden), en trekt dat door: `N + g0/λ · (1 − e^(−λd))`. Elke dag opnieuw,
  met de nieuwste peilingen. Neemt de groei niet af, dan een rechte lijn. Met de
  handmatige peilingen (270 per dag, daarna 202) is de afname zo'n 22% per
  maand en komt het seizoen uit rond 121.700, in plaats van 148.100 bij een
  rechte lijn. Eenmalige pieken, zoals een campagne of de kaartverkoop, zitten
  er niet in.
- **Herkomst** staat als Venn-diagram met cirkels op schaal (`lib/fans/venn.ts`),
  voor de laatste peildatum; de tabel eronder toont alle peildata.

## Handmatig en automatisch

BlueConic bewaart alleen de **meest recente** logindatum. Wie in oktober en
daarna in november inlogde, staat nu op november. Een voorbije maand is dus
achteraf niet na te rekenen. Daarom:

- Juli tot en met oktober, de tussenstand van november (t/m 25 november) en de
  Active-peilingen van 15 september, 13 oktober en 26 november komen uit de
  handmatige updates (`lib/fans/handmatig.ts`). De pagina zegt bij elke maand
  of hij handmatig of automatisch is. In de update van 26 november staat bij
  Maileon 68.708; alleen 73.852 klopt met de groei en het totaal, dus dat staat er.
- Vanaf de eerste maand waarin BlueConic gelezen wordt, telt Tools automatisch.
  Een automatische maand met beide bronnen gaat voor een handmatige.
- De cron draait 's avonds, zodat de laatste run van een maand op de laatste
  dag zelf valt.

## Routes

| Route | Wat |
|---|---|
| `GET /api/fans` | De cijfers voor de pagina: handmatig plus automatisch, met niveaus, tempo en prognose. Ingelogd, met toegang tot de pagina. |
| `GET /api/fans/snapshot` | De telling (`lib/fans/run.ts`). De cron met `CRON_SECRET`, of ingelogd via de knop **Nu bijwerken**. Geeft 409 als er al een telling loopt. |
| `GET /api/fans/blueconic` | Controle van de BlueConic-koppeling, zonder SSO-id's. Ingelogd. |

## De telling

Elke avond om 21.30 uur UTC (22.30 uur in de winter, 23.30 uur in de zomer):

1. **Maileon**: de klikken van elke dag die nog niet is ingelezen, tot en met
   vandaag, uit `GET /reports/clicks/unique` met `custom_field=SSOID` en
   `exclude_anonymous_clicks=true`, per dag van middernacht tot middernacht
   Nederlandse tijd, in pagina's van 1000. Kent Maileon dat rapport niet, dan
   `/reports/clicks`. Vandaag blijft open en wordt de volgende avond opnieuw
   gelezen. De **eerste vulling** begint op 1 juli; past die niet in één run,
   dan start de run zelf de volgende (`?chain=`), tot Maileon bij is.
2. **MijnPSV**: het hele segment, pagina voor pagina. Profielen met een meest
   recente SSO-login op of na de vorige keer lezen tellen mee, elk in de maand
   van die login. Alleen als Maileon bij is; BlueConic moet binnen 280 seconden
   na de start klaar zijn.
3. **De stand**: per bron het aantal fans in de maand en in het seizoen, de
   overlap en het totaal. Alleen als Maileon bij is.

Bij 429 of een storing bij Maileon wacht de lezer en probeert hij het opnieuw.
Een fout bij BlueConic laat Maileon en de vorige BlueConic-stand staan, en komt
als laatste fout op de pagina.

## BlueConic

Via de **REST API v2** van BlueConic (`lib/fans/blueconic.ts`), met OAuth 2.0
client credentials:

- **Applicatie** in BlueConic (Settings > Access management > Applications)
  met leesrechten (scope Read) op **Profiles**, **Properties** en
  **Segments**. Is het SSO-id als PII gemarkeerd, dan ook **PII**: anders geeft
  BlueConic het SSO-id niet mee en stopt de telling met die uitleg.
- **Segment** "[Doelstelling] Ingelogd via login.psv.nl"
  (`ff5e51f8-3eb4-46cc-8640-6b66460d2633`): deel van "[Fan Identificatie]
  Heeft SSO ID" én SSO Ingelogd Datum (meest recent) tussen 1 juli 2026 en
  30 juni 2027. Niet aanpassen: Tools leest het elke avond helemaal. Uit die
  ene lijst komen beide doelen; de maand volgt uit de logindatum. Per seizoen
  alleen de datums aanpassen.
- **Eigenschappen**: met `BLUECONIC_PROP_SSO` en `BLUECONIC_PROP_LOGIN` (bij
  PSV `sso_id` en `_persoon_sso_ingelogd_datum_meest_recent_`) gebruikt Tools
  die. Zonder zoekt Tools ze op naam in `GET /profileProperties`.

Endpoints, volgens de documentatie (https://rest.apidoc.blueconic.com):

| Wat | Endpoint |
|---|---|
| Token | `POST /rest/v2/oauth/token`, met `grant_type=client_credentials`, `client_id` en `client_secret` in de body. Geen `scope`: de rechten komen uit de applicatie. |
| Profielen van het segment | `GET /rest/v2/segments/{segment}/profiles`, met `cursor` (eerst `*`, daarna `nextCursor`), `count` (Tools vraagt 10.000 per pagina; BlueConic staat tot 1.000.000 toe) en `profileProperty` per eigenschap. |
| Het segment en zijn aantal | `GET /rest/v2/segments` (lijst met `profileCount`). Een los segment ophalen bestaat niet. |
| Eigenschappen | `GET /rest/v2/profileProperties`. |

Twee valkuilen: `GET /profiles` is
"Search profiles" (zoeken op één waarde van een geïndexeerde eigenschap) en
geeft zonder zoekwaarde altijd 0; en `GET /segments/{id}` bestaat niet, wat
BlueConic beantwoordt met een 403.

**Nul profielen is een fout, geen telling.** Het segment heeft tienduizenden
profielen, dus een lege uitkomst stopt het MijnPSV-deel met een melding. Dat
geldt ook als BlueConic minder dan 80% van zijn eigen `totalResults` teruggeeft.
Op 26 november 2026 kwam een lege uitkomst als "0 MijnPSV-fans" in de cijfers;
`lib/fans/herstel.ts` maakt zo'n stand weer onbekend, en de volgende run leest
MijnPSV opnieuw vanaf het begin van het seizoen.

**Controle**: open `/api/fans/blueconic` (ingelogd). Die laat zien of het
token lukt, het segment met zijn aantal volgens BlueConic, de gekozen
eigenschappen, en de eerste pagina profielen met hoe lang die duurde. Zonder
SSO-id's: van elke waarde alleen de lengte, van de logindatum de dag.

## Omgevingsvariabelen

| Variabele | Nodig | Wat |
|---|---|---|
| `MAILEON_API_KEY` | ja | Bestaat al (account PSV, psv-news-mailer). Moet klikrapporten met contactvelden mogen lezen. |
| `BLUECONIC_CLIENT_ID` | voor BlueConic | Client ID van de applicatie in BlueConic. |
| `BLUECONIC_CLIENT_SECRET` | voor BlueConic | Client secret van die applicatie. Zonder ID en secret telt alleen Maileon. |
| `BLUECONIC_HOST` | nee | Standaard `psv.blueconic.com`. |
| `BLUECONIC_SEGMENT_ID` | nee | Standaard het segment hierboven. |
| `BLUECONIC_PROP_SSO`, `BLUECONIC_PROP_LOGIN` | nee | ID's van de eigenschappen, als het zoeken op naam niet lukt. |
| `BLUECONIC_SCOPES` | nee | Scopes in de tokenvraag. Standaard leeg, zoals de documentatie zegt. |
| `CRON_SECRET` | ja | Bestaat al. |
| `BLOB_READ_WRITE_TOKEN` | ja | Bestaat al (Vercel Blob). |

## Opslag en persoonsgegevens

Vercel Blob, privé, onder `fans/`:

- `status.json`: het slot, de laatste run en de laatste fout.
- `<seizoen>/historie.json`: per dag de aantallen, en tot waar elke bron is
  ingelezen. Alleen aantallen.
- `<seizoen>/sets/<maileon|mijnpsv>/<seizoen|JJJJ-MM>.bin`: wie er in het
  seizoen of in een maand actief was, als 48-bits hash per fan in het formaat
  van de Database-tool (`lib/database/index-format.ts`, 8 bytes per fan). Er
  staat **geen SSO-id** in. De sets zijn nodig om van dag tot dag te
  ontdubbelen zonder een lijst met SSO-id's te bewaren. Een botsing van twee
  hashes scheelt hooguit één fan in de telling.

## Bekende beperkingen

- **Maileon-endpoint**: het klikrapport is gebouwd op de documentatie van
  Maileon en nog niet tegen de echte API gedraaid. Vergelijk de eerste telling
  met contactfilter 6027 (oktober: ongeveer 24.090; juli t/m oktober: ongeveer
  70.343). Afmeldingen sinds die export geven kleine verschillen.
- **Duur van BlueConic**: het hele segment wordt elke avond gelezen, in
  pagina's van 10.000. Is dat te traag (BlueConic moet binnen 280 seconden na
  de start klaar zijn), dan kan de vraag kleiner met een `refinement` op de
  logindatum, of moet BlueConic in een eigen run.
- **Een gemiste avond** aan het eind van een maand kost bij BlueConic de fans
  die die laatste dag inlogden en de dag erna opnieuw. De maand staat dan als
  "niet volledig geteld".
- **Nieuw seizoen**: voeg de doelen toe in `lib/fans/doelen.ts`. Zonder doelen
  stopt de telling met een melding.

## Bestanden

| Onderdeel | Bestand |
|---|---|
| Doelen en handmatige cijfers | `lib/fans/doelen.ts`, `lib/fans/handmatig.ts` |
| Datums (Nederlandse tijd) | `lib/fans/tijd.ts` |
| Maileon-lezer | `lib/fans/maileon.ts` |
| BlueConic-lezer | `lib/fans/blueconic.ts` |
| Hash-sets | `lib/fans/sets.ts` |
| Telling en opslag | `lib/fans/run.ts`, `lib/fans/store.ts`, `lib/fans/types.ts` |
| Cijfers en prognose voor de pagina | `lib/fans/bereken.ts`, `lib/fans/venn.ts` |
| Routes | `app/api/fans/route.ts`, `app/api/fans/snapshot/route.ts`, `app/api/fans/blueconic/route.ts` |
| Pagina | `app/dashboard/fans/page.tsx`, `components/fans/fans-dashboard.tsx` |

Tests: `npm test` (`lib/fans/*.test.ts`, met nep-antwoorden van Maileon en
BlueConic en opslag in het geheugen).
