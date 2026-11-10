# Verkoopverloop (vrije verkoop en resale)

Hoe de verkoop van een wedstrijd verloopt naar de wedstrijddag toe, uitgesplitst naar
soort ticket, voor [Ticketing Stadion](ticketing-stadion.md) en
[Ticketing Herdgang](ticketing-herdgang.md). Vervangt de snapshots van de XML-feed.

## Stand

| Fase | Wat | Stand |
|---|---|---|
| 0 | Meten in Ringside hoe resale en seizoenkaart te herkennen zijn | klaar (10 november 2026) |
| 1 | Nieuwe ingest: verkoop per dag en per reeks, met terugwerkende kracht | gebouwd |
| 2 | Lopende wedstrijden uit de stoelstatus, meting per uur, eindstand bevriezen | nog niet |
| 3 | Grafiek in Ticketing Stadion: vrije verkoop / resale, spreiding van eerdere wedstrijden, piekdagen | nog niet |
| 4 | Dezelfde grafiek in Ticketing Herdgang | nog niet |
| 5 | Opruimen: `.github/workflows/ticket-snapshot.yml` roept een route aan die niet meer bestaat | nog niet |

## Reeksen

Per verkocht ticket (de definitie uit `lib/ringside/sales.ts`), de eerste regel die past:

| Reeks | Regel in `/v1/sales` |
|---|---|
| `resale` | `is_venue_resale = true`: het ticket van de koper uit de resale |
| `vrijkaart` | `price_type_group = 'Vrijkaarten'`, of `price_type` begint met `Vrijkaart` |
| `seizoenkaart` | `subscription_instance_id` gevuld |
| `vrij` | de rest: losse verkoop |

Wat de meting liet zien:

- **Seizoenkaart.** Een seizoenkaarthouder heeft per wedstrijd een gewone `Ticket`-regel
  op het `Event`-product, met `subscription_instance_id`, kanaal `Internal` en verkooppunt
  `SYSTEM`. De datum is het moment waarop die tickets zijn aangemaakt (begin augustus).
  `product_type = 'Series'` zegt alleen welk product de seizoenkaart is. Het veld is
  breder dan de seizoenkaart: ook een Europees ticket met 100% korting en een reeks
  vrijkaarten hebben het.
- **Resale.** `is_venue_resale` is bij tickets altijd `true` of `false`. De regel van de
  koper heeft de datum van de aankoop en in `previous_ticket_id` het ticket van de
  verkoper. De kaart van de verkoper is dan vervallen (`Resold - Refunded`) en telt niet
  meer mee; een doorverkocht ticket staat dus alleen bij `resale`.
- **Datum.** `transaction_date` is UTC met tijd. We tellen per Nederlandse kalenderdag.
- **Niet in de API-spec, wel in de stroom:** `resale_status`, `transfer_status`,
  `manifest_id`, `previous_ticket_id`, `new_ticket_id`, `original_sales_item_id`.

**Ticketing Stadion laat de seizoenkaarten weg** uit de grafieken, het tempo en de
vergelijkingen (`readMatchSales()`): ze zijn geen verkoop voor de wedstrijd zelf en staan
als één piek op de dag dat ze zijn aangemaakt. De reeks zelf blijft bewaard.
`/api/ticket-history` (rapportages) telt ze wel mee, omdat het daar om de bezetting gaat.

Parkeren en andere vakken die niet op de plattegrond staan, tellen apart (`otherTotal`)
en niet in de reeksen. Dat geldt voor PSV 1 thuis (Philips Stadion) en voor Jong PSV en
PSV Vrouwen (De Herdgang). Past geen enkel vak op de plattegrond, dan telt alles mee.

## Opslag

Vercel Blob, onder `ringside/verloop/`. Alleen aantallen, geen persoonsgegevens.

| Bestand | Inhoud |
|---|---|
| `live.json.gz` | wat de pagina's lezen: per wedstrijd, per reeks, een aantal per kalenderdag |
| `work.json.gz` | een doorloop die nog bezig is; vervangt `live` pas als hij compleet is |
| `state.json` | voortgang, het slot en de controles |

- **Per kalenderdag** en niet per dag-tot-de-wedstrijd: wordt een wedstrijd verplaatst,
  dan verschuift alleen de as. `readEventSales()` rekent om naar dagen tot de wedstrijd.
- **De cursors staan in het databestand.** Cursor en tellingen worden zo in één keer
  geschreven en lopen nooit uit elkaar.
- **Een onleesbaar bestand is een fout**, geen lege lijst. De run stopt en schrijft niets.

De bestanden van de vorige ingest (`ringside/sales-by-event.json` en
`ringside/ingest-state.json`) worden niet meer gelezen en kunnen weg.

## Ingest

`/api/ringside/ingest`, cron elk uur (`lib/ringside/sales-ingest.ts`). Elke run werkt de
productenlijst bij tot het eind en leest daarna de verkoop vanaf de cursor.

- **Eerste vulling:** ruim 15 miljoen regels, een paar uur. Een run start zelf de
  volgende. Tot hij klaar is, hebben de pagina's geen verkoop per dag.
- **`?restart=1`** begint een nieuwe doorloop. De pagina's houden de oude cijfers tot de
  nieuwe compleet is.
- **Ververste dataset.** SeatGeek ververst af en toe alles; Ringside antwoordt dan op een
  oude cursor met HTTP 205. De ingest begint dan vanzelf opnieuw, weer met behoud van de
  oude cijfers. `resets` en `lastResetAt` in het antwoord laten zien of dat gebeurd is.

### Wat er misging met de vorige ingest

Op 20 oktober 2026 ververste SeatGeek de dataset. De vorige ingest las de lege body van
de 205 als JSON en liep daar elke run op vast (`Unexpected end of JSON input`). Daarnaast
was het bestand met tellingen leeg geraakt: was het één keer niet te lezen, dan begon de
run met een lege lijst en schreef die terug. En de productenlijst werd maar één keer
gelezen, zodat later aangemaakte wedstrijden nooit verkoop kregen.

## Controles

Het antwoord van `/api/ringside/ingest` heeft een blok `check`:

- **`outOfOrder`**: regels die in de doorloop niet oplopen op `sales_item_id`. Is dit 0,
  dan kwam elke regel één keer langs en klopt het optellen.
- **`unknownProduct`**: verkochte tickets van een product dat niet in de productenlijst
  staat; die zijn niet geteld.
- **`resale`**: een steekproef die de regel van de koper koppelt aan de vervallen kaart
  van de verkoper. `sellerEarlier` betekent dat de verkoper zijn oorspronkelijke
  verkoopdatum houdt. Dan kan een doorverkocht ticket ook bij de vrije verkoop meetellen
  op de dag dat het voor het eerst verkocht werd.

## Bekende beperking

Bij het bijhouden levert Ringside een gewijzigde regel opnieuw aan, en optellen kan een
eerdere versie niet terugdraaien. Een ticket dat na verkoop wijzigt, kan dus dubbel
tellen, en een retour gaat er niet af. Voor gespeelde wedstrijden speelt dit niet. Voor
lopende wedstrijden lost fase 2 het op door de reeksen uit de stoelstatus te rekenen,
waar de laatste versie van een regel wint.
