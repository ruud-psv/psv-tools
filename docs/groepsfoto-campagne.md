# Groepsfoto-campagne — bouwplan publieke versie

> Status: **plan**. Bouwt voort op de interne Groepsfoto Creator
> (`docs/groepsfoto-plan.md`). Doel: fans maken op een Playable-campagnepagina
> (club.psv.nl), achter de Mijn PSV-login, een kerstkaart met hun selfie tussen
> de spelers.

## 1. Uitgangspunten

1. **Niemand komt uit op `tools.psv.nl`.** De publieke kant draait op Bunny,
   onder een eigen adres (bijvoorbeeld `foto.psv.nl`, of het bestaande
   `psveindhoven.b-cdn.net`). PSV Tools is alleen het beheer: daar stel je de
   campagne in en publiceer je hem.
2. **Geen sleutels in de browser, en geen sporen naar Replicate.** Geen
   `replicate.delivery`-URL's, geen modelnaam en geen prompt in de antwoorden.
3. **Het endpoint kan maar één ding.** Model, prompt en basisfoto liggen per
   campagne vast op de server. De bezoeker stuurt alleen een selfie en een
   keuze uit een vaste lijst. Er is geen vrij tekstveld. Het endpoint is dus
   niet te gebruiken als gratis beeldgenerator.
4. **De kosten hebben een harde bovengrens.** Iemand die het endpoint vindt,
   kan het met een script blijven aanroepen. Daarom stapelen we limieten (§5),
   met als laatste vangnet de bestedingslimiet in Replicate.
5. **De selfie wordt niet opgeslagen**, net als in de interne tool. Het
   resultaat wel, kort, op een onraadbare naam.

## 2. Architectuur

```
club.psv.nl (Playable)                Bunny (foto.psv.nl)                       Replicate
 html-element via Playable loader
  ├─ Mijn PSV-login (Playable)
  ├─ selfie verkleinen (canvas, JPEG ≤1024px, zonder EXIF)
  ├─ Turnstile-token ophalen
  ├─ POST /maak ─────────────────────▶ Edge Script
  │   {campagne, selfie, keuzes,       ├─ Origin, Turnstile, (Mijn PSV-token)
  │    turnstile, [mijnpsv-token]}     ├─ limieten: IP, account, dag, aan/uit
  │                                    ├─ leest config.json + basisfoto (Storage, privé)
  │                                    ├─ POST /predictions + webhook ─────────▶
  │◀─ {ticket} ────────────────────────┤
  │                                    │◀── POST /webhook (handtekening check) ─┤
  │                                    ├─ beeld ophalen, label + metadata erop
  │                                    ├─ opslaan: Storage /r/<willekeurig>.jpg
  ├─ GET /status/<ticket> ────────────▶│
  │◀─ {status, url} ───────────────────┤   url = https://foto.psv.nl/r/<…>.jpg
  ├─ tonen, kaartrand (canvas), download
  └─ Playable-formulier: verborgen veld met de foto-URL → bevestigingsmail
```

### Onderdelen

| Onderdeel | Waar | Wat |
|---|---|---|
| Campagnebeheer | PSV Tools, `/dashboard/groepsfoto` (nieuw tabblad "Campagnes") | campagne aanmaken, basisfoto en model kiezen, limieten, aan/uit, tellers bekijken, publiceren naar Bunny |
| Publicatie | PSV Tools, `app/api/groepsfoto/campagnes/…` | zet `config.json` en de basisfoto in Bunny Storage (privé map) |
| Edge script | Bunny Edge Scripting, code in deze repo onder `packages/groepsfoto-edge/` | `POST /maak`, `GET /status/:ticket`, `POST /webhook` |
| Resultaten | Bunny Storage + pull zone, map `r/` | alleen deze map is publiek; onraadbare namen; na 7 dagen weg |
| Widget | Playable loader (`docs/playable-loader.md`) | HTML/CSS/JS in de Kit-huisstijl, in het `html-element` van de campagne |

### Indeling van Bunny Storage

```
groepsfoto/
  campagnes/<campagne>/config.json     privé   (alleen edge script)
  campagnes/<campagne>/basisfoto.jpg   privé   (alleen edge script)
  tickets/<ticket>.json                privé   (status, prediction-id, aanmaaktijd)
  tellers/…                            privé   (zie §5, of in een database)
r/<willekeurig-32-tekens>.jpg          publiek (via de pull zone)
```

De pull zone wijst alleen naar `r/`, of de rest wordt geblokkeerd met een
edge rule. Dat testen we expliciet: `foto.psv.nl/groepsfoto/campagnes/…` moet
een 403 of 404 geven.

### config.json

PSV Tools rekent de prompts vooraf uit met de bestaande `bouwPrompt()`, één per
toegestane keuze. Het edge script bevat zo geen promptlogica, en de prompt
blijft op één plek beheerd.

```json
{
  "campagne": "kerst-2026",
  "actief": true,
  "model": "google/nano-banana",
  "verhouding": "match_input_image",
  "prompts": { "automatisch|passend": "Make one small, local edit …", "…": "…" },
  "limieten": { "perIpPerUur": 5, "perAccount": 3, "perDag": 1500 },
  "origins": ["https://club.psv.nl", "https://appv2.leadfamly.com"],
  "bewaardagen": 7,
  "label": "Gemaakt met AI"
}
```

## 3. Het edge script

- **`POST /maak`**
  1. Origin moet in `origins` staan (filtert ruis, geen echte beveiliging).
  2. Turnstile-token verifiëren bij Cloudflare.
  3. Mijn PSV-token verifiëren als dat er is (§6).
  4. Selfie: `data:image/(jpeg|png|webp)`, max. 3 MB, net als nu in
     `app/api/groepsfoto/route.ts`. Keuzes moeten in `prompts` voorkomen.
  5. Limieten controleren en ophogen (§5). Campagne uit → nette melding.
  6. Voorspelling starten bij Replicate met `[basisfoto, selfie]` in die vaste
     volgorde, en een `webhook` naar `/webhook` met
     `webhook_events_filter: ["completed"]`.
  7. Ticket aanmaken (willekeurig, los van het prediction-id) en teruggeven.
- **`POST /webhook`**: handtekening van Replicate controleren (signing secret
  via de API). Bij succes: beeld ophalen, label en metadata erop (§7),
  opslaan onder `r/`, ticket bijwerken. Bij een weigering of fout: ticket op
  `mislukt` met een begrijpelijke melding.
- **`GET /status/:ticket`**: `bezig`, `klaar` (met `url`) of `mislukt` (met
  melding). Nooit het prediction-id, de modelnaam of de prompt.
- **Opruimen**: verlopen resultaten en tickets verwijderen. Bunny Edge
  Scripting kent geen cron; dat doet een dagelijkse cron in PSV Tools
  (`vercel.json`), die via de storage-API de map `r/` opschoont.
- **Secrets** (in Bunny, niet in de repo): `REPLICATE_API_TOKEN` (eigen
  campagnesleutel), `REPLICATE_WEBHOOK_SECRET`, `BUNNY_STORAGE_API_KEY`,
  `TURNSTILE_SECRET`, en eventueel de issuer/JWKS-URL van Mijn PSV.

## 4. De widget in Playable

- Gebouwd met de Kit van de Playable loader (huisstijl, PSV Condensed in koppen
  en knoppen), gepubliceerd via `/dashboard/playable-loader`.
- Stappen: uitleg en tips → selfie (op mobiel `capture="user"`) →
  toestemmingsvinkje → genereren met voortgang → resultaat met kaartrand en
  download → Playable-formulier.
- De kaartrand en tekst blijven op canvas in de browser (foutloze letters,
  geen nieuwe generatie bij een andere tekst). Het AI-label zit dan al op de
  foto zelf (§7), dus dat valt niet weg te knippen met de rand.
- **Formulier:** de foto-URL gaat in een verborgen veld van het
  Playable-formulier, zodat de bevestigingsmail de link kan sturen en de lead
  bij de foto hoort. **Na te gaan bij Playable:** kan een verborgen veld met
  JavaScript worden gevuld, en kan dat veld in de mail worden gebruikt?

## 5. Kosten en misbruik: de limieten

Elke generatie kost ± $0,04 (Nano Banana). Het endpoint is alleen bruikbaar
voor deze kaart, maar iemand kan het wel blijven aanroepen om ons in de kosten
te jagen of het budget op te maken. Daarom, van buiten naar binnen:

| Laag | Waar | Wat het tegenhoudt |
|---|---|---|
| Bestedingslimiet op een **eigen Replicate-sleutel** voor campagnes | Replicate | harde bovengrens; het slechtste geval is "de actie ligt stil", niet een hoge rekening. Intrekken raakt de interne tools niet. |
| **Dagplafond** per campagne | edge script | één persoon verbruikt hooguit één dag aan budget |
| **Rate limit per IP** | edge script (of Bunny Shield) | scripts vanaf één adres |
| **Turnstile** | widget + edge script | het meeste geautomatiseerde klooien |
| **Limiet per Mijn PSV-account** | edge script, alleen met tokencontrole (§6) | wie wil klooien moet steeds nieuwe accounts maken |
| **Noodknop en tellers** | PSV Tools | met één klik uit; zichtbaar als er iets vreemds gebeurt |

**Tellers:** waar die staan, is nog te kiezen. Bunny Storage is niet atomair
(twee gelijktijdige aanvragen kunnen dezelfde stand lezen); voor een dagplafond
is dat acceptabel, voor een strikte limiet per account liever een database met
atomaire ophoging. Na te gaan wat Bunny daarvoor nu biedt; anders een kleine
externe KV-opslag.

## 6. Mijn PSV-login

De login in Playable bepaalt wie de pagina ziet, niet wie het endpoint kan
aanroepen. Om de login ook voor het endpoint te laten tellen:

1. **Token van Mijn PSV** (voorkeur): kan de pagina in Playable bij het token
   (OIDC/JWT) van de ingelogde gebruiker, dan stuurt de widget het mee en
   controleert het edge script de handtekening met de publieke sleutels van
   Mijn PSV. Het SSO-ID (gehasht) is dan de sleutel voor de limiet per
   account, en bij misbruik weten we welk account het was.
2. **Registratie via de Playable API**: het formulier komt vóór het genereren
   en het edge script vraagt aan Playable of het registratie-ID bij deze
   campagne hoort. Vereist een aparte Playable-app met alleen leesrecht op
   registraties.
3. Een SSO-ID zonder handtekening is na te maken en telt niet als controle.

**Open vraag voor Playable / Mijn PSV:** kan het `html-element` bij het token
of SSO-ID van de ingelogde gebruiker? Tot dat duidelijk is, bouwen we zonder
tokencontrole (§5 zonder de accountlimiet); de controle is een losse stap.

## 7. AI Act en AVG

**AI Act, art. 50** (geldt sinds 2 augustus 2026):

- Een fotorealistische fan tussen echte spelers is een **deepfake** in de zin
  van art. 3 lid 60.
- **Lid 2 (aanbieder):** PSV biedt het systeem onder eigen naam aan en is
  daarmee waarschijnlijk aanbieder. Elk resultaat krijgt een **machineleesbare
  markering**. Nano Banana zet zelf waarschijnlijk al SynthID; na te gaan of dat
  via Replicate ook zo is. Daarnaast zet het edge script IPTC-metadata
  `digitalSourceType: trainedAlgorithmicMedia` in het bestand (eventueel C2PA).
- **Lid 4 (gebruiksverantwoordelijke):** geldt niet voor fans die het voor
  zichzelf gebruiken, wel voor PSV zodra de club zelf resultaten publiceert.
- **Zichtbaar label "Gemaakt met AI"** op het beeld zelf, op de server
  aangebracht, zodat het ook na het wegknippen van de kaartrand blijft staan.
  Te kiezen: de watermerkfunctie van Bunny Optimizer (na te gaan of die
  hiervoor bruikbaar is) of samenstellen in het edge script.
- Boete bij overtreding: tot € 15 mln of 3% van de wereldwijde jaaromzet.
- Na te gaan door legal: de stand van de gedragscode voor AI-content en
  eventueel uitstel via de Digital Omnibus.

**AVG:** de selfie is een persoonsgegeven en gaat via Replicate naar de VS.
Nodig vóór livegang: privacytekst bij de upload, check met de FG, eventueel een
DPIA, en de bewaartermijn van resultaten (voorstel: 7 dagen). Replicate bewaart
API-invoer en -uitvoer zelf ongeveer een uur.

**Beeldrechten spelers:** nagaan of het contract ook bewerking met AI en delen
door fans dekt (zie §10 van `docs/groepsfoto-plan.md`).

**Andermans gezicht:** het toestemmingsvinkje, het veiligheidsfilter van het
model en de vaste prompt vangen veel op. Met de tokencontrole (§6) is misbruik
ook te herleiden tot een account.

## 8. Bouwvolgorde

| Stap | Wat | Oplevering |
|---|---|---|
| 0 | Open vragen uitzetten: Mijn PSV-token in Playable, verborgen veld in het formulier, legal/FG | antwoorden die §4 en §6 vastleggen |
| 1 | Bunny inrichten: storage-mappen, pull zone alleen op `r/`, eigen hostname, eigen Replicate-sleutel met bestedingslimiet, Turnstile-site | infrastructuur, getest dat privé-mappen niet publiek zijn |
| 2 | PSV Tools: tabblad Campagnes, `config.json` + basisfoto publiceren naar Bunny, aan/uit | campagne te publiceren vanuit beheer |
| 3 | `packages/groepsfoto-edge`: `/maak`, `/webhook`, `/status` met validatie, Turnstile en limieten (zonder accountlimiet) | end-to-end werkend vanaf een testpagina |
| 4 | AI-label en metadata op de server | elk resultaat gemarkeerd, zichtbaar en machineleesbaar |
| 5 | Widget voor Playable via de Playable loader, met formulierkoppeling | werkend op de demo-URL van de campagne |
| 6 | Opruim-cron en tellers in PSV Tools | resultaten na 7 dagen weg, verbruik zichtbaar |
| 7 | Tokencontrole Mijn PSV en limiet per account (als stap 0 dat toelaat) | misbruik per account begrensd |
| 8 | Test: misbruik (script tegen `/maak`, privé-paden opvragen, DevTools nalopen op sporen naar Replicate en `tools.psv.nl`), belasting, privacytekst | akkoord voor livegang |
