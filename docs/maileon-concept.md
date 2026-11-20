# Maileon-concept (test)

Testpagina op `/marnix/maileon-concept`: een mail uit een Asana-taak (de
content brief) of uit de Mail Builder als **concept** in Maileon zetten, een
**voorbeeldlink** maken voor de aanvrager, en die link als reactie op de
Asana-taak zetten. De eerste versie van de flow Asana → PSV Tools → Maileon.

De pagina staat bewust niet in het menu. Alles onder `/marnix` (en
`/api/marnix`) is alleen voor admins: zie `TEST_HREF` en `TEST_API` in
`lib/access.ts`. De middleware stuurt anderen terug naar het dashboard, en de
API-route controleert het nog een keer, omdat hij naar Maileon schrijft.

## Gebruik

De mail komt uit Asana, of uit de Mail Builder.

**Uit Asana** (alleen het testproject, zie hieronder):

1. Kies op `/marnix/maileon-concept` een taak en klik op **Brief ophalen**.
   PSV Tools zet de content brief om naar de Mail Builder (template
   Kaartverkoop), toont het voorbeeld en de punten die opvallen, en vult
   mailnaam, DMID, onderwerp en preview-tekst in.
2. Klopt het? Klik op **Als concept in Maileon zetten**. Moet er nog iets
   aan, pas dan de brief in Asana aan en haal hem opnieuw op, of gebruik
   **Download voor de Mail Builder** en werk de mail daar bij.
3. PSV Tools zet een reactie op de taak met het mailing-ID, de voorbeeldlink
   en de punten, en zet de taak in de sectie **Feedback**.

**Uit de Mail Builder:**

1. Maak de mail in de Mail Builder en klik op **Download**. In dat bestand
   zit de staat van de builder (`<!-- mailbuilder-state:… -->`).
2. Kies het bestand op `/marnix/maileon-concept`. Mailnaam, DMID en
   preview-tekst worden uit de staat ingevuld.
3. Vul het **onderwerp** in. De Mail Builder heeft daar geen veld voor.
4. Klik op **Als concept in Maileon zetten**. Je krijgt het mailing-ID en een
   voorbeeldlink.

Daarna in beide gevallen in Maileon: doelgroep (met de preference-regel),
testmail, inplannen.

Staat er al een concept voor dezelfde DMID (of, zonder DMID, dezelfde naam),
dan zegt de pagina dat en werkt de knop dat concept bij. De voorbeeldlink
blijft dan hetzelfde.

## Wat er in Maileon gebeurt

| Stap | API |
|---|---|
| Nieuw concept | `POST /mailings?name=…&subject=…&type=regular`, het antwoord is het ID |
| HTML zetten | `POST /mailings/{id}/contents/html?doImageGrabbing=false&doLinkTracking=false`, body `text/html` |
| Onderwerp (bij bijwerken) | `POST /mailings/{id}/contents/subject` |
| Preview-tekst | `POST /mailings/{id}/contents/previewtext` |
| Controle vóór bijwerken | `GET /mailings/{id}/state` en `GET /mailings/{id}/contents/html` |
| Voorbeeld | `GET /mailings/{id}/preview?format=html`, zonder contact |

Image grabbing en link tracking staan uit: de export van de Mail Builder
gebruikt al Maileon-tokens voor de beelden (`[[MAILING|PROTOCOL|http]]://…`)
en de links (`[[LINK|…]]`).

**Wat PSV Tools niet doet:** versturen, inplannen, een doelgroep kiezen of een
testmail sturen. `lib/maileon/concept.ts` heeft daar geen code voor, en een
test controleert dat `sendnow`, `schedule`, `targetgroupid` en `testsendout`
niet in de code van dat bestand voorkomen.

## Veilig bijwerken

Een concept wordt alleen bijgewerkt als:

- de mailing in Maileon nog `draft` is. Anders weigert PSV Tools, met de
  status erbij;
- niemand de HTML in Maileon heeft aangepast sinds PSV Tools hem zette.
  PSV Tools bewaart daarvoor een hash van de HTML zoals Maileon hem direct na
  het zetten teruggaf. Wijkt die af, dan weigert de pagina en biedt hij
  **Toch een nieuw concept maken** aan. Het aangepaste concept blijft dan
  staan.

Bestaat het eerdere concept niet meer in Maileon (404), dan komt er een nieuw.

## De voorbeeldlink

`/share/mail/<id>`: werkt zonder login, want de middleware laat `/share/`
door. Het ID is willekeurig (128 bits) en blijft hetzelfde bij elke nieuwe
versie van dezelfde mail, zodat een link in Asana blijft werken.

- **Bron:** het voorbeeld van Maileon zelf, opgehaald zonder contact, zodat
  Maileon een algemeen contact invult en er **geen persoonsgegevens** in staan.
  Geef daar nooit een e-mailadres of contact-ID mee. Geeft Maileon geen
  bruikbaar voorbeeld, dan bouwt PSV Tools er een uit de export
  (`voorbeeldUitExport`), met lege dynamische velden. De pagina zegt welke
  bron het werd.
- **Veiligheid:** de HTML draait in een sandbox zonder scripts
  (`Content-Security-Policy: sandbox`), met `noindex` en zonder referrer.
- **Looptijd:** 60 dagen na de laatste versie, daarna een melding.

## Opslag

Vercel Blob, privé:

- `maileon-concepten/<sleutel>.json`: per mail het mailing-ID, de hash, het
  voorbeeld-ID en wie het concept het laatst zette. De sleutel is een hash van
  de DMID, of van de naam als er geen DMID is.
- `maileon-voorbeelden/<id>.json`: de HTML achter de voorbeeldlink.

## Koppeling met Asana

**Alleen het testproject** "TEST | Mail-automatisering Claude | niet
gebruiken" (`TESTPROJECT` in `lib/asana/client.ts`). Dat project is privé en
heeft geen regels en geen custom fields, zodat een reactie of een andere
sectie daar niets in gang zet. Elke taak wordt eerst opgehaald en
gecontroleerd; een taak uit een ander project weigert PSV Tools, nog voordat
er iets in Maileon gebeurt. In het echte productiebord kan het verplaatsen
naar een andere sectie wél regels starten; kijk dat na voordat het project
wordt verruimd.

**Inloggen:** `ASANA_TOKEN` in Vercel, een personal access token (Asana →
profielfoto → Settings → Apps → Developer apps → Create new token). Reacties
komen op naam van de eigenaar van het token; voor de echte flow is een
serviceaccount beter. Zonder token toont de pagina een melding en werkt de
upload uit de Mail Builder gewoon.

**Wat PSV Tools uit de brief haalt** (`lib/asana/brief.ts`, zonder AI, met
vaste regels op het sjabloon van de content brief):

| In de brief | In de mail |
|---|---|
| Onderwerp, Snippet | Onderwerp en preview-tekst |
| Link / URL CTA | Link van de header |
| Footer | Regel "Je ontvangt deze e-mail omdat…" |
| Copy: "Hi (voornaam)," | Aanhef met `{VOORNAAM}` |
| Copy: korte regel zonder punt, met tekst eronder | Blok met titel (om en om grijs en wit) |
| Copy: "Button: TEKST: link" of "TEKST: link" | Knop onder het blok ervoor |
| Copy: ingesprongen regels of "- …" | Opsomming met • |
| Copy: "DYNAMISCH: (Relatienummer, Voornaam, …)" | Velden met Maileon-tokens; een onbekend veld wordt `[onbekend veld]` en een punt |
| Copy: "Met vriendelijke groet," en wat erna komt | Afsluitende regel |
| DMID (custom field, of in de tekst) | DMID, utm_campaign en de naam |
| Deadline van de taak | Datum in de naam |

De naam volgt de conventie, met TEST ervoor:
`TEST 2026.11.27 PSV Kaartverkoop - Real Madrid - DMID26-22619`. Het
onderwerp-deel komt uit de taaknaam en wordt zo nodig ingekort tot de naam
binnen 64 tekens blijft. Op de pagina is de naam nog aan te passen.

**Punten** ("nodig" en "let op") komen in de pagina en in de reactie in
Asana: ontbrekende velden, placeholders zoals `<KORTINGSCODE>`, een
doelgroep op SharePoint, een lang onderwerp, "Ja / Nee" bij Dynamic content,
onbekende dynamische velden, en wat de Mail Builder zelf zou weigeren.

**Nog niet automatisch:**

- Alleen Ticketing-mails (template Kaartverkoop). Andere exploitaties geven
  een punt en geen opzet.
- De header: een afbeelding als bijlage of als link in de brief gaat nog niet
  mee. De mail krijgt de standaardheader van het template, en er komt een
  punt bij.
- Feedback uit reacties verwerken: pas de brief aan en haal hem opnieuw op.
  Opnieuw zetten werkt hetzelfde concept bij, met dezelfde voorbeeldlink.
- Starten vanuit Asana zelf (webhook): nu kies je de taak op de pagina.

## Eerste test: wat nog niet zeker is

De code is getest tegen een nagebootste Maileon, niet tegen de echte API. Let
bij de eerste keer op het volgende:

1. **Rechten van de sleutel.** `MAILEON_API_KEY` maakt al contactfilters en
   doelgroepen (Contact Filter Import). Of hij ook mailings mag aanmaken,
   blijkt bij de eerste klik. Een 401 of 403 betekent: rechten in Maileon
   uitbreiden.
2. **Lengte van de naam.** De API-documentatie noemt 3 tot 64 tekens, maar
   bestaande mailings hebben langere namen. De pagina waarschuwt boven de 64 en
   laat Maileon beslissen.
3. **Onderwerp en preview-tekst bijwerken** sturen een XML-body met CDATA
   (`<subject>`, `<previewtext>`). Geeft Maileon daar een fout op, dan staat
   die op de pagina; het nieuwe concept zelf (met onderwerp bij het aanmaken)
   werkt dan al wel.
4. **Vorm van het voorbeeld.** De documentatie noemt een veld `html`.
   `leesVoorbeeld` leest JSON, XML (CDATA of geëscapet) en kale HTML. Zegt de
   pagina "uit de export", controleer dan in het serverlog wat Maileon
   teruggaf.
5. **Dynamische velden.** De Mail Builder gebruikt `[[% contact 'VELD' '…']]`.
   `MEMBERNUMBERPRIOR` (relatienummer) en `FULLNAME` staan al in de footer van
   het template. Andere velden, zoals `BIRTHDAY`, eerst controleren in Maileon.

## Bestanden

| Onderdeel | Bestand |
|---|---|
| Maileon-client, invoer, controles | `lib/maileon/concept.ts` (met tests) |
| Naam in Maileon (ook in de browser) | `lib/maileon/concept-naam.ts` |
| Opslag in Blob | `lib/maileon/concept-opslag.ts` |
| API-route | `app/api/marnix/maileon-concept/route.ts` |
| Voorbeeldlink | `app/share/mail/[id]/route.ts` |
| Pagina en layout zonder menu | `app/marnix/maileon-concept/page.tsx`, `app/marnix/layout.tsx` |
| Formulier | `components/marnix/maileon-concept.tsx` |
| Toegang (alleen admins) | `lib/access.ts` (`TEST_HREF`, `TEST_API`), `lib/marnix/toegang.ts` |
| Asana: client, alleen het testproject | `lib/asana/client.ts` (met tests) |
| Asana: brief naar Mail Builder | `lib/asana/brief.ts` (met tests op drie echte briefs in `brief.fixtures.ts`) |
| Asana: taak ophalen en controleren | `lib/asana/taak-brief.ts` |
| Asana: de reactie | `lib/asana/reactie.ts` (met tests) |
| Asana: taken en één taak | `app/api/marnix/asana/route.ts`, `app/api/marnix/asana/[taak]/route.ts` |
| HTML van de Mail Builder (ook voor de pagina) | `generateEmailHTML`, `makeInitialState` in `components/mail-builder-form.tsx` |
