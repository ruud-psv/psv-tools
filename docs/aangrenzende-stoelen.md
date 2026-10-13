# Aangrenzende stoelen

Vlak voor een thuiswedstrijd zijn er soms nog losse stoelen vrij. Deze tool zoekt de
seizoenkaarthouders die ernaast zitten, zodat kaartverkoop ze kan benaderen voor een
extra kaart. De uitkomst is een CSV met relatienummers. Namen en e-mailadressen staan
er nergens in.

Pagina: `/dashboard/aangrenzende-stoelen`.

De keuzelijst toont standaard alleen thuiswedstrijden van het eerste elftal: namen die
beginnen met `PSV -` en geen `Jong PSV` of `Vrouwen` bevatten
(`lib/aangrenzende-stoelen/events.ts`). Met "Toon alle evenementen" komt de rest terug,
voor het geval een wedstrijd ooit anders heet.

## Regels

De regels staan in `lib/aangrenzende-stoelen/neighbors.ts` en zijn getest in
`neighbors.test.ts`.

- **Vrije stoel.** De stoel staat in de stoelenkaart van de wedstrijd, is niet
  geblokkeerd (`is_counted_as_available`), ligt in een genummerd vak dat niet is
  uitgesloten, en heeft geen geldig ticket. Een stoel met alleen een ticket dat in de
  resale staat (`resale_status = 'Posted'`) telt ook als vrij.
- **Uitgesloten vakken.** Alle rolstoelvakken (`RS*`), de sfeervakken V, W, X en Y, en
  BEZOEKERS. Ongenummerde vakken (staanplaatsen, `is_ga`) vallen sowieso af.
- **Buren.** Links en rechts (stoelnummer ±1) en voor en achter (rijnummer ±1, zelfde
  stoelnummer), altijd binnen hetzelfde vak. Waar een trap of gat in de rij zit, slaat
  de nummering over; ±1 klopt daar dus vanzelf.
- **Op de lijst.** Een seizoenkaarthouder op een buurstoel, met een geldig ticket voor
  deze wedstrijd dat niet in de resale staat. Wie zelf de vrije stoel ernaast in de
  resale heeft gezet, valt af. Dat wordt vergeleken op eigenaar, en anders op het
  relatienummer uit de lijst.
- **Eén regel per relatienummer.** In de testkolommen staan alleen de stoelen die aan
  een vrije stoel grenzen. Zijn dat er meer, dan staan ze met een komma achter elkaar.
- **Grens per relatienummer.** Optioneel in de interface: relatienummers met meer dan
  N stoelen laten we weg, bijvoorbeeld zakelijke accounts. Standaard is er geen grens.

Bekende afwijkingen van "rij ±1", vastgesteld op de plattegrond van de ticketshop
(oktober 2026):

- In vak A verspringt de nummering tussen rij 20 en 21 één stoel.
- C en D hebben geen rij 3, en CD heeft geen rij 24, 26 en 27. Daar zit wél direct een
  rij achter, dus daar missen we buren.
- P en R hebben geen rij 18, en UU heeft geen rij 29. Dat zijn echte lege rijen, dus
  daar klopt het.

## Plattegrond

Na "Maak lijst" toont de pagina de plattegrond van het Philips Stadion met per vak het
aantal vrije stoelen (`components/stadium-map.tsx`). De vakken zijn nagetekend van de
officiële plattegrond (`lib/aangrenzende-stoelen/stadium.ts`). Een test controleert dat
elk genummerd vak er precies één keer op staat.

- **Kleur:** één schaal van licht- naar donkerrood (PSV-tokens), in vier klassen
  (1–4, 5–14, 15–39, 40+). Lichtgrijs is 0 vrij, grijs met arcering doet niet mee.
  Het aantal staat altijd als getal in het vak.
- **Aanwijzen of klikken:** onder de kaart verschijnen dan de vrije stoelen van dat vak,
  hoeveel daarvan in de resale staan, en hoeveel stoelen van seizoenkaarthouders op de
  lijst staan.
- Vrije stoelen in een vak dat niet op de kaart staat, worden eronder apart genoemd.
- Onder "Als tabel" staan dezelfde cijfers als tabel.

## Lijst seizoenkaarthouders

Digital Marketing uploadt de lijst op de pagina: Excel (.xlsx) of CSV met de kolommen
`CRM ID`, `Vak`, `Rij` en `Stoel`. Andere kolommen worden genegeerd. De lijst staat
privé in Vercel Blob (`aangrenzende-stoelen/seizoenkaarthouders.json`) tot de volgende
upload.

In de testfase (het Beta-label) mag iedereen met een login de lijst vervangen. Later
wordt dat alleen Digital Marketing: zet dan hun e-mailadressen in
`SEIZOENKAART_UPLOAD_EMAILS`, met een komma ertussen. Zolang die variabele leeg is, staat
uploaden open. De upload-route controleert dat zelf; het verbergen van de knop is alleen
gemak.

**Zet het echte bestand nooit in de repository.** Het koppelt relatienummers aan
stoelen.

## Stoelstatus uit Ringside

Ringside kan niet per wedstrijd opvragen (zie `docs/ringside-api.md`). Deze tool houdt
daarom zelf de stand bij voor komende wedstrijden, uit twee stromen:

| Stroom | Wat we bewaren | Sleutel |
|---|---|---|
| `/v1/manifests` | elke stoel, met vak, rij, stoel en of hij geblokkeerd is | `manifest_id` |
| `/v1/sales` | alleen tickets die nu een stoel bezet houden, met resale-status en een hash van de eigenaar | `sales_item_id` |

Een ticket houdt een stoel bezet als hij geldig is: `item_type = 'Ticket'`,
`current_status = true`, geen `forward_item_id`, en een `sale_type` van `Sale`,
`Reservation`, `Reservation Confirmation` of `Update - New`. Een openstaande reservering
telt dus mee: die stoel is ook niet vrij te koop.

Ringside levert elke nieuwe versie van een rij opnieuw. Bijwerken is daarom altijd
"de laatste versie wint", nooit optellen. Een vervallen ticket verdwijnt.

- **Code:** `lib/ringside/seat-state.ts` (hoe een rij de stand verandert, getest),
  `lib/ringside/seat-ingest.ts` (lezen) en `lib/ringside/seat-store.ts` (opslag).
- **Opslag:** Vercel Blob onder `ringside/stoelen/`: per wedstrijd één gzip-bestand,
  plus een index en de toestand met cursors.
- **Eigenaar:** van `own_client_guid` bewaren we alleen een korte SHA-256-hash. Die is
  genoeg om te zien of twee tickets van dezelfde persoon zijn.
- **Cron:** `/api/ringside/stoelen`, elk kwartier. Met een ingelogde sessie is de route
  ook handmatig te starten. Op de pagina heet die knop "Start" of "Ga verder".
- **Eerste vulling:** leest de hele historie van beide stromen, met ongeveer 3.000
  rijen per seconde. Dat duurt een paar uur. Een run start zelf de volgende, net als
  `/api/ringside/ingest`.
- **Actueel bij "Maak lijst":** eerst haalt de tool maximaal 25 seconden de nieuwste
  mutaties op, daarna rekent hij. Loopt er al een run, dan rekent hij met de vorige
  stand en zegt dat erbij.
- **HTTP 205:** SeatGeek heeft een dataset ververst. Die stroom begint dan opnieuw en
  de bijbehorende data wordt weggegooid.
- **Slot:** er draait nooit meer dan één run tegelijk, ook niet tussen de cron en
  "Maak lijst". De cursors schuiven pas op nadat de data is opgeslagen.

## Doorzetten naar Maileon

Onder een gemaakte lijst staat "Doorzetten naar Maileon". Dat maakt in Maileon een
contactfilter met een doelgroep erop, zodat kaartverkoop er direct een mailing naar kan
sturen. Code: `lib/aangrenzende-stoelen/maileon.ts` en
`app/api/aangrenzende-stoelen/maileon/route.ts`.

- **Naam** (filter én doelgroep), volgens de conventie van Digital Marketing:
  `2026.10.31 PSV Kaartverkoop - Aangrenzende stoelen PSV - Willem II - DMID26-12345`.
  In de interface vul je de verzenddatum en het DMID in. Zonder DMID wordt het
  `DMID26-XXXX` (het jaar van de verzenddatum).
- **Filter:** begint leeg en voegt iedereen toe van wie het custom veld
  `MEMBERNUMBERPRIOR` (het relatienummer) in de lijst staat. Let op: `MEMBERNUMBER`
  bestaat ook, maar is niet het relatienummer. Ongeveer de helft van de contacten in
  Maileon heeft een relatienummer.
- **Alleen met Ticketing op ja:** de laatste regel van het filter (`intersection`) houdt
  alleen de contacten over met de preference `Ticketing` in de categorie `Email` op ja.
  Op de voorkeurenpagina (`psv-voorkeuren-algemeen`) heet die "PSV Kaartverkoop
  thuiswedstrijden". Wie hem uit heeft staan, mag geen mail over kaartverkoop krijgen.
  Let op: de CSV-export is níet op deze preference gefilterd. Ringside kent de
  preferences niet.
- **De lijst wordt opnieuw uitgerekend** met dezelfde berekening als "Maak lijst"
  (`lib/aangrenzende-stoelen/build-list.ts`). De relatienummers komen dus nooit uit de
  browser.
- **API:** eerst het filter (`POST /contactfilters/v2`), dan de doelgroep
  (`POST /targetgroups`). Lukt de doelgroep niet, dan blijft het filter staan en zegt de
  pagina waarom; de doelgroep maak je dan zelf in Maileon.
- **Regels:** volg het JSON-schema (`contactfilter.json`) uit de XQueue-wiki "Creating
  and Updating Contactfilters Using the REST API", niet de losse documentatiepagina's. Volgens
  dat schema heet de operator `includedin` (niet `includein`) en mag een regel hooguit 100
  waarden hebben. De lijst gaat daarom in blokken van 100, elk een eigen "add"-regel. Met
  hooguit 100 regels per filter, waarvan één voor Ticketing, passen er 9.900
  relatienummers in.
- **Daarna** vraagt de pagina de doelgroep op tot Maileon klaar is met rekenen, en toont
  hoeveel contacten Maileon vond en hoeveel daarvan te mailen zijn. Minder contacten dan
  relatienummers is normaal: niet iedere seizoenkaarthouder staat in Maileon, en niet
  iedereen heeft Ticketing op ja.
- **Sleutel:** `MAILEON_API_KEY` in Vercel (de API-sleutel "PSV Tools II" in Maileon).
  Elke keer doorzetten maakt een nieuw filter en een nieuwe doelgroep; opruimen gaat in
  Maileon zelf.

## Instellingen

- `INCLUDE_SEAT_COLUMNS` in `lib/aangrenzende-stoelen/settings.ts`: vak, rij en stoel
  in de export. Staat aan voor de testfase.
- `SEIZOENKAART_UPLOAD_EMAILS` in Vercel: wie de lijst mag vervangen. Leeg betekent
  iedereen met een login.

## Later

- Finetuning van uitsluitingen: hospitality, persvak, staanplaatsen, en stoelen die de
  club vasthoudt (gelockt, maar wel `is_counted_as_available`). Die tellen nu als vrij.
- De bekende afwijkingen in rij- en stoelnummers hierboven.
- Een grens voor relatienummers met veel stoelen, als vaste instelling in plaats van
  een veld in de interface.

## Testen

```bash
npm test
npx tsc --noEmit
```

`npm test` draait de tests met de ingebouwde testrunner van Node. Typescript wordt
gestript, en `scripts/test-hooks.mjs` vult de importpaden aan.
