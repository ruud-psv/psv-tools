# Maileon-concept (test)

Testpagina op `/marnix/maileon-concept`: een mail uit de Mail Builder als
**concept** in Maileon zetten, en een **voorbeeldlink** maken voor de
aanvrager. Bedoeld als eerste stap van de flow Asana → PSV Tools → Maileon.

De pagina staat bewust niet in het menu. Alles onder `/marnix` (en
`/api/marnix`) is alleen voor admins: zie `TEST_HREF` en `TEST_API` in
`lib/access.ts`. De middleware stuurt anderen terug naar het dashboard, en de
API-route controleert het nog een keer, omdat hij naar Maileon schrijft.

## Gebruik

1. Maak de mail in de Mail Builder en klik op **Download**. In dat bestand
   zit de staat van de builder (`<!-- mailbuilder-state:… -->`).
2. Open `/marnix/maileon-concept` en kies het bestand. Mailnaam, DMID en
   preview-tekst worden uit de staat ingevuld.
3. Vul het **onderwerp** in. De Mail Builder heeft daar geen veld voor.
4. Klik op **Als concept in Maileon zetten**. Je krijgt het mailing-ID en een
   voorbeeldlink.
5. Ga verder in Maileon: doelgroep (met de preference-regel), testmail,
   inplannen.

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
| Toegang (alleen admins) | `lib/access.ts` (`TEST_HREF`, `TEST_API`) |
