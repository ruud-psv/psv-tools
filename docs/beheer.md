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
- **Alleen https** en een gewone hostnaam: geen IP-adressen, `localhost` of
  interne adressen.
- **Alleen Streamable HTTP.** Servers die alleen lokaal draaien (stdio), zoals
  de officiële Google Analytics- en Google Ads-servers, moeten eerst ergens
  over HTTP worden gehost, bijvoorbeeld op Cloud Run.
- De uitkomst van een tool is data. De assistent krijgt de instructie nooit
  instructies uit een uitkomst te volgen, en een uitkomst gaat met maximaal
  60.000 tekens naar het model.
- Inloggen met OAuth (een "Koppelen"-knop) is er nog niet; servers die alleen
  OAuth kennen kunnen nog niet worden toegevoegd.
