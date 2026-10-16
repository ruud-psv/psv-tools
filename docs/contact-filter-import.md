# Contact Filter Import (beta)

Zet een lijst relatienummers, SSO-ID's of GroupID's als contactfilter in Maileon. Het is
dezelfde "Doorzetten naar Maileon" als bij [Aangrenzende stoelen](aangrenzende-stoelen.md),
maar dan met een lijst die je zelf aanlevert.

Pagina: `/dashboard/contact-filter-import`, in de sidebar onder "Beta tools".

## Gebruik

1. Kies het soort ID: relatienummer, SSO-ID of GroupID.
2. Plak de lijst, of upload een bestand (Excel .xlsx, CSV of TXT, hooguit 10 MB).
3. Controleer de tellers: uniek, dubbel en overgeslagen.
4. Vul verzenddatum, naam en DMID in en klik "Doorzetten naar Maileon".
5. In Maileon: open het filter, controleer het aantal contacten, voeg de preference-regel
   toe die bij de mailing hoort (bijvoorbeeld Email › Ticketing = ja voor kaartverkoop) en
   maak een doelgroep op het filter met dezelfde naam.

Er komt bewust geen doelgroep bij, net als bij Aangrenzende stoelen: de API van Maileon
wijst filters met een preference-regel af, en zonder die regel mag je niet mailen.

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

Code: `lib/contact-filter-import/maileon.ts`. Het filter zelf maakt
`lib/maileon/contact-filters.ts`, dat ook Aangrenzende stoelen gebruikt.

| Soort | Veld in Maileon | Status |
|---|---|---|
| Relatienummer | custom veld `MEMBERNUMBERPRIOR` | werkt (zelfde als Aangrenzende stoelen) |
| GroupID | de External ID van het contact | schrijfwijze nog niet bevestigd |
| SSO-ID | custom veld, opgezocht in Maileon | veldnaam nog niet bevestigd |

- **GroupID = External ID.** De Mail Builder geeft de External ID ook als `groupid` door
  aan Typeform. De External ID is geen custom veld maar een vast gegeven van het contact.
  Hoe het contactfilter-schema dat veld noemt, staat niet in de documentatie die we hebben.
  De tool probeert daarom `EXTERNAL_ID`, `external_id` en `EXTERNAL-ID` op volgorde. Alleen
  bij een 400 van Maileon gaat hij naar de volgende. De pagina en de log
  (`[contact-filter-import] ... op <veld>`) noemen welke schrijfwijze Maileon accepteerde.
  Zet die daarna vooraan in `EXTERNAL_ID_FIELDS`, of als enige.
- **SSO-ID.** De tool vraagt de custom velden op (`GET /contacts/fields/custom`) en neemt het
  veld dat zonder hoofdletters en leestekens `ssoid` heet (`SSO_ID`, `SsoId`, `SSO-ID`, ...).
  Vindt hij er geen of meer dan één, dan kan SSO-ID niet en toont de pagina waarom, met de
  velden die erop lijken.
- **Controleer het aantal contacten in Maileon** na het doorzetten. Accepteert Maileon een
  veldnaam die niet bestaat, dan is het filter leeg. Minder contacten dan ID's is wel
  normaal: niet iedereen staat in Maileon.

## Grenzen

- Hooguit 100 waarden per regel en 100 regels per filter. Eén regel blijft vrij voor de
  preference-regel, dus er passen 9.900 ID's in één filter. Een langere lijst moet je
  splitsen.
- De naam: `2026.10.31 <naam> - DMID26-12345`, de naam hooguit 150 tekens. Zonder DMID wordt
  het `DMID26-XXXX` (het jaar van de verzenddatum).
- Iedereen met een login kan doorzetten. Het maakt alleen een filter; mailen kan pas na een
  doelgroep, en die maak je in Maileon zelf.
- Elke keer doorzetten maakt een nieuw filter; opruimen gaat in Maileon zelf.
- Sleutel: `MAILEON_API_KEY`, dezelfde als bij Aangrenzende stoelen.

## Later

- De schrijfwijze van de External ID vastleggen zodra Maileon er een accepteerde.
- Het aantal gevonden contacten op de pagina tonen (filter opvragen na de refresh).
- Lijsten boven de 9.900 ID's automatisch over meer filters verdelen.
