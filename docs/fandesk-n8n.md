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
| `topic` | nee | Korte geanonimiseerde onderwerpregel. Hierop draait de samenvatting op het dashboard. Zonder dit veld blijven de aantallen werken, maar komt er geen inhoud. |

```json
{
  "items": [
    {
      "id": "48211",
      "category": "Tickets",
      "created_at": "2026-07-30T12:55:41Z",
      "topic": "terugbetaling na afgelaste wedstrijd"
    },
    {
      "id": "48212",
      "category": "Wedstrijdinformatie",
      "created_at": "2026-07-30T13:04:02Z",
      "topic": "vervoer en parkeren rond uitwedstrijd Ajax"
    }
  ]
}
```

### De onderwerpregel

De `topic` wordt geschreven door de AI-node in de workflow — zie
[Message a model](#message-a-model) voor de instructie.

De ingest maakt de regel daarna alsnog schoon: e-mailadressen, telefoonnummers en cijferreeksen
van vijf of meer worden vervangen door `…`, en de tekst wordt afgekapt op 120 tekens. Dat is een
vangnet, geen vrijbrief — de instructie hierboven blijft de eerste verdediging, want een
taalmodel dat om anonimisering wordt gevraagd doet dat niet gegarandeerd.

Wat er met de onderwerpregels gebeurt: zodra een batch is opgeslagen, werkt de ingest de
samenvatting van de betrokken dag bij met één Claude-call. Dat gebeurt ná het antwoord aan n8n,
dus je HTTP Request node wordt er niet langzamer van en een storing in die analyse kan het
opslaan van tickets niet laten mislukken. Op het dashboard verschijnen daardoor zonder klikken:
de meest voorkomende vragen, een samenvatting per dag, en een "Let op"-banner als er veel vragen
over één onderwerp binnenkomen.

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

## De workflow in n8n

De keten ziet er zo uit:

```
Schedule Trigger → Code → Get many tickets → Filter → Code in Batches
  → Message a model → Code Parse → Aggregate → HTTP Request
```

Per node wat er moet gebeuren:

| Node | Wijziging |
|---|---|
| Schedule Trigger, Code, Get many tickets, Filter | Geen. |
| **Code in Batches** | Zorg dat de tickettekst meegaat naar het model — zonder tekst kan er geen onderwerpregel geschreven worden. |
| **Message a model** | Prompt uitbreiden: per ticket náást `category` ook `topic`, en de `id` mee-echoën. |
| **Code Parse** | `topic` doorgeven in het item dat de node teruggeeft, en op `id` matchen in plaats van op positie. |
| Aggregate | Geen — neemt alle velden van een item mee. |
| HTTP Request | Geen — stuurt `$json.items` in z'n geheel door. |

De onderwerpregel ontstaat dus in **Message a model** (de enige node die de tickettekst ziet) en
wordt doorgegeven in **Code Parse**. De twee nodes daarna hoef je niet aan te raken.

### Message a model

Laat het model per ticket een object teruggeven met drie velden. De `id` mee-echoën is geen
overbodige luxe — zie de waarschuwing bij Code Parse.

```json
[
  { "id": "48211", "category": "Tickets", "topic": "terugbetaling na afgelasting" },
  { "id": "48212", "category": "Wedstrijdinformatie", "topic": "vervoer en parkeren rond uitwedstrijd Ajax" }
]
```

De instructie voor `topic`:

> Vat de vraag samen in maximaal 10 woorden Nederlands, als onderwerp — niet als vraag.
> Noem geen namen, e-mailadressen, ordernummers of ticketnummers. Wel het onderwerp waar het
> over gaat, inclusief de wedstrijd of het product als dat de kern is.
> Voorbeeld: `vervoer en parkeren rond uitwedstrijd Ajax`.
>
> Geef de `id` van het ticket ongewijzigd terug, zodat de koppeling klopt.

### Code Parse

Deze node zet de modeloutput om in items. Voeg `topic` toe aan het object dat je teruggeeft:

```js
// De batch waar het model op werkte, op id ontsloten
const batch = new Map($input.all().map(i => [String(i.json.id), i.json]));

return parsed.map(row => {
  const ticket = batch.get(String(row.id));
  if (!ticket) return null;            // geen match → overslaan, niet doorschuiven
  return {
    json: {
      id: String(row.id),
      category: row.category,
      created_at: ticket.created_at,
      topic: row.topic,
    },
  };
}).filter(Boolean);
```

**Let op bij het koppelen.** Als je de modeloutput op positie aan de batch zipt, verschuift bij
een batch waar het model één regel minder teruggeeft alles één op — en krijgt een ticket het
onderwerp én de categorie van zijn buur. Dat risico bestaat al voor `category`, maar met een
onderwerpregel erbij wordt een verkeerde koppeling zichtbaar in het dashboard. Match daarom op
`id` en sla tickets zonder match over.

De ingest accepteert naast `topic` ook `subject`, `onderwerp` en `samenvatting` als veldnaam, dus
als je parse-node al een van die namen uitspuugt hoef je niets om te noemen.

### Aggregate en HTTP Request

Deze twee zorgen voor de bezorging en veranderen niet:

1. **Aggregate** — *Aggregate* op `All Item Data (Into a Single List)`, *Put Output in Field* op
   `items`. Alle tickets worden zo één item; `created_at` en `topic` gaan automatisch mee.
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
  topic: i.json.topic,
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
| `BLOB_READ_WRITE_TOKEN` | Vercel | Al aanwezig; de tickets worden opgeslagen in Vercel Blob onder `fandesk/months/`, de samenvattingen onder `fandesk/summaries/`. |
| `ANTHROPIC_API_KEY` | Vercel | Al aanwezig voor de andere AI-inzichten. Nodig voor de samenvattingen; ontbreekt hij, dan blijven de aantallen werken en blijft de inhoudelijke kaart leeg. |

Testen dat de token klopt, zonder data te sturen:

```bash
curl -s https://tools.psv.nl/api/fandesk/ingest -H "Authorization: Bearer <secret>"
# → {"ok":true,"months":["2026-07"],"totalItems":128,"lastTicketAt":"...","oldestTicketAt":"..."}
```
