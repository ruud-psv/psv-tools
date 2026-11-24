# Groepsfoto-campagne — bouwplan publieke versie

> Status: **plan**. Bouwt voort op de interne Groepsfoto Creator
> (`docs/groepsfoto-plan.md`). Doel: fans maken op een Playable-campagnepagina
> (club.psv.nl), achter de Mijn PSV-login, een kerstkaart met hun selfie tussen
> de spelers.

## 1. Uitgangspunten

1. **De browser praat nooit met `tools.psv.nl`.** Alles wat de browser aanroept,
   staat in het tabblad Network van DevTools; dat valt niet te verbergen. Een
   eigen domein is geen optie, dus de publieke kant draait op het bestaande
   Bunny-adres `psveindhoven.b-cdn.net`, dat de Playable loader al gebruikt.
   PSV Tools is alleen het beheer en publiceert naar Bunny.
2. **Geen pull zone die doorstuurt naar `tools.psv.nl`.** Dat lekt: de
   middleware stuurt zonder sessie door naar `https://tools.psv.nl/login`, en
   headers en foutpagina's van Vercel en Next.js verraden wat erachter zit. De
   publieke kant is een eigen script op Bunny.
3. **Geen sleutels in de browser, en geen sporen naar Replicate.** Geen
   `replicate.delivery`-URL's, geen prediction-id, geen modelnaam en geen
   prompt in de antwoorden.
4. **Het endpoint kan maar één ding.** Model, prompt en basisfoto liggen per
   campagne vast. De bezoeker stuurt alleen een selfie en een keuze uit een
   vaste lijst; er is geen vrij tekstveld. Het endpoint is dus niet te
   gebruiken voor andere AI-generaties.
5. **De kosten hebben een harde bovengrens** (§6). Wel kan iemand het endpoint
   met een script blijven aanroepen om ons in de kosten te jagen.
6. **We bewaren niets.** De selfie niet, en het resultaat ook niet: de bezoeker
   ziet de kaart en downloadt hem direct. Een link in de bevestigingsmail kan
   daardoor niet (zie §8 voor als dat toch nodig is).

## 2. Architectuur

```
club.psv.nl (Playable)                 psveindhoven.b-cdn.net (Bunny)            Replicate
 html-element: <div> + script
  ├─ laadt /playable/pages/<id>/page.js  (widget, via de Playable loader)
  ├─ Mijn PSV-login (Playable)
  ├─ selfie: camera of foto kiezen,
  │  verkleinen (canvas, JPEG ≤1024px, zonder EXIF)
  ├─ Turnstile-token
  ├─ POST /groepsfoto/maak ──────────▶ Edge Script
  │   {campagne, selfie, keuzes,       ├─ Origin, Turnstile, (Mijn PSV-token)
  │    turnstile, [mijnpsv-token]}     ├─ limieten + aan/uit (§6)
  │                                    ├─ config + basisfoto uit Storage (privé)
  │                                    ├─ POST /predictions ─────────────────────▶
  │◀─ {ticket} ────────────────────────┤   ticket = versleuteld prediction-id
  ├─ GET /groepsfoto/status/<ticket> ─▶├─ GET /predictions/:id ──────────────────▶
  │◀─ {status} ────────────────────────┤
  ├─ GET /groepsfoto/beeld/<ticket> ──▶├─ beeld ophalen bij replicate.delivery
  │◀─ JPEG (met AI-label + metadata) ──┤   en doorgeven; nergens opgeslagen
  ├─ kaartrand + tekst (canvas), download
  └─ Playable-formulier (lead, opt-in)
```

### Onderdelen

| Onderdeel | Waar | Wat |
|---|---|---|
| Campagnebeheer | PSV Tools, `/dashboard/groepsfoto` (nieuw tabblad "Campagnes") | basisfoto en model kiezen, limieten, aan/uit, publiceren naar Bunny |
| Publicatie | PSV Tools, `app/api/groepsfoto/campagnes/…` | zet `config.json` en de basisfoto in Bunny Storage, in een map die **niet** via de pull zone te bereiken is (zelfde aanpak als `page.js` bij de Playable loader) |
| Edge script | Bunny Edge Scripting, code in deze repo onder `packages/groepsfoto-edge/` | `/maak`, `/status/:ticket`, `/beeld/:ticket` |
| Widget | Playable loader (`docs/playable-loader.md`), Kit-huisstijl | selfie, keuzes, genereren, resultaat, download |

**Geen aanroepen van server naar PSV Tools tijdens de campagne.** Het script
leest alles uit Bunny Storage. Zo kan een foutmelding van PSV Tools nooit in de
browser terechtkomen, en hangt de actie niet af van de bereikbaarheid van
PSV Tools.

### config.json

PSV Tools rekent de prompts vooraf uit met de bestaande `bouwPrompt()`, één per
toegestane keuze. Het script bevat zo geen promptlogica.

```json
{
  "campagne": "kerst-2026",
  "actief": true,
  "model": "google/nano-banana",
  "verhouding": "match_input_image",
  "prompts": { "automatisch|passend": "Make one small, local edit …", "…": "…" },
  "limieten": { "perIpPerUur": 5, "perAccount": 3, "perDag": 1500 },
  "origins": ["https://club.psv.nl", "https://appv2.leadfamly.com"],
  "label": "Gemaakt met AI"
}
```

## 3. De selfie (in de widget)

Alles gebeurt in de browser, in de widget op de Playable-pagina.

1. **Camera of foto kiezen** met
   `<input type="file" accept="image/*" capture="user">`. Op een telefoon opent
   direct de voorcamera, op een computer de bestandskiezer. Het werkt ook in
   in-app browsers (Instagram, Facebook) en heeft geen camera-toestemming van
   de pagina nodig. Zelfde aanpak als in `components/groepsfoto-creator.tsx`.
2. **Voorbeeld tonen** met "Opnieuw" en "Gebruik deze foto".
3. **Voorbewerken op een canvas:** rechtzetten volgens de EXIF-oriëntatie,
   verkleinen tot max. 1024 px, opnieuw coderen als JPEG. Dat haalt alle
   metadata (GPS) eraf. Een kopie in gewone JavaScript van `verkleinNaarJpeg()`
   uit `components/groepsfoto-creator.tsx`.
4. **Tips:** alleen jij in beeld, gezicht recht naar de camera, goed licht,
   geen zonnebril.
5. **Toestemmingsvinkje:** "Dit is een foto van mezelf, of van iemand die
   daar toestemming voor gaf." Plus een korte privacytekst met link.
6. **Turnstile** (onzichtbaar waar het kan), daarna de `POST`.

Een live camerabeeld met kader (`getUserMedia`) is bewust niet de eerste
keuze: het werkt niet in elke in-app browser en vraagt `allow="camera"` als
Playable de pagina in een iframe zet. Kan later als verbetering, na een test op
de demo-URL.

## 4. Het edge script

- **`POST /groepsfoto/maak`**
  1. Origin moet in `origins` staan (filtert ruis, geen echte beveiliging).
  2. Turnstile-token verifiëren bij Cloudflare.
  3. Mijn PSV-token verifiëren als dat er is (§7).
  4. Selfie: `data:image/(jpeg|png|webp)`, max. 3 MB, net als nu in
     `app/api/groepsfoto/route.ts`. Keuzes moeten in `prompts` voorkomen.
  5. Campagne uit of limiet bereikt → nette melding, geen generatie.
  6. Voorspelling starten met `[basisfoto, selfie]` in die vaste volgorde.
  7. Een **ticket** teruggeven: het prediction-id met een vervaltijd,
     versleuteld met een geheime sleutel (AES-GCM). Zo is er geen opslag nodig
     voor tickets, en ziet de browser het prediction-id niet.
- **`GET /groepsfoto/status/:ticket`**: ticket ontsleutelen, status opvragen bij
  Replicate, teruggeven als `bezig`, `klaar` of `mislukt` (met een
  begrijpelijke melding, ook bij een weigering door het model). Niets meer.
- **`GET /groepsfoto/beeld/:ticket`**: het beeld ophalen bij Replicate, het
  AI-label en de metadata erop zetten (§9) en doorgeven met
  `Cache-Control: no-store`. Werkt zolang Replicate het beeld bewaart
  (ongeveer een uur); daarna een nette melding.
- **Foutmeldingen** zijn altijd eigen teksten; nooit een doorgestuurde melding
  van Replicate.
- **Secrets** (in Bunny, niet in de repo): `REPLICATE_API_TOKEN` (eigen
  campagnesleutel), `TICKET_SLEUTEL`, `BUNNY_STORAGE_API_KEY`,
  `TURNSTILE_SECRET`, en eventueel de issuer/JWKS-URL van Mijn PSV.

## 5. Playable-formulier

Het formulier van Playable blijft voor de lead en de opt-in. Of het vóór of na
het genereren komt, is een keuze voor marketing: eerst het formulier remt
misbruik iets af, eerst de foto converteert waarschijnlijk beter. Omdat het
resultaat niet bewaard wordt, gaat er geen foto-link mee in de mail.

## 6. Kosten en misbruik: de limieten

Elke generatie kost ± $0,04 (Nano Banana). Van buiten naar binnen:

| Laag | Waar | Wat het tegenhoudt |
|---|---|---|
| Bestedingslimiet op een **eigen Replicate-sleutel** voor campagnes | Replicate | harde bovengrens; het slechtste geval is "de actie ligt stil", niet een hoge rekening. Intrekken raakt de interne tools niet. |
| **Dagplafond** per campagne | edge script | één persoon verbruikt hooguit één dag aan budget |
| **Rate limit per IP** | edge script (of Bunny Shield) | scripts vanaf één adres |
| **Turnstile** | widget + edge script | het meeste geautomatiseerde klooien |
| **Limiet per Mijn PSV-account** | edge script, alleen met tokencontrole (§7) | wie wil klooien moet steeds nieuwe accounts maken |
| **Noodknop en tellers** | PSV Tools | met één klik uit (publiceert `actief: false`); verbruik zichtbaar |

**Tellers** zijn de enige opslag die nodig is. Bunny Storage telt niet
betrouwbaar bij gelijktijdige aanvragen; voor een dagplafond is dat acceptabel,
voor een strikte limiet per account liever een opslag met atomaire ophoging.
Na te gaan wat Bunny daarvoor nu biedt.

## 7. Mijn PSV-login

De login in Playable bepaalt wie de pagina ziet, niet wie het endpoint kan
aanroepen. Om de login ook voor het endpoint te laten tellen:

1. **Token van Mijn PSV** (voorkeur): kan de pagina in Playable bij het token
   (OIDC/JWT) van de ingelogde gebruiker, dan stuurt de widget het mee en
   controleert het script de handtekening met de publieke sleutels van
   Mijn PSV. Het gehashte SSO-ID is de sleutel voor de limiet per account.
2. **Registratie via de Playable API**: formulier vóór het genereren; het
   script vraagt Playable of het registratie-ID bij deze campagne hoort.
   Vereist een aparte Playable-app met alleen leesrecht op registraties.
3. Een SSO-ID zonder handtekening is na te maken en telt niet als controle.

Tot duidelijk is wat kan, bouwen we zonder tokencontrole; die is een losse stap.

## 8. Als er toch een link in de mail moet

Dan moet het resultaat blijven staan, want de link van Replicate verloopt na
ongeveer een uur. Het script slaat het beeld dan op in Bunny Storage onder een
onraadbare naam in een publieke map (`r/<willekeurig>.jpg`), en een dagelijkse
cron in PSV Tools ruimt het na 7 dagen op. De foto-URL gaat via een verborgen
veld mee in het Playable-formulier. Na te gaan bij Playable: kan een verborgen
veld met JavaScript worden gevuld en in de mail worden gebruikt?

## 9. AI Act en AVG

**AI Act, art. 50** (geldt sinds 2 augustus 2026):

- Een fotorealistische fan tussen echte spelers is een **deepfake** in de zin
  van art. 3 lid 60.
- **Lid 2 (aanbieder):** PSV biedt het systeem onder eigen naam aan en is
  daarmee waarschijnlijk aanbieder. Elk resultaat krijgt een **machineleesbare
  markering**: IPTC-metadata `digitalSourceType: trainedAlgorithmicMedia`
  (eventueel C2PA). Na te gaan of Nano Banana via Replicate ook SynthID meegeeft.
- **Lid 4 (gebruiksverantwoordelijke):** geldt niet voor fans die het voor
  zichzelf gebruiken, wel voor PSV zodra de club zelf resultaten publiceert.
- **Zichtbaar label "Gemaakt met AI"** op het beeld zelf, aangebracht in
  `/beeld`, zodat het ook na het wegknippen van de kaartrand blijft staan. Na
  te gaan: hoe zwaar beeldbewerking in Bunny Edge Scripting is.
- Boete bij overtreding: tot € 15 mln of 3% van de wereldwijde jaaromzet.
- Na te gaan door legal: de stand van de gedragscode voor AI-content en
  eventueel uitstel via de Digital Omnibus.

**AVG:** de selfie is een persoonsgegeven en gaat via Replicate naar de VS.
Nodig vóór livegang: privacytekst bij de upload, check met de FG, eventueel een
DPIA. Replicate bewaart API-invoer en -uitvoer zelf ongeveer een uur; wijzelf
bewaren niets.

**Beeldrechten spelers:** nagaan of het contract ook bewerking met AI en delen
door fans dekt (zie §10 van `docs/groepsfoto-plan.md`).

## 10. Bouwvolgorde

| Stap | Wat | Oplevering |
|---|---|---|
| 0 | Open vragen uitzetten: Mijn PSV-token in Playable, legal/FG, en of er een link in de mail moet | antwoorden die §7 en §8 vastleggen |
| 1 | Bunny inrichten: privé map voor campagnes, Edge Script aan de pull zone, eigen Replicate-sleutel met bestedingslimiet, Turnstile-site | infrastructuur; getest dat de privé map niet publiek is |
| 2 | PSV Tools: tabblad Campagnes, `config.json` + basisfoto publiceren naar Bunny, aan/uit | campagne te publiceren vanuit beheer |
| 3 | `packages/groepsfoto-edge`: `/maak`, `/status`, `/beeld`, met validatie, tickets, Turnstile en limieten (zonder accountlimiet) | end-to-end werkend vanaf een testpagina |
| 4 | AI-label en metadata in `/beeld` | elk resultaat gemarkeerd, zichtbaar en machineleesbaar |
| 5 | Widget via de Playable loader: selfie (§3), keuzes, voortgang, kaartrand, download | werkend op de demo-URL van de campagne |
| 6 | Tellers zichtbaar in PSV Tools | verbruik per dag |
| 7 | Tokencontrole Mijn PSV en limiet per account (als stap 0 dat toelaat) | misbruik per account begrensd |
| 8 | Test: script tegen `/maak`, privé map opvragen, DevTools nalopen op sporen naar Replicate en `tools.psv.nl`, telefoons (iOS/Android, in-app browsers), privacytekst | akkoord voor livegang |
