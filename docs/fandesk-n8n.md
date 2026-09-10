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
| `created_at` | nee | ISO-8601 in UTC, bijv. `2026-09-10T12:55:41Z`. Ontbreekt hij, dan geldt het moment van binnenkomst. |
| `soort` | nee | Freshdesk `cf_soort`, het bovenste niveau. Bijv. `Thuiswedstrijden`. |
| `type` | nee | Freshdesk `cf_type`. Bijv. `Kaartverkoop`. |
| `subtype` | nee | Freshdesk `cf_subtype`. Bijv. `Champions League`. |
| `inferred` | nee | `true` als het model de indeling heeft ingevuld omdat Freshdesk hem leeg liet. |
| `topic` | nee | Korte geanonimiseerde onderwerpregel; hierop draait de samenvatting. |

De drie taxonomievelden mogen op drie manieren binnenkomen, dus je hoeft in n8n niets te mappen
als je het Freshdesk-ticket ongewijzigd doorgeeft:

- plat: `soort`, `type`, `subtype`
- met Freshdesk-prefix: `cf_soort`, `cf_type`, `cf_subtype`
- genest: `custom_fields: { cf_soort, cf_type, cf_subtype }`

Een leeg veld mag `null`, `""`, `"-"` of de letterlijke string `"null"` zijn; dat wordt allemaal
als "niet ingevuld" gelezen.

```json
{
  "items": [
    {
      "id": "48211",
      "created_at": "2026-09-10T12:55:41Z",
      "soort": "Thuiswedstrijden",
      "type": "Kaartverkoop",
      "subtype": "Champions League",
      "topic": "terugbetaling na afgelasting"
    },
    {
      "id": "48212",
      "created_at": "2026-09-10T13:04:02Z",
      "soort": "Uitwedstrijden",
      "type": "Vervoer",
      "subtype": "Bus",
      "inferred": true,
      "topic": "vertrektijd supportersbus"
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
  "bySoort": { "Thuiswedstrijden": 1, "Uitwedstrijden": 1 },
  "inferred": 1,
  "withoutSoort": 0,
  "batchAt": "2026-07-30T13:05:00.000Z"
}
```

## De workflow in n8n

De keten ziet er zo uit:

```
Schedule Trigger → [Taxonomie] → Code → Get many tickets → Filter
  → Code in Batches → Message a model → Code Parse → Aggregate → HTTP Request
```

| Node | Wijziging |
|---|---|
| Schedule Trigger, Get many tickets, Filter | Geen. |
| Code | Alleen als hij uit `items` of `$json` leest — zie hieronder. |
| **Code in Batches** | De drie Freshdesk-velden plat meegeven, plus een vlag of het ticket ingedeeld moet worden. |
| **Taxonomie (nieuw)** | HTTP GET die de woordenlijst ophaalt waaruit het model mag kiezen. |
| **Message a model** | Schrijft altijd `topic`; vult soort/type/subtype alléén in als Freshdesk ze leeg liet. |
| **Code Parse** | Freshdesk-waarden winnen; modelwaarden alleen als vangnet, met `inferred: true`. |
| Aggregate | Geen — neemt alle velden van een item mee. |
| HTTP Request | Geen — stuurt `$json.items` in z'n geheel door. |

**De indeling komt uit Freshdesk, niet uit het model.** Dat is betrouwbaarder, gratis en het is de
indeling die de organisatie zelf hanteert. Het model doet nog twee dingen: het schrijft de
onderwerpregel, en het springt bij wanneer `cf_soort` leeg is.

### Code in Batches

Geeft de drie Freshdesk-velden plat mee en zet een vlag of het ticket nog ingedeeld moet worden.
De velden blijven in `ticket_batch` staan voor de parse-node; naar het model gaat een kleinere
projectie, wat tokens scheelt.

```js
const BATCH_SIZE = 20;

// Freshdesk levert een leeg keuzeveld soms als null en soms als de string "null".
const clean = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /^(null|undefined|n\/a|-)$/i.test(trimmed)) return null;
  return trimmed;
};

const allTickets = items.map(item => {
  const cf = item.json.custom_fields || {};
  const soort = clean(cf.cf_soort);
  return {
    id: item.json.id,
    subject: item.json.subject,
    description_text: item.json.description_text || '',
    created_at: item.json.created_at,
    soort,
    type: clean(cf.cf_type),
    subtype: clean(cf.cf_subtype),
    // Alleen tickets zonder soort hoeft het model in te delen.
    needs_classification: soort === null
  };
});

const batches = [];
for (let i = 0; i < allTickets.length; i += BATCH_SIZE) {
  batches.push(allTickets.slice(i, i + BATCH_SIZE));
}

return batches.map(batch => ({
  json: {
    ticket_batch: batch,
    batch_size: batch.length,
    to_classify: batch.filter(t => t.needs_classification).length,
    ticket_batch_json: JSON.stringify(batch.map(t => ({
      id: t.id,
      subject: t.subject,
      description_text: t.description_text,
      needs_classification: t.needs_classification
    })))
  }
}));
```

### HTTP: de woordenlijst ophalen

```
GET https://tools.psv.nl/api/fandesk/taxonomy
```

Zelfde credential als de push: *Generic Credential Type* → *Header Auth* → `Fandesk Ingest Auth`.
Het endpoint accepteert zowel een `Authorization: Bearer <secret>`-header als
`x-fandesk-secret: <secret>`, dus welke van de twee in je credential staat maakt niet uit.

**Waar hang je hem: lineair, direct achter de Schedule Trigger**, vóór de bestaande `Code`-node.
En noem hem exact `Taxonomie` — daar verwijst de prompt straks naar.

Twee plaatsingen die niet werken:

- *Tussen Code in Batches en het model.* **Een HTTP Request node vervangt het item dat
  doorstroomt door zijn eigen response.** Bij `Message a model` is `$json` dan de woordenlijst en
  niet meer je batch, dus `{{ $json.ticket_batch_json }}` levert niets op en het model krijgt een
  lege ticketlijst — zonder foutmelding, de node wordt gewoon groen. Daarbovenop draait hij daar
  één keer per batch. Moet hij toch op die plek blijven staan, verwijs dan in de Prompt expliciet
  naar de node ervoor: `{{ $('Code in Batches').item.json.ticket_batch_json }}`.
- *Als aparte tak naast de Schedule Trigger.* Bij twee parallelle takken bepaalt n8n zelf de
  volgorde, en `$('Taxonomie')` werkt alleen als die node in deze uitvoering al gedraaid heeft.

Let op bij lineaire plaatsing: de node vervangt het item dat doorstroomt. Leest je eerste
`Code`-node uit `items` of `$json` van de trigger, pas die dan aan; rekent hij alleen met `$now`
of een vaste datum, dan verandert er niets.

Het endpoint geeft terug welke soort/type/subtype-combinaties de afgelopen 180 dagen echt uit
Freshdesk zijn binnengekomen:

```json
{
  "soorten": [
    { "soort": "Thuiswedstrijden", "count": 812,
      "types": [ { "type": "Kaartverkoop", "count": 540,
        "subtypes": [ { "subtype": "Champions League", "count": 210 } ] } ] }
  ],
  "basedOnTickets": 1240,
  "windowDays": 180,
  "generatedAt": "2026-09-10T08:00:00.000Z"
}
```

Waarden die het model zelf heeft ingevuld tellen hier **niet** in mee. Zou dat wel zo zijn, dan
ziet het model zijn eigen gokken terug als bewijs en groeit de taxonomie met waarden die
Freshdesk nooit gebruikt heeft.

Bij de allereerste run is de lijst leeg — er is dan nog niets binnengekomen. Het model vult dan
niets in, wat correct is; zodra er tickets mét ingevulde velden binnen zijn vult de lijst zich
vanzelf.

### Message a model

Laat het model per ticket een object teruggeven. `topic` altijd; de indelingsvelden alleen als
vangnet. De `id` mee-echoën is geen overbodige luxe — zie de waarschuwing bij Code Parse.

```json
[
  { "id": "48211", "topic": "terugbetaling na afgelasting" },
  { "id": "48212", "topic": "vertrektijd supportersbus",
    "soort": "Uitwedstrijden", "type": "Vervoer", "subtype": "Bus" }
]
```

### Waar zet je dit in de node

- De instructietekst hieronder hoort in het veld **System Message**, onderaan de node.
- De user-**Prompt** blijft `{{ $json.ticket_batch_json }}`; daar verandert niets.
- **Zet System Message op Expression.** Hover over het veld en klik erboven op *Expression* in
  plaats van *Fixed*. Staat het op *Fixed*, dan komt `{{ ... }}` letterlijk in de prompt terecht
  en merk je daar niets van — het model gokt dan gewoon wat.

Onderaan de System Message de woordenlijst, als expressie:

```
BESCHIKBARE INDELING (kies uitsluitend hieruit):
{{ $('Taxonomie').first().json.soorten.map(s => s.soort + ' > ' + s.types.map(t => t.type + ' (' + t.subtypes.map(x => x.subtype).join(', ') + ')').join(' | ')).join('\n') }}
```

Dat rendert leesbare regels in plaats van ruwe JSON met tellingen, die voor een keuzetaak alleen
ruis zijn:

```
Thuiswedstrijden > Kaartverkoop (Champions League, Eredivisie) | Vervoer (Bus)
FANstore > Bestelling (Retour, Maat)
```

`$('Taxonomie')` werkt alleen als de HTTP-node exact **Taxonomie** heet. Bij de allereerste run
is de lijst leeg en blijft dit blok leeg; de regel "laat de velden weg als je twijfelt" zorgt dan
dat het model niets invult, wat het gewenste gedrag is.

### De instructie

> Geef de `id` van het ticket ongewijzigd terug, zodat de koppeling klopt.
>
> **topic** — Vat de vraag samen in maximaal 10 woorden Nederlands, als onderwerp, niet als
> vraag. Noem geen namen, e-mailadressen, ordernummers of ticketnummers. Wel het onderwerp waar
> het over gaat, inclusief de wedstrijd of het product als dat de kern is.
> Voorbeeld: `vervoer en parkeren rond uitwedstrijd Ajax`.
>
> **soort, type en subtype** — Vul deze **alleen** in wanneer het ticket geen `cf_soort` heeft.
> Heeft het ticket die wel, laat de velden dan weg: de indeling van Freshdesk is leidend.
> Kies uitsluitend uit de meegegeven woordenlijst en houd de combinatie geldig: een `type` moet
> bij de gekozen `soort` horen, een `subtype` bij het gekozen `type`. Verzin nooit een nieuwe
> waarde. Twijfel je, laat de velden dan leeg — niets invullen is beter dan gokken.

### Code Parse

Deze node parseert de JSON uit Claude's antwoord en koppelt die op `id` terug aan de originele
tickets. Zo komen `created_at` én de Freshdesk-indeling uit de bron, en niet uit het model:

```js
const results = [];
const errors = [];
const skipped = [];

// Lookup van alle originele tickets (id -> created_at), zodat Claude's output
// op id terugkoppelt in plaats van op positie.
const ticketLookup = {};
const batch = new Map();
for (const item of $('Code in Batches').all()) {
  for (const ticket of item.json.ticket_batch) {
    ticketLookup[String(ticket.id)] = ticket.created_at;
    batch.set(String(ticket.id), ticket);
  }
}

for (const [batchIndex, item] of items.entries()) {
  try {
    const rawText = item.json.content[0].text;
    const cleanText = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanText);

    if (!Array.isArray(parsed)) {
      throw new Error(`Claude gaf geen array terug maar ${typeof parsed}`);
    }

    for (const ticket of parsed) {
      const id = String(ticket.id ?? '').trim();
      const created_at = ticketLookup[id];

      // Geen match betekent dat Claude het id heeft aangepast of verzonnen.
      // Dan liever overslaan dan met een verkeerd tijdstip doorsturen.
      if (!id || created_at === undefined) {
        skipped.push({ batch_index: batchIndex, id: ticket.id ?? null });
        continue;
      }

      // Freshdesk wint altijd. Het model springt alleen bij waar soort leeg is,
      // en dan gaat inferred mee zodat het dashboard dat kan laten zien.
      const bron = batch.get(id) || {};
      const heeftFreshdesk = Boolean(bron.soort);

      results.push({
        json: {
          id,
          created_at,
          topic: typeof ticket.topic === 'string' ? ticket.topic.trim() : undefined,
          soort: heeftFreshdesk ? bron.soort : ticket.soort,
          type: heeftFreshdesk ? bron.type : ticket.type,
          subtype: heeftFreshdesk ? bron.subtype : ticket.subtype,
          inferred: !heeftFreshdesk && Boolean(ticket.soort)
        }
      });
    }
  } catch (err) {
    errors.push({
      batch_index: batchIndex,
      raw_output: item.json.content?.[0]?.text || 'geen content gevonden',
      error_message: err.message
    });
  }
}

if (errors.length > 0) {
  console.log('Parse errors:', JSON.stringify(errors));
}
if (skipped.length > 0) {
  console.log(`${skipped.length} ticket(s) overgeslagen omdat het id niet terug te vinden was:`, JSON.stringify(skipped));
}

return results;
```

**Waarom een ticket zonder match wordt overgeslagen en niet met `created_at: null` doorgestuurd.**
De ingest behandelt een ontbrekende `created_at` als "gebruik het moment van binnenkomst". Zo'n
ticket landt dus stil op vandaag in plaats van op zijn echte dag, én triggert een hersamenvatting
van vandaag met een onderwerp dat er niet hoort. Een id dat niet in de lookup zit komt uit
dezelfde batch die net verstuurd is, dus een miss betekent vrijwel altijd dat het model het id
heeft aangepast. Overslaan en loggen is dan eerlijker.

**Koppel niet op positie.** Zipt de parse de modeloutput op index aan de batch, dan verschuift bij
een batch waar het model één regel minder teruggeeft alles één op — en krijgt een ticket het
onderwerp én de categorie van zijn buur. De lookup hierboven voorkomt dat.

`topic` mag ontbreken: dat ticket telt gewoon mee in de aantallen, alleen zonder inhoud. De ingest
accepteert naast `topic` ook `subject`, `onderwerp` en `samenvatting` als veldnaam.

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
  created_at: i.json.created_at,
  soort: i.json.soort,
  type: i.json.type,
  subtype: i.json.subtype,
  inferred: i.json.inferred,
  topic: i.json.topic,
})) } }];
```

## Gedrag om rekening mee te houden

- **Ontdubbeling op `id`.** Een handmatige re-run of een overlappende ophaalperiode telt niets
  dubbel. De uurlijkse schedule is dus niet kritisch: een gemiste run haal je met de volgende in.
- **Backfill kan, maar verrijkt niet.** Stuur oudere tickets met hun eigen `created_at` en ze
  landen op de juiste dag. Een ticket dat al is opgeslagen wordt echter overgeslagen als
  duplicaat, dus opnieuw sturen voegt géén indeling toe aan wat er al staat. Tickets van vóór
  deze wijziging blijven daarom onder "Niet ingevuld" vallen.
- **Lege batch is geldig** en levert `added: 0`. Een IF-node voor "geen tickets dit uur" is niet
  nodig.
- **Tickets zonder soort** vallen onder "Niet ingevuld" en worden teruggemeld in `withoutSoort`.
  Loopt dat aantal op, dan laat Freshdesk het veld vaak leeg én slaagt het model er niet in bij
  te springen — meestal omdat de woordenlijst nog te mager is.
- **Door AI ingedeeld** telt apart mee in `inferred`, en het dashboard laat het aantal zien op de
  treemapkaart. Zo lees je een modelgok niet als Freshdesk-waarheid.
- **Maximaal 5000 items** per request; daarboven volgt een `413`.
- **Tijdzone.** `created_at` gaat in UTC de deur uit; het dashboard rekent dag- en uurgrenzen om
  naar Europe/Amsterdam, dus een ticket van 23:10 UTC verschijnt op de volgende dag om 01:10.

## Configuratie

| Env var | Waar | Toelichting |
|---|---|---|
| `FANDESK_INGEST_SECRET` | Vercel (Production + Preview) én n8n | Zelfde waarde aan beide kanten. |
| `BLOB_READ_WRITE_TOKEN` | Vercel | Al aanwezig; tickets onder `fandesk/months/`, samenvattingen onder `fandesk/summaries/`. |
| `ANTHROPIC_API_KEY` | Vercel | Al aanwezig voor de andere AI-inzichten. Nodig voor de samenvattingen; ontbreekt hij, dan blijven de aantallen werken en blijft de inhoudelijke kaart leeg. |

Testen dat de token klopt, zonder data te sturen:

```bash
curl -s https://tools.psv.nl/api/fandesk/ingest -H "Authorization: Bearer <secret>"
# → {"ok":true,"months":["2026-07"],"totalItems":128,"lastTicketAt":"...","oldestTicketAt":"..."}
```
