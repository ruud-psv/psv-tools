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
  deze wedstrijd dat niet in de resale staat. Wie voor deze wedstrijd zelf een kaart in
  de resale heeft staan, valt helemaal af, ook met meerdere seizoenkaarten en maar één
  aangeboden, en ook als die kaart ergens anders in het stadion zit. Dat wordt vergeleken
  op eigenaar uit Ringside én op het relatienummer dat volgens de lijst op de aangeboden
  stoel zit. De teller "Zelf aanbieder" telt die relatienummers.
- **Doorverkocht.** Wie een kaart voor deze wedstrijd al via de resale heeft verkocht,
  valt ook helemaal af, met al zijn stoelen. Op die stoel zit dan een koper: een geldig
  ticket met `is_venue_resale = true`. Ringside noemt dan de koper als eigenaar, niet de
  verkoper, dus dit gaat alleen via het relatienummer dat volgens de lijst op die stoel
  zit. De teller "Doorverkocht" telt die relatienummers; wie ook nog iets aanbiedt, telt
  alleen bij "Zelf aanbieder". Zonder deze regel kwam de verkoper op de lijst, want de
  stoel leek bezet door hem.
- **Eén regel per relatienummer.** In de testkolommen staan alleen de stoelen die aan
  een vrije stoel grenzen. Zijn dat er meer, dan staan ze met een komma achter elkaar.
- **Grens per relatienummer.** Optioneel in de interface: relatienummers met meer dan
  N stoelen laten we weg, bijvoorbeeld zakelijke accounts. Standaard is er geen grens.
- **Groepjes vrije stoelen.** Vrije stoelen met opeenvolgende stoelnummers in dezelfde rij
  vormen een groepje. Boven de plattegrond staan drie tellers: hoeveel losse vrije stoelen
  (één stoel), hoeveel keer twee naast elkaar, en hoeveel groepjes van drie of meer, met
  het aantal stoelen erin. Samen tellen ze op tot de vrije stoelen. Voor en achter telt
  hier niet mee, en een gat in de nummering (trap) breekt een groepje
  (`countFreeGroups()` in `neighbors.ts`).

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
- **Vakweergave:** wijs een vak aan en rechts van de kaart (op een smaller scherm
  eronder) verschijnen de stoelen van dat vak, zoals in de ticketshop: het veld boven,
  per rij de stoelen, met de rijnummers aan beide kanten (`components/area-seat-view.tsx`).
  Rood is vrij, rood met een witte stip vrij via de resale, goud een seizoenkaarthouder
  op de lijst, grijs bezet, grijs met een witte stip bezet door een koper uit de resale
  (doorverkocht) en wit met een rand geblokkeerd. Erboven staan de cijfers van
  het vak en de groepjes vrije stoelen. Wijs een stoel aan voor rij en stoelnummer.
  Klikken zet het vak vast, zodat je met de muis naar de stoelen kunt; nog een keer
  klikken of "Vastgezet" maakt het weer los.
- **Schema op nummer:** Ringside kent alleen vak, rij en stoelnummer, niet de echte vorm
  van het vak. Kolommen zijn dus stoelnummers en rijen rijnummers (laag aan het veld),
  net als bij de regels voor buren. Het hoogste stoelnummer staat links, zoals in de
  ticketshop (vastgesteld in vak PR, november 2026). Waar de nummering in alle rijen
  overslaat, staat een smalle opening; meestal is dat een trap.
- **Data:** "Maak lijst" stuurt per vak de stoelen mee, compact: per rij het eerste
  stoelnummer en één teken per stoel (`lib/aangrenzende-stoelen/seat-map.ts`). Voor het
  hele stadion is dat zo'n 45 kB. Uitgesloten vakken zitten er niet in.
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
| `/v1/sales` | alleen tickets die nu een stoel bezet houden, met resale-vlaggen en een hash van de eigenaar | `sales_item_id` |

Een ticket houdt een stoel bezet als hij geldig is: `item_type = 'Ticket'`,
`current_status = true`, geen `forward_item_id`, en een `sale_type` van `Sale`,
`Reservation`, `Reservation Confirmation` of `Update - New`. Een openstaande reservering
telt dus mee: die stoel is ook niet vrij te koop.

Ringside levert elke nieuwe versie van een rij opnieuw. Bijwerken is daarom altijd
"de laatste versie wint", nooit optellen. Een vervallen ticket verdwijnt.

### Resale in Ringside

Per ticket bewaren we twee vlaggen (`resaleFlags()` in `lib/ringside/seat-state.ts`):
1 = aangeboden (`resale_status = 'Posted'`), 2 = via de resale gekocht
(`is_venue_resale = true`). Zo ziet een doorverkoop eruit in `/v1/sales`, gemeten op
2026-11-04 met de probe (`distinct=sale_type+resale_status+current_status` en
`is_venue_resale+sale_type+resale_status`, eerste pagina van 5.000 regels):

| Moment | Regel | Op die pagina |
|---|---|---|
| Aangeboden | `Sale`, `Posted`, geldig | 7 |
| Verkocht: kaart van de verkoper | `Sale`, `Resold - Refunded`, niet meer geldig | 18 |
| Verkocht: terugbetaling | `Return`, `Resold - Refunded`, niet meer geldig | 24 |
| Verkocht: kaart van de koper | `Sale`, `is_venue_resale = true`, geldig | 20 |

`transfer_status` was op die pagina overal leeg, en `sale_type` `Resale` of `Transfer`
kwam niet voor.

**Vergeleken met de ticketshop** (PSV - Go Ahead Eagles, 4 november 2026): per vak het
aantal vrije stoelen in de tool naast "plaatsen beschikbaar" in de ticketshop. 38 van de
41 vakken waren gelijk; UU, ZZ en YY scheelden samen 5 (616 tegen 611), passend bij
verkoop tussen beide momenten. Van de 11 aangeboden stoelen zaten er 9 in vakken die
precies klopten, dus de ticketshop telt `Posted` mee als te koop. In vak K was de enige
vrije stoel een aangeboden stoel, en de ticketshop had daar precies 1 plaats. "Posted"
is dus "aangeboden in de ticketshop". Of `is_venue_resale` precies de doorverkopen uit
Unify zijn, is nog te controleren met de resale-export (zie hieronder).

- **Code:** `lib/ringside/seat-state.ts` (hoe een rij de stand verandert, getest),
  `lib/ringside/seat-ingest.ts` (lezen) en `lib/ringside/seat-store.ts` (opslag).
- **Opslag:** Vercel Blob onder `ringside/stoelen/`: per wedstrijd één gzip-bestand,
  plus een index en de toestand met cursors.
- **Aftrap:** `manifests.event_date` staat in UTC. Bij het inlezen wordt hij Nederlandse
  tijd, met de offset erbij (`2026-11-28T18:45:00+01:00`). Tijden die al in de opslag
  stonden, zet de eerstvolgende run één keer om. Daarvoor stond de aftrap een uur te vroeg
  (in de zomer twee). Ticketing Stadion en De Herdgang lezen dezelfde opslag.
- **Eigenaar:** van `own_client_guid` bewaren we alleen een korte SHA-256-hash. Die is
  genoeg om te zien of twee tickets van dezelfde persoon zijn.
- **Cron:** `/api/ringside/stoelen`, elk kwartier. Met een ingelogde sessie is de route
  ook handmatig te starten. Op de pagina heet die knop "Start" of "Ga verder".
- **Eerste vulling:** leest de hele historie van beide stromen, met ongeveer 3.000
  rijen per seconde. Dat duurt een paar uur. Een run start zelf de volgende, net als
  `/api/ringside/ingest`.
- **Inhaalrondes:** velden die later zijn gaan meetellen, vult een eenmalige extra ronde
  door de stroom aan: capaciteit, openstaande reserveringen en sinds november 2026
  "via de resale gekocht" (`applySalesVenueResale()`). Ook dat duurt een paar uur. Tot
  die laatste klaar is, toont de pagina onder "Maak lijst" een melding: oudere
  doorverkopen ontbreken dan nog, dus die verkopers kunnen nog op de lijst staan.
- **Actueel bij "Maak lijst":** eerst haalt de tool maximaal 25 seconden de nieuwste
  mutaties op, daarna rekent hij. Loopt er al een run, dan rekent hij met de vorige
  stand en zegt dat erbij.
- **HTTP 205:** SeatGeek heeft een dataset ververst. Die stroom begint dan opnieuw en
  de bijbehorende data wordt weggegooid.
- **Slot:** er draait nooit meer dan één run tegelijk, ook niet tussen de cron en
  "Maak lijst". De cursors schuiven pas op nadat de data is opgeslagen.

## Resale-export

Naast "Download CSV" staat de knop **Resale**, met het aantal erbij. Die levert per
ticket in de resale één regel: `vak`, `rij`, `stoel`, `status`, `sales_item_id` en
`relatienummer`. Bedoeld om naast Unify te leggen.

- **Status:** `aangeboden`, `doorverkocht`, of `doorverkocht, opnieuw aangeboden` (de
  koper biedt hem zelf weer aan).
- **Relatienummer:** uit de lijst seizoenkaarthouders, op de stoel. Bij een doorverkochte
  stoel is dat dus de verkoper. Leeg als de stoel niet op die lijst staat.
- **Alle vakken**, ook de vakken die de lijst verder uitsluit (rolstoelvakken, BEZOEKERS).
- Code: `lib/aangrenzende-stoelen/resale.ts`. De export komt mee met "Maak lijst", dus
  met dezelfde stand van Ringside.

## Doorzetten naar Maileon

Onder een gemaakte lijst staat "Doorzetten naar Maileon". Dat maakt in Maileon een
contactfilter op relatienummer. De doelgroep maakt Digital Marketing daarna zelf in
Maileon, nadat die de Ticketing-regel heeft toegevoegd (zie hieronder). Code:
`lib/aangrenzende-stoelen/maileon.ts` en `app/api/aangrenzende-stoelen/maileon/route.ts`. Het
filter zelf maakt `lib/maileon/contact-filters.ts`, dat ook
[Contact Filter Import](contact-filter-import.md) gebruikt. Die tool maakt wel meteen een
doelgroep; deze bewust niet, vanwege de Ticketing-regel hieronder.

- **Naam** (filter, en later de doelgroep), volgens de conventie van Digital Marketing:
  `2026.10.31 PSV Kaartverkoop - Aangrenzende stoelen PSV - Willem II - DMID26-12345`.
  In de interface vul je de verzenddatum en het DMID in. Zonder DMID wordt het
  `DMID26-XXXX` (het jaar van de verzenddatum).
- **Filter:** begint leeg en voegt iedereen toe van wie het custom veld
  `MEMBERNUMBERPRIOR` (het relatienummer) in de lijst staat. Let op: `MEMBERNUMBER`
  bestaat ook, maar is niet het relatienummer. Ongeveer de helft van de contacten in
  Maileon heeft een relatienummer.
- **Ticketing-regel met de hand:** kaartverkoop mag alleen contacten mailen met de
  preference `Ticketing` in de preference group `Email` op ja (op de voorkeurenpagina
  `psv-voorkeuren-algemeen`: "PSV Kaartverkoop thuiswedstrijden"). De API van Maileon wijst
  elk filter met een `contactpreference`-regel af met alleen "Unable to create the contact
  filter". Getest op 2026-10-13 in drie vormen: `intersection`, `remove` (nee en niet
  ingevuld eruit) en een filter op "zit in hulpfilter", ook in de exacte vorm uit de
  wiki. Filters met alleen relatienummers lukken wel. Daarom maakt de tool **geen
  doelgroep**: na het doorzetten toont de pagina de stappen (filter openen, onderaan een
  regel "alleen Email › Ticketing = ja" toevoegen, dan een doelgroep op het filter maken
  met dezelfde naam). Zo kan niemand mailen naar een doelgroep zonder die regel.
  Let op: de CSV-export is níet op deze preference gefilterd. Ringside kent de
  preferences niet.
- **De lijst wordt opnieuw uitgerekend** met dezelfde berekening als "Maak lijst"
  (`lib/aangrenzende-stoelen/build-list.ts`). De relatienummers komen dus nooit uit de
  browser.
- **API:** `POST /contactfilters/v2`, daarna een refresh zodat Maileon het filter meteen
  doorrekent.
- **Regels:** volg het JSON-schema (`contactfilter.json`) uit de XQueue-wiki "Creating
  and Updating Contactfilters Using the REST API", niet de losse documentatiepagina's. Volgens
  dat schema heet de operator `includedin` (niet `includein`) en mag een regel hooguit 100
  waarden hebben. De lijst gaat daarom in blokken van 100, elk een eigen "add"-regel.
  Maileon staat hooguit 100 regels per filter toe; er blijft er één vrij voor de
  Ticketing-regel, dus er passen 9.900 relatienummers in.
- **Minder contacten dan relatienummers** is normaal: niet iedere seizoenkaarthouder staat
  in Maileon, en na de Ticketing-regel valt iedereen af die hem niet op ja heeft.
- **Sleutel:** `MAILEON_API_KEY` in Vercel (de API-sleutel "PSV Tools II" in Maileon).
  Elke keer doorzetten maakt een nieuw filter; opruimen gaat in Maileon zelf.

## Effect van een mail

Onderaan de pagina: achteraf zien wat een mail over aangrenzende stoelen opleverde. Je
vult het moment van de mail in (Nederlandse tijd), kiest de wedstrijd (standaard de
eerste thuiswedstrijd na dat moment) en plakt de relatienummers die de mail kregen.
Per relatienummer komt eruit welke buurstoelen bij de mail vrij waren, of die daarna
verkocht zijn, en of de houder hem zelf kocht of iemand anders. Download als CSV, één
regel per buurstoel.

**Inlezen.** De stoelstatus is hier niet genoeg: die bewaart geen verkoopmoment en wist
een wedstrijd zodra hij gespeeld is. Daarom leest "Lees verkoop in" de hele stroom
`/v1/sales` één keer door en bewaart alle ticketregels van die wedstrijd, ook vervallen
regels en retouren, met `transaction_date` en de gehashte eigenaar. Dat duurt een paar
uur, in een ketting van runs, net als de instroom van Ticketing Stadion. Er wordt één
wedstrijd tegelijk ingelezen; een wedstrijd die klaar is, blijft bruikbaar en is met
"Bijwerken" vanaf zijn eigen cursor snel bij te lezen.

- Code: `lib/aangrenzende-stoelen/effect-data.ts` (een regel verwerken),
  `effect-ingest.ts` (de ketting), `effect-store.ts` (opslag) en
  `app/api/aangrenzende-stoelen/effect/inlezen/route.ts` (`?productId=`, `?restart=1`,
  `?chain=0`, `?force=1`, zoals de instroom).
- Opslag: Vercel Blob onder `aangrenzende-stoelen/effect/`: `state.json` en per wedstrijd
  `<product-id>.json.gz`. Geen relatienummers of namen; ids en eigenaren alleen gehasht.

**Regels** (`lib/aangrenzende-stoelen/effect.ts`, getest in `effect.test.ts`):

- **Buurstoel:** links, rechts, voor of achter, in hetzelfde vak, zoals bij de lijst.
  Uitgesloten vakken doen niet mee. De eigen stoelen komen uit de lijst
  seizoenkaarthouders die nu op de pagina staat.
- **Bezet op een moment:** een ticket dat nu nog geldig is en vóór dat moment gekocht;
  of een vervallen ticket van daarvoor zonder retour of annulering (`Return`,
  `Reservation Cancellation`, `Confirmed Reservation Return`) op die stoel ertussen.
- **Vrij bij de mail:** niet bezet en niet geblokkeerd. Of bezet door een kaart die
  daarna via de resale is doorverkocht ("in de resale"); wanneer hij werd aangeboden,
  staat niet in Ringside.
- **Verkocht na de mail:** er staat nu een geldig ticket op dat op of na het moment van
  de mail gekocht is, ook een openstaande reservering.
- **Zelf of iemand anders:** "zelf" als de eigenaar van de koper (`own_client_guid`,
  gehasht) dezelfde is als die van de seizoenkaart van de houder voor deze wedstrijd.
  Een huisgenoot met een eigen account telt dus als iemand anders.
- **Extra kaarten zelf:** alle kaarten voor deze wedstrijd die de houder na de mail zelf
  kocht, in een tribunevak buiten zijn eigen stoelen. Parkeren telt niet.
- **Uitkomst per relatienummer**, de eerste die past: zelf gekocht (de buurstoel), zelf
  gekocht andere stoel, door ander gekocht, verkocht koper onbekend, niet verkocht, geen
  vrije buurstoel, niet in de lijst. Bij "geen vrije buurstoel" toont de tool buurstoelen
  die in de 24 uur vóór de mail verkocht zijn: dan stond iemand terecht op de lijst, maar
  was de stoel bij het versturen al weg.
- **Ter vergelijking:** welk deel van alle andere vrije stoelen in het stadion na de mail
  verkocht is.
- **Stoelenkaart:** van een gespeelde wedstrijd is die er niet meer. Dan komt hij van de
  eerstvolgende thuiswedstrijd, zoals bij de instroom; welke stoelen geblokkeerd zijn kan
  per wedstrijd iets verschillen. De pagina zegt welke gebruikt is.

**Nog te controleren met echte data:** of `transaction_date` van de kaart van een
verkoper na een doorverkoop de oorspronkelijke datum houdt, en of retouren een stoel
hebben. De pagina telt retouren zonder stoel ("diagnostics"); zijn dat er veel, dan
kunnen teruggegeven stoelen ten onrechte als bezet tellen.

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
