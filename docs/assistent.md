# Assistent

De assistent (`/dashboard/assistent`) is één chat over de databronnen van PSV Tools heen. Het
model krijgt de vraag en een lijst tools, en haalt zelf op wat het nodig heeft. De assistent
leest alleen: er wordt niets aangemaakt of gewijzigd.

## Hoe het werkt

| Onderdeel | Bestand |
|---|---|
| De tools (per databron) | `lib/assistent/tools.ts` |
| Rechten en controle van de invoer | `lib/assistent/toegang.ts` |
| De chat-route (model, tool-rondes, stream) | `app/api/assistent/chat/route.ts` |
| Gesprekken per collega (Vercel Blob, map `assistent-gesprekken/`) | `lib/assistent/gesprekken.ts` |
| De pagina | `components/assistent-chat.tsx` |

1. De browser stuurt de vragen en antwoorden van het gesprek naar `/api/assistent/chat`.
2. De route bepaalt welke tools de collega krijgt en geeft die mee aan het model
   (`claude-opus-5-5`, lage effort).
3. Vraagt het model om een tool, dan voert de server hem uit en geeft de tekst terug. Dat herhaalt
   zich tot er een antwoord is, met een maximum van 8 rondes per vraag.
4. Het antwoord komt binnen terwijl het model schrijft. Onder het antwoord staan de pagina's
   waar de data vandaan komt.

De tools gebruiken dezelfde functies als de pagina's zelf, dus een antwoord gaat over dezelfde
cijfers als het dashboard. Data uit een eerdere vraag wordt niet bewaard: bij een vervolgvraag
haalt het model opnieuw op wat het nodig heeft.

## Rechten

Elke tool hoort bij een pagina. Wie een pagina niet mag zien (Gebruikersbeheer), krijgt de tools
van die pagina niet, ook niet als het model erom vraagt. De pagina Assistent zelf is een gewone
pagina in de groep Kennisbank en is dus per gebruiker aan of uit te zetten.

## Tools

| Tool | Pagina | Wat hij geeft |
|---|---|---|
| `ticketing_stadion_overzicht` | Ticketing Stadion | Komende thuiswedstrijden: bezetting, tempo, vergelijking |
| `ticketing_stadion_wedstrijd` | Ticketing Stadion | Eén wedstrijd: per vak, vrije groepjes, verkoop per dag |
| `ticketing_herdgang_wedstrijden` | Ticketing Herdgang | Komende wedstrijden op De Herdgang |
| `ticketing_herdgang_bezetting` | Ticketing Herdgang | Bezetting per vak van één wedstrijd |
| `kennisbank_onderwerpen` | Kennisbank | Inhoudsopgave van de kennisbank |
| `kennisbank_pagina` | Kennisbank | De volledige tekst van één pagina |
| `fandesk_tickets` | FANdesk | Aantallen, indeling, thema's en samenvattingen over een periode |

De ticketing-tools lezen wat de crons hebben klaargezet; er gaat geen verzoek naar Ringside.

## Een bron toevoegen

Zet in `lib/assistent/tools.ts` een tool bij en neem hem op in `ASSISTENT_TOOLS`:

- `page`: de pagina waar de data bij hoort. Dit bepaalt wie de tool krijgt.
- `description`: wat de tool geeft en wanneer het model hem moet gebruiken. Het model kiest op
  basis van deze tekst.
- `velden`: de invoer, met een `pattern` voor alles wat een id of datum is.
- `run`: geeft tekst terug, zo compact als de vraag toelaat. Hergebruik de functie die de pagina
  zelf gebruikt.

Nog niet aangesloten: DM Performance, Paid Ads, Web Verkeer, FANstore, Landingspagina's, UTM
Builder, Mail Builder, Rapportages, Database, Aangrenzende stoelen en Contact Filter Import.
Schrijfacties (iets aanmaken of wijzigen) zijn bewust uitgesteld.
