# Wachtlijst

Omvang, verloop, leeftijd en postcode van de wachtlijst, uit de [Ringside API](ringside-api.md).
Pagina: `/dashboard/wachtlijst` (met login, geen ingang in de sidebar). Alleen aantallen.

> **Nog niet tegen de echte data gedraaid.** De opzet volgt wat van `/v1/sales` bekend is; de
> kolommen van `/v1/clients` en de naam van het product zijn niet vooraf gemeten. De tool zoekt
> ze daarom op naam en laat onder "Controle van de data" zien wat hij gebruikt heeft.

De assistent kan dezelfde cijfers gebruiken met de tool `wachtlijst` (`lib/wachtlijst/context.ts`),
voor wie Ticketing Stadion mag zien.

## Routes

| Route | Wat |
|---|---|
| `/dashboard/wachtlijst` | de pagina |
| `/api/wachtlijst` | de analyse als JSON; `?productId=` voor één product |
| `/api/wachtlijst/inlezen` | inlezen uit Ringside; cron elke nacht om 03:23 UTC, of met de knop |

Parameters van het inlezen: `?restart=1` (alles opnieuw), `?restart=clients` (alleen de
klantgegevens opnieuw), `?productId=<id>[,<id>]` (product met de hand kiezen, `auto` zet het
terug), `?chain=0`, `?force=1`, `?seconds=`.

## Inlezen

Ringside kan niet op product filteren (`lib/wachtlijst/ingest.ts`):

1. **Producten.** De wachtlijst is elk product met "wachtlijst" (of "waiting list") in de naam.
   Past er geen, dan toont de pagina de producten van het type `Memberships` om uit te kiezen.
   Ringside heeft er twee: "Pre wachtlijst" en "Wachtlijst". Beide worden ingelezen, maar de
   pagina toont alleen de wachtlijst zelf (`shownProductIds()`). Dat is een filter op wat
   getoond wordt en raakt het inlezen niet. `/api/wachtlijst?productId=<id>` geeft de pre
   wachtlijst alsnog.
2. **Verkoop.** `/v1/sales` wordt één keer helemaal doorgelopen (ruim 15 miljoen regels, een
   paar uur in een ketting van runs); alleen de regels van de wachtlijst blijven bewaard.
   Daarna leest een run alleen wat erbij kwam. Per `sales_item_id` wint de laatste versie.
3. **Klanten.** `/v1/clients` wordt doorgelopen voor het geboortejaar en de postcode van wie op
   de wachtlijst staat. Daarna volgt een run de wijzigingen. Wie zich nieuw inschrijft maar al
   langer klant is, komt daar niet in voor; daarvoor loopt de tool de klanten hooguit eens per
   week opnieuw door, of eerder als van meer dan 2% de gegevens ontbreken.

Een HTTP 205 (SeatGeek ververste de dataset) laat die stroom opnieuw beginnen.

## Definities

- **Op de wachtlijst:** een persoon met een geldende regel op het product: `sale_type` in
  `Sale`, `Reservation Confirmation` of `Update - New`, `current_status` waar en geen
  `forward_item_id`. Dezelfde definitie als een verkocht ticket, zonder `item_type`.
- **Instroom:** de `transaction_date` van de eerste inschrijfregel van een inschrijving
  (`product_item_id`).
- **Uitstroom:** de datum van de retour- of annuleringsregel van die inschrijving. Is die er
  niet, dan de dag van `last_touched_at`; de pagina meldt hoe vaak dat zo is.
- Periodes van dezelfde persoon die op elkaar aansluiten tellen als één, zodat een gewijzigde
  of doorgezette inschrijving geen uitstroom en instroom geeft.
- **Leeftijd:** het jaar van nu min het geboortejaar.
- **Postcode:** de vier cijfers van een Nederlandse postcode; België en Duitsland via het land.

## Opslag en persoonsgegevens

Vercel Blob, `ringside/wachtlijst/data.json.gz` (regels, klantgegevens en cursors) en
`state.json` (slot en laatste fout). Per persoon: een vingerafdruk van de klant-GUID
(`ownerFingerprint()`, niet terug te rekenen), het geboortejaar en de vier cijfers van de
postcode. Geen naam, adres, geboortedatum of klantnummer.

## Grafieken

De wachtlijst ging in mei 2026 open en liep toen in één of twee dagen vol. Een grafiek vanaf
nul en vanaf de eerste dag laat alleen die sprong zien. Daarom (`lib/wachtlijst/chart.ts`):

- **De start wordt afgeknipt** (`launchCut()`): de dagen in het begin waarop in één dag 5% of
  meer van de hoogste stand instroomde. De stand na de start staat apart als "Bij de start".
- **De as van de omvang zoomt in** op het bereik van de data (`zoomDomain()`) en begint dus
  niet bij nul; dat staat onder de grafiek.
- **Per dag en per week** in plaats van per maand; vergelijkingen met een jaar eerder zijn weg.
