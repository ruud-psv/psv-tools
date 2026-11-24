# Beheer

`/dashboard/beheer` is alleen voor admins en heeft twee tabbladen:

- **Gebruikers**: per collega welke pagina's zichtbaar zijn.
- **MCP Servers** (`?tab=mcp`): welke MCP-servers de assistent mag gebruiken,
  en welke tools daarvan.

Het oude adres `/dashboard/gebruikersbeheer` stuurt door naar Beheer.

# Gebruikers

Nieuwe collega's worden nog steeds in de Azure portal aan de Enterprise
Application toegevoegd; hier stel je alleen in wat ze mogen zien.

## Niveaus

| Niveau | Wat je ziet |
|---|---|
| **Admin** | Alle pagina's, de beta tools en het beheer |
| **Alles + beta** | Alle pagina's en de beta tools |
| **Alles** | Alle pagina's, zonder de beta tools |
| **Specifieke pagina's** | Alleen de aangevinkte pagina's |

Het overzicht (`/dashboard`) is voor iedereen bereikbaar.

## Wie niet in de lijst staat

De app weet pas wie iemand is als die inlogt. Daarom vul je in het beheer een
e-mailadres in — dat kan ook voor iemand die nog nooit heeft ingelogd — en geldt
dat niveau vanaf de eerste login. Wie niet in de lijst staat krijgt
**Alles + beta** (`DEFAULT_LEVEL` in `lib/access.ts`). Iemand uit de lijst
verwijderen zet diegene dus terug op dat niveau.

## Eerste admin

Zet in Vercel de omgevingsvariabele `ADMIN_EMAILS` (komma-gescheiden). Die adressen
zijn altijd admin en kunnen in het beheer niet worden aangepast, zodat je jezelf
nooit kunt buitensluiten. Verdere admins kun je daarna in het beheer aanwijzen.

## Hoe het wordt afgedwongen

- **Sidebar en dashboard** tonen alleen de pagina's waar je recht op hebt.
- **De middleware** (Node.js-runtime) controleert elke pagina. Open je via een
  directe URL een pagina zonder recht, dan word je naar het dashboard gestuurd
  met een melding.
- **API-routes** die bij één tool horen geven een 403 als je die tool niet mag
  gebruiken. De koppeling staat in `API_PAGES` in `lib/access.ts`. Routes die ook
  door de openbare deellinks (`/share/...`) of de rapportage-generator worden
  gebruikt staan daar bewust niet in, anders breekt een deellink voor iemand met
  beperkte toegang.
- Komt er een nieuwe pagina bij in `lib/tools.ts`, dan verschijnt die vanzelf in
  het beheer. Voeg de bijbehorende API-route toe aan `API_PAGES`.

## Opslag

De lijst staat als één JSON-bestand in Vercel Blob:
`gebruikersbeheer/toegang.json`. Elke serverinstantie houdt hem 15 seconden in
het geheugen; een wijziging is dus binnen een halve minuut overal actief, ook
voor wie al is ingelogd. Is de opslag even onbereikbaar, dan wordt de laatst
bekende lijst gebruikt.

# MCP Servers

Een MCP-server geeft de assistent extra tools, rechtstreeks van een leverancier
(bijvoorbeeld Google Analytics of Meta Ads). Alleen de assistent gebruikt ze;
de dashboards en crons blijven op hun eigen API-koppelingen.

| Onderdeel | Bestand |
|---|---|
| Regels (wat mag aan, URL, toolnamen, invoer) | `lib/mcp/config.ts` (met tests) |
| Opslag (Vercel Blob, `beheer/mcp-servers.json`) | `lib/mcp/store.ts` |
| Verbinding met een server (Streamable HTTP) | `lib/mcp/client.ts` |
| De tools in de assistent | `lib/mcp/assistent.ts` |
| Beheer-API's (alleen admins) | `app/api/beheer/mcp/*` |
| Het tabblad | `components/mcp-beheer.tsx` |

## Een server toevoegen

1. Zet het token van de leverancier in Vercel als omgevingsvariabele die met
   `MCP_` begint, bijvoorbeeld `MCP_GA_TOKEN`, en deploy opnieuw.
2. Vul in Beheer > MCP Servers de naam, het id, de URL en de inlogmethode in:
   - **Bearer-token**: `Authorization: Bearer <token>`.
   - **Eigen header**: bijvoorbeeld `X-Api-Key: <token>`.
   - **Geen**: voor een openbare server.
3. Kies de **pagina** waar de server bij hoort. Wie die pagina mag zien, krijgt
   de tools in de assistent; net als bij de eigen tools van de assistent.
4. Klik **Verbinding testen**. PSV Tools maakt verbinding en haalt de tools op.
5. Zet de tools aan die de assistent mag gebruiken. Met **Proberen** roep je een
   tool aan met eigen invoer en zie je wat de assistent terugkrijgt.

Een wijziging is binnen een halve minuut actief in de assistent.

## Wat aan mag

Een MCP-server zegt per tool of hij alleen leest (`readOnlyHint`) of iets kan
wijzigen. De assistent leest alleen, dus:

| Soort | Betekenis | Aanzetten |
|---|---|---|
| **Leest** | De tool zegt dat hij alleen leest | Mag |
| **Onbekend** | De tool zegt niets | Alleen als een admin bevestigt dat hij alleen leest; de naam van de admin komt bij de tool |
| **Schrijft** | De tool kan iets aanmaken, wijzigen of verwijderen | Nooit, ook niet via de API |

## Als de leverancier iets verandert

Het model krijgt de beschrijving en het schema van een tool zoals een admin ze
bij **Verbinding testen** zag, niet wat de server op het moment van de vraag
zegt. Zo kan een server de assistent niet ongemerkt andere instructies geven.

Bij elke test worden de tools opnieuw naast de opgeslagen versie gelegd:

- **Nieuw**: staat uit tot een admin hem aanzet.
- **Gewijzigd** (beschrijving, schema of annotaties): gaat uit en verliest een
  eventuele bevestiging. Lees hem opnieuw en zet hem weer aan.
- **Verdwenen**: valt uit de lijst.

Een andere URL is een andere server: dan worden de tools gewist en test je
opnieuw.

## Beveiliging

- **Tokens staan nooit in de opslag of in de browser.** De server verwijst naar
  een omgevingsvariabele, en die moet met `MCP_` beginnen. Zo kan niemand via
  het beheer een ander geheim van PSV Tools (zoals `ANTHROPIC_API_KEY`) naar
  een server laten sturen. De pagina toont alleen of het token gezet is.
- **Uitzondering: gedeelde tokens** (`SHARED_TOKENS` in `lib/mcp/config.ts`).
  Een bestaand token mag ook, maar alleen naar de partij die het al krijgt:
  `META_ADS_ACCESS_TOKEN` (van Paid Ads) alleen naar servers op `facebook.com`
  of `meta.com`. Dat wordt gecontroleerd bij het opslaan én vlak voor elke
  verbinding.
- **Alleen https** en een gewone hostnaam: geen IP-adressen, `localhost` of
  interne adressen.
- **Alleen Streamable HTTP.** Servers die alleen lokaal draaien (stdio), zoals
  de officiële Google Analytics- en Google Ads-servers, moeten eerst ergens
  over HTTP worden gehost. Voor Google Analytics is dat niet nodig: PSV Tools
  heeft een eigen server (hieronder).
- De uitkomst van een tool is data. De assistent krijgt de instructie nooit
  instructies uit een uitkomst te volgen, en een uitkomst gaat met maximaal
  60.000 tekens naar het model.
- Inloggen met OAuth (een "Koppelen"-knop) is er nog niet; servers die alleen
  OAuth kennen kunnen nog niet worden toegevoegd.

## Meta Ads

Er zijn twee servers voor Meta Ads:

- **De server van Meta zelf** (`https://mcp.facebook.com/ads`). Die weigerde
  het token van Paid Ads met een 401; vermoedelijk wil hij inloggen via OAuth
  of een extra recht. `META_ADS_ACCESS_TOKEN` mag er wel naartoe (zie
  gedeelde tokens), voor als dat later wel werkt.
- **De ingebouwde server van PSV Tools** (`/api/mcp/meta-ads`), hieronder.
  Die gebruikt het token en account van Paid Ads, dus hij werkt zonder OAuth.

## Ingebouwde server: Meta Ads

Leest met `META_ADS_ACCESS_TOKEN` en alleen het account in
`META_ADS_ACCOUNT_ID`, net als het Paid Ads-dashboard. Hij doet alleen
GET-verzoeken naar de Graph API: aanmaken of wijzigen kan hij niet.

| Tool | Wat hij doet |
|---|---|
| `rapport` | Insights op account-, campagne-, advertentieset- of advertentieniveau: het model kiest zelf de velden, de periode, per dag/week/maand, de uitsplitsing (leeftijd, geslacht, plaatsing, land) en filters op naam of id. Acties (`actions`) per soort. Met dezelfde attributie als Ads Manager. |
| `campagnes` | De campagnes, advertentiesets of advertenties met status, doel, budget en looptijd; ook om een naam of id te vinden. |

| Onderdeel | Bestand |
|---|---|
| Het endpoint | `app/api/mcp/meta-ads/route.ts` |
| Token, sessies en foutantwoorden (gedeeld met Google Analytics) | `lib/mcp/servers/http.ts` (met tests) |
| De tools | `lib/mcp/servers/meta-ads.ts` (met tests) |
| Parameters voor Meta en tekst voor het model | `lib/meta-ads/rapport.ts` (met tests) |
| De Graph-client (alleen GET) | `lib/meta-ads/client.ts` (met tests) |

### Aanzetten

1. Maak een willekeurig token van minstens 32 tekens en zet het in Vercel als
   `MCP_META_TOKEN` (Production). Dat is het wachtwoord van dit endpoint, niet
   een token van Meta. Deploy opnieuw.
2. Verwijder in Beheer > MCP Servers een eerdere server met het id `metaads`
   (bijvoorbeeld die naar `mcp.facebook.com`).
3. Klik bij **Ingebouwd: Meta Ads** op **Invullen**, en dan op **Opslaan**.
4. Klik **Verbinding testen** en zet `rapport` en `campagnes` aan.
5. Vraag in de assistent bijvoorbeeld: "Welke 5 campagnes hadden de afgelopen
   7 dagen de meeste linkkliks, en wat was de CPC?" Alleen wie Paid Ads mag
   zien, krijgt deze tools.

Buiten PSV Tools werkt hij net als de Google Analytics-server, met
`MCP_META_TOKEN` als bearer-token.

## Playable

Playable heeft een eigen MCP-server, maar die werkt alleen met Gemini Enterprise
en Microsoft 365 Copilot: bij het aanmaken van een MCP-client in Playable
(Developer > Developer apps) kies je een van die twee. De assistent van PSV
Tools kan daar niet inloggen. Daarom host PSV Tools een eigen server.

## Ingebouwde server: Playable

Leest met de app-sleutels van Landingspagina's (`PLAYABLE_CLIENT_ID`,
`PLAYABLE_SECRET`). Het token vraagt alleen `campaigns.list` en
`campaigns.view`, dus ook als de app in Playable meer mag (zie
`docs/playable-api.md`), kan de server niets aanmaken, wijzigen of
verwijderen. Hij geeft geen registraties met persoonsgegevens, alleen aantallen.

| Tool | Wat hij doet |
|---|---|
| `campagnes` | Haalt alle campagnes op (Playable bepaalt hoeveel per pagina; de client leest het aantal pagina's uit het eerste antwoord en meldt het als de lijst onvolledig is) en zoekt op naam, DMID-nummer of het laatste stuk van de URL (spaties en hoofdletters tellen niet: "Coen Dillen" vindt ook `club.psv.nl/coendillen`). Met id, type, actief, looptijd en URL. |
| `statistieken` | De totalen van 1 tot 10 campagnes over de hele looptijd: sessies, aanmeldingen, unieke aanmeldingen, conversie, apparaten, gemiddelde tijd en shares. Dezelfde cijfers als Landingspagina's. |
| `aanmeldingen_per_dag` | Aanmeldingen per dag voor één campagne. Dit endpoint (`/v1/campaign/{id}/statistics/registrations`) wordt elders in PSV Tools nog niet gebruikt: test hem eerst met **Proberen**. |

| Onderdeel | Bestand |
|---|---|
| Het endpoint | `app/api/mcp/playable/route.ts` |
| De tools | `lib/mcp/servers/playable.ts` (met tests) |
| Zoeken en tekst voor het model | `lib/playable/rapport.ts` (met tests) |
| De API-client (token met leesrechten, alleen GET) | `lib/playable/client.ts` (met tests) |

### Aanzetten

1. Maak een willekeurig token van minstens 32 tekens en zet het in Vercel als
   `MCP_PLAYABLE_TOKEN` (Production). Deploy opnieuw.
2. Klik in Beheer > MCP Servers bij **Ingebouwd: Playable** op **Invullen**, en
   dan op **Opslaan**.
3. Klik **Verbinding testen** en zet `campagnes` en `statistieken` aan. Probeer
   `aanmeldingen_per_dag` eerst met **Proberen** (bijvoorbeeld
   `{"campagne_id": <id>}`) en zet hem alleen aan als er cijfers uitkomen.
4. Vraag in de assistent bijvoorbeeld: "Hoeveel aanmeldingen had de Coen
   Dillen-pagina?" Alleen wie Landingspagina's mag zien, krijgt deze tools.

## Ingebouwde server: Maileon

Maileon heeft geen eigen MCP-server. PSV Tools host er een op `/api/mcp/maileon`, met de sleutel van
DM Performance (`MAILEON_API_KEY`). Die sleutel kan in Maileon veel meer (contacten lezen, mailings
versturen); de server gebruikt alleen de lijst met mailings en de samenvatting van de resultaten per
mailing, met GET. Geen contacten, geen klikken per persoon: alleen totalen.

| Tool | Wat hij doet |
|---|---|
| `mailings` | De verstuurde mailings in een periode (status done of archived), nieuwste eerst, met verzendmoment, id, naam en type. Zoekt op een woord uit de naam of het DMID-nummer, zonder dat spaties en hoofdletters tellen. |
| `resultaten` | Per mailing en in totaal: ontvangers, uniek geopend, open %, uniek geklikt, klik %, CTOR, bounces en afmeldingen. Dezelfde cijfers als DM Performance. Hooguit 300 mailings per vraag. |

| Onderdeel | Bestand |
|---|---|
| Het endpoint | `app/api/mcp/maileon/route.ts` |
| De tools | `lib/mcp/servers/maileon.ts` (met tests) |
| XML lezen, zoeken en tekst voor het model | `lib/maileon/rapport.ts` (met tests) |
| De API-client (alleen GET, twee endpoints) | `lib/maileon/client.ts` (met tests) |

### Aanzetten

1. Maak een willekeurig token van minstens 32 tekens en zet het in Vercel als `MCP_MAILEON_TOKEN`
   (Production). Deploy opnieuw.
2. Klik in Beheer > MCP Servers bij **Ingebouwd: Maileon** op **Invullen**, en dan op **Opslaan**.
3. Klik **Verbinding testen** en zet `mailings` en `resultaten` aan.
4. Vraag in de assistent bijvoorbeeld: "Hoe deden de mailings van oktober het?" Alleen wie DM
   Performance mag zien, krijgt deze tools.

## Ingebouwde server: PSV Play

PSV Play (de video's in Mijn PSV+) draait op JW Player. PSV Tools host een server op
`/api/mcp/psv-play`, met `JWPLAYER_SECRET`. Zeven tools, allemaal alleen lezen en zonder vrije
query; zie `docs/psv-play.md`.

1. Zet `MCP_PSVPLAY_TOKEN` (minstens 32 tekens) in Vercel en deploy opnieuw.
2. Klik in Beheer > MCP Servers bij **Ingebouwd: PSV Play** op **Invullen**, en dan op **Opslaan**.
3. Klik **Verbinding testen** en zet de tools aan. Alleen wie PSV Play mag zien, krijgt ze.

## Ingebouwde server: Google Analytics

PSV Tools is zelf ook een MCP-server voor Google Analytics, op
`/api/mcp/google-analytics`. Hij gebruikt dezelfde koppeling als Web Verkeer
(het service-account in `GA_SERVICE_ACCOUNT_JSON` en de properties in
`GA_PROPERTY_*`) en kan alleen bij die vier sites: psv.nl, ticketshop.psv.nl,
psvfanstore.nl en acties.psv.nl.

| Tool | Wat hij doet |
|---|---|
| `rapport` | Een rapport over een periode: het model kiest zelf metrics, dimensies, filters, sortering en eventueel een vergelijkingsperiode. Met het totaal over alle rijen. |
| `realtime` | De afgelopen 30 minuten. |
| `velden` | De namen van metrics en dimensies zoeken, ook eigen velden (`customEvent:...`). |

Alle drie lezen alleen en zeggen dat ook, dus ze kunnen in Beheer meteen aan.

| Onderdeel | Bestand |
|---|---|
| Het endpoint | `app/api/mcp/google-analytics/route.ts` |
| Token, sessies en foutantwoorden | `lib/mcp/servers/http.ts` (met tests) |
| De tools | `lib/mcp/servers/google-analytics.ts` (met tests) |
| Verzoek aan GA en tekst voor het model | `lib/google-analytics/rapport.ts` (met tests) |
| Service-account en sites | `lib/google-analytics/client.ts` |

### Aanzetten

1. Maak een willekeurig token van minstens 32 tekens, bijvoorbeeld met de
   wachtwoordgenerator van NordPass (40 tekens of meer).
2. Zet het in Vercel als `MCP_GA_TOKEN` (Production) en deploy opnieuw. Zonder
   dit token staat de server uit.
3. Ga naar Beheer > MCP Servers en klik bij **Ingebouwd: Google Analytics** op
   **Invullen**, en dan op **Opslaan**. Het formulier gebruikt hetzelfde
   `MCP_GA_TOKEN` om in te loggen.
4. Klik **Verbinding testen** en zet `rapport`, `realtime` en `velden` aan.
5. Vraag in de assistent bijvoorbeeld: "Wat waren gisteren de best bekeken
   pagina's op psv.nl?" Alleen wie Web Verkeer mag zien, krijgt deze tools.

### Buiten PSV Tools

Elke MCP-client die Streamable HTTP met een bearer-token ondersteunt, kan de
server ook gebruiken, bijvoorbeeld Claude Code:

```
claude mcp add --transport http psv-google-analytics https://tools.psv.nl/api/mcp/google-analytics --header "Authorization: Bearer <MCP_GA_TOKEN>"
```

Er is één token voor iedereen: wie het heeft, kan de cijfers van de vier sites
lezen. Geef het alleen aan collega's die Web Verkeer mogen zien. Intrekken doe
je door het token in Vercel te vervangen; de assistent werkt daarna gewoon
verder, want die leest dezelfde omgevingsvariabele.

### Hoe het werkt

- Elke request staat op zichzelf (geen sessies), zodat het op een
  Vercel-functie werkt. Alleen POST; GET en DELETE geven 405.
- Het token wordt in constante tijd vergeleken. Een fout of ontbrekend token
  geeft 401; zonder `MCP_GA_TOKEN` (of korter dan 32 tekens) geeft de server 503.
- Een fout van Google Analytics, zoals een onbekende metric, gaat als leesbare
  melding terug, zodat het model de vraag kan aanpassen.
- Rapporten geven standaard 10 rijen en hooguit 250.

### Problemen

| Melding | Oplossing |
|---|---|
| `MCP_GA_TOKEN is niet gezet` | Zet de variabele in Vercel bij **Production** en deploy opnieuw. |
| `MCP_GA_TOKEN is korter dan 32 tekens` | Maak een langer token, vervang de waarde en deploy opnieuw. |
| `geeft geen toegang tot <site> (property ...)` | Het service-account mist rechten op die property. Voeg het e-mailadres uit de melding in Google Analytics toe met de rol **Lezer** (Beheer > Toegangsbeheer voor property), of corrigeer het property-id in de genoemde `GA_PROPERTY_*`. Web Verkeer gebruikt hetzelfde account: die site ontbreekt daar dan ook. |
| `zet de Google Analytics Data API aan` | Zet de Data API aan in het Google Cloud-project van het service-account. |
| `Input validation error` bij Proberen | De invoer klopt niet met het schema, bijvoorbeeld een lege lijst `metrics`. Voorbeelden staan in de beschrijving van de tool. |

## Crons

Tabblad op `/dashboard/beheer?tab=crons` (`components/cron-beheer.tsx`, API
`app/api/beheer/crons/route.ts`), alleen voor admins. Ververst zichzelf elke 15 seconden.

- **Ringside: verkoop per dag** (`/api/ringside/ingest`) en **Ringside: stoelstatus**
  (`/api/ringside/stoelen`): wat ze nu doen (doorloop, bijhouden of een extra ronde), of er een
  run bezig is, de laatste fout en de rondes. Met knoppen:
  - **Stoppen** zet een pauze in `beheer/cron-pauze.json` (`lib/beheer/cron-control.ts`). Een
    gepauzeerde cron start geen run (ook niet van de schedule in `vercel.json`) en zet zijn
    ketting niet voort; een run die bezig is maakt zijn werk af en slaat op. De pauze staat
    bewust niet in de toestand van de cron: een lopende run schrijft die aan het eind terug en
    zou een pauze dan overschrijven. Ook de inhaalslag van "Maak lijst" respecteert de pauze.
  - **Hervatten** / **Nu draaien** haalt de pauze weg en start een run met een ketting van 400;
    die gaat verder waar hij was.
  - **Opnieuw beginnen** (alleen de verkoop) start een nieuwe doorloop (`?restart=1`). Kan
    alleen als er geen run bezig is: stop hem eerst.
- **Overige crons** (wachtlijst, PSV Play, Asana-automaat): alleen het schema.

Status zonder te starten kan ook via de routes zelf: `/api/ringside/ingest?status=1` en
`/api/ringside/stoelen?status=1`.
