# FANdesk — n8n koppelen

Het FANdesk dashboard (`/dashboard/fandesk`) toont statistieken over binnengekomen support
tickets. De data komt van een n8n workflow die elk uur de tickets ophaalt, categoriseert en
naar één endpoint POST.

## Endpoint

```
POST https://tools.psv.nl/api/fandesk/ingest
Authorization: Bearer <FANDESK_INGEST_SECRET>
Content-Type: application/json
```

Body: een object met een `items` array (een kale array mag ook). Per ticket:

| Veld | Verplicht | Toelichting |
|---|---|---|
| `id` | ja | Unieke ticket-id. String of getal. Wordt gebruikt om te ontdubbelen. |
| `category` | ja | `Tickets`, `FANstore`, `Wedstrijdinformatie` of `Overig`. |
| `created_at` | nee | ISO-8601 in UTC, bijv. `2026-07-30T12:55:41Z`. Ontbreekt hij, dan geldt het moment van binnenkomst. |

```json
{
  "items": [
    { "id": "48211", "category": "Tickets", "created_at": "2026-07-30T12:55:41Z" },
    { "id": "48212", "category": "FANstore", "created_at": "2026-07-30T13:04:02Z" }
  ]
}
```

Response:

```json
{
  "ok": true,
  "received": 2,
  "skipped": 0,
  "added": 2,
  "duplicates": 0,
  "unknownCategories": [],
  "byCategory": { "Tickets": 1, "FANstore": 1, "Wedstrijdinformatie": 0, "Overig": 0 },
  "batchAt": "2026-07-30T13:05:00.000Z"
}
```

## De laatste twee nodes in n8n

De workflow heeft losse items; een HTTP Request node zou daar één request per ticket van maken.
Voeg daarom achter de analyse-node twee nodes toe:

1. **Aggregate** — *Aggregate* op `All Item Data (Into a Single List)`, *Put Output in Field* op
   `items`. Alle tickets worden zo één item; `created_at` gaat automatisch mee.
2. **HTTP Request** — `POST` naar het endpoint hierboven.
   - *Send Headers* aan: `Authorization` = `Bearer <FANDESK_INGEST_SECRET>`. Gebruik liever een
     *Header Auth* credential, dan staat het secret niet in de workflow-JSON.
   - *Send Body* aan, *Body Content Type* `JSON`, *Specify Body* `Using JSON`, body:
     ```
     {{ JSON.stringify({ items: $json.items }) }}
     ```
   - Laat *Never Error* uit, zodat een mislukte push in n8n rood wordt.

In plaats van de Aggregate-node kan ook één **Code** node (*Run Once for All Items*):

```js
return [{ json: { items: $input.all().map(i => ({
  id: String(i.json.id),
  category: i.json.category,
  created_at: i.json.created_at,
})) } }];
```

## Gedrag om rekening mee te houden

- **Ontdubbeling op `id`.** Een handmatige re-run of een overlappende ophaalperiode telt niets
  dubbel. De uurlijkse schedule is dus niet kritisch: een gemiste run haal je met de volgende in.
- **Backfill kan.** Stuur oudere tickets met hun eigen `created_at`; ze landen op de juiste dag.
- **Lege batch is geldig** en levert `added: 0`. Een IF-node voor "geen tickets dit uur" is niet
  nodig.
- **Onbekende categorieën** worden als `Overig` geteld en teruggemeld in `unknownCategories` —
  handig om een mapping-fout in n8n te betrappen.
- **Maximaal 5000 items** per request; daarboven volgt een `413`.
- **Tijdzone.** `created_at` gaat in UTC de deur uit; het dashboard rekent dag- en uurgrenzen om
  naar Europe/Amsterdam, dus een ticket van 23:10 UTC verschijnt op de volgende dag om 01:10.

## Configuratie

| Env var | Waar | Toelichting |
|---|---|---|
| `FANDESK_INGEST_SECRET` | Vercel (Production + Preview) én n8n | Zelfde waarde aan beide kanten. |
| `BLOB_READ_WRITE_TOKEN` | Vercel | Al aanwezig; de tickets worden opgeslagen in Vercel Blob onder `fandesk/months/`. |

Testen dat de token klopt, zonder data te sturen:

```bash
curl -s https://tools.psv.nl/api/fandesk/ingest -H "Authorization: Bearer <secret>"
# → {"ok":true,"months":["2026-07"],"totalItems":128,"lastTicketAt":"...","oldestTicketAt":"..."}
```
