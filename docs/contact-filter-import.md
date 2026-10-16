# Contact Filter Import (beta)

Zet een lijst relatienummers, SSO-ID's of GroupID's als contactfilter in Maileon, met een
doelgroep op dat filter onder dezelfde naam. Het is dezelfde "Doorzetten naar Maileon" als bij
[Aangrenzende stoelen](aangrenzende-stoelen.md), maar dan met een lijst die je zelf aanlevert,
en met de doelgroep er meteen bij.

Pagina: `/dashboard/contact-filter-import`, in de sidebar onder "Beta tools".

## Gebruik

1. Kies het soort ID: relatienummer, SSO-ID of GroupID.
2. Plak de lijst, of upload een bestand (Excel .xlsx, CSV of TXT, hooguit 10 MB).
3. Controleer de tellers: uniek, dubbel en overgeslagen.
4. Vul verzenddatum, naam en DMID in en klik "Doorzetten naar Maileon". Dat maakt het filter
   en de doelgroep, allebei met dezelfde naam. De pagina toont daarna hoeveel contacten
   Maileon in de doelgroep vond, en hoeveel daarvan te mailen zijn.
5. In Maileon: open het filter, voeg de preference-regel toe die bij de mailing hoort
   (bijvoorbeeld Email › Ticketing = ja voor kaartverkoop) en controleer het aantal
   contacten in de doelgroep.

**Let op:** de doelgroep staat meteen klaar om te mailen, maar nog zonder preference-regel.
De API van Maileon wijst filters met een preference-regel af, dus die kan er vanaf hier niet
bij. Zonder die regel kunnen ook mensen de mailing krijgen die geen toestemming gaven voor
dit soort mail. Aangrenzende stoelen maakt daarom bewust geen doelgroep; deze tool wel, op
verzoek van Digital Marketing (oktober 2026).

Lukt de doelgroep niet, dan blijft het filter staan en toont de pagina de reden. Maak de
doelgroep dan zelf in Maileon, op het filter en met dezelfde naam.

## Invoer

Code: `lib/contact-filter-import/ids.ts` (getest in `ids.test.ts`).

- **Met kopregel:** de kolom wordt op naam gezocht. Andere kolommen mogen erin staan.
  - Relatienummer: `Relatienummer`, `CRM ID`, `MEMBERNUMBERPRIOR`
  - SSO-ID: `SSO ID`, `SSO-ID`, `SSOID`
  - GroupID: `GroupID`, `Group ID`, `External ID`

  Hoofdletters, spaties, streepjes en underscores maken niet uit. Staat er wel een kolom
  van een ander soort ID, dan zegt de pagina dat je waarschijnlijk het verkeerde soort koos.
- **Zonder kopregel, geplakt of CSV/TXT:** elke waarde op een eigen regel, of gescheiden
  door komma's, puntkomma's of spaties. Kolommen met tabs ertussen (geplakt uit Excel)
  gaan niet zonder kopregel: dan is niet te zeggen welke kolom de ID's bevat.
- **Zonder kopregel, Excel:** alleen als het werkblad één kolom heeft.
- **Relatienummer:** alleen cijfers. Voorloopnullen gaan eraf, net als bij Aangrenzende
  stoelen.
- **SSO-ID en GroupID:** het formaat ligt niet vast. Letters, cijfers en `-_.:`, zonder
  spaties, met minstens één cijfer (zodat een kopregel of naam niet als ID meegaat).
  Hoofdletters blijven zoals ze zijn.
- Dubbele waarden komen één keer in het filter. Foute waarden worden overgeslagen en
  geteld, met een paar voorbeelden (regelnummer of de waarde zelf).

Het bestand wordt in de browser gelezen. Alleen de ID's gaan naar de server, en die stuurt
ze door naar Maileon zonder iets op te slaan. De server controleert elke waarde opnieuw.
De log noemt alleen aantallen, nooit ID's.

## Velden in Maileon

Code: `lib/contact-filter-import/maileon.ts` (getest in `maileon.test.ts`). Het filter zelf
maakt `lib/maileon/contact-filters.ts`, dat ook Aangrenzende stoelen gebruikt. Bron voor de
velden: Contacts › Contact fields in Maileon (oktober 2026).

| Soort | Veld in Maileon | Gevuld bij | Status |
|---|---|---|---|
| Relatienummer | custom veld `MEMBERNUMBERPRIOR` | ongeveer de helft | werkt (zelfde als Aangrenzende stoelen) |
| SSO-ID | custom veld `SSOID` (tekst) | ongeveer 20% | veld bevestigd |
| GroupID | External ID (standaardveld, "system defined") | bijna iedereen (98,7%) | schrijfwijze in het filter nog niet bevestigd |

- **GroupID = External ID.** De Mail Builder geeft de External ID ook als `groupid` door
  aan Typeform. De External ID is geen custom veld maar een standaardveld van Maileon zelf.
  Hoe het contactfilter-schema dat veld noemt, staat niet in de documentatie die we hebben.
  De tool probeert daarom `EXTERNAL_ID`, `external_id` en `EXTERNAL-ID` op volgorde. Alleen
  bij een 400 van Maileon gaat hij naar de volgende; elke andere fout stopt meteen. De pagina
  en de log (`[contact-filter-import] ... op <veld>`) noemen welke schrijfwijze Maileon
  accepteerde. Zet die daarna vooraan in `EXTERNAL_ID_FIELDS`, of als enige.
- **Controleer het aantal contacten in Maileon** na het doorzetten. Accepteert Maileon een
  veldnaam die niet bestaat, dan is het filter leeg. Minder contacten dan ID's is wel
  normaal: niet iedereen staat in Maileon, en lang niet iedereen heeft een SSO-ID.

## API

Code: `app/api/contact-filter-import/route.ts`, met de Maileon-aanroepen in
`lib/maileon/contact-filters.ts`.

- `POST /contactfilters/v2`: het filter (zie hierboven voor de velden).
- `POST /targetgroups`: de doelgroep, als XML met `name`, `type` = `regular` en
  `contact_filter_id`. Dezelfde aanroep als de eerste versie van Aangrenzende stoelen.
- Daarna een refresh van het filter, zodat Maileon meteen gaat rekenen.
- De pagina vraagt de doelgroep op (`GET /targetgroups/targetgroup/{id}`, via `GET
  /api/contact-filter-import?targetGroupId=`) tot de stand `uptodate` is: elke 5 seconden,
  hooguit 2 minuten. Daarna kan het met "Ververs".

## Grenzen

- Hooguit 100 waarden per regel en 100 regels per filter. Eén regel blijft vrij voor de
  preference-regel, dus er passen 9.900 ID's in één filter. Een langere lijst moet je
  splitsen.
- De naam: `2026.10.31 <naam> - DMID26-12345`, de naam hooguit 150 tekens. Zonder DMID wordt
  het `DMID26-XXXX` (het jaar van de verzenddatum).
- Iedereen met een login kan doorzetten.
- Elke keer doorzetten maakt een nieuw filter en een nieuwe doelgroep; opruimen gaat in
  Maileon zelf.
- Sleutel: `MAILEON_API_KEY`, dezelfde als bij Aangrenzende stoelen.

## Later

- De schrijfwijze van de External ID vastleggen zodra Maileon er een accepteerde.
- Lijsten boven de 9.900 ID's automatisch over meer filters verdelen.
