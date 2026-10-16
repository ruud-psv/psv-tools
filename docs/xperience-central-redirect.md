# Redirects voor psv.nl (Xperience Central)

Brondocument voor de stappenplannen **Redirect aanmaken voor psv.nl**,
**Redirect wijzigen** en **Redirect verwijderen** op de kennisbankpagina
**Xperience Central** (`lib/kennisbank.ts`, slug `xperience-central`, secties
`#aan-de-slag`, `#redirect-wijzigen` en `#redirect-verwijderen`). De
kennisbank-chat beantwoordt vragen alleen met wat in de kennisbank staat. Wat
hier als **open** staat, kan de chat dus niet beantwoorden. De chat zegt dan dat
het ontbreekt en verzint niets.

De chat stelt "Hoe maak ik een redirect aan?" al voor als voorbeeldvraag
(`app/dashboard/kennisbank/KennisbankChat.tsx`). Met deze pagina kan de chat die
vraag beantwoorden.

Pas de pagina aan in `lib/kennisbank.ts`. Werk daarna dit document bij en stel
de testvragen opnieuw in de kennisbank-chat.

## Waarom op de pagina Xperience Central

- **Xperience Central (XC) is het CMS van psv.nl.** De redirects staan daar, onder
  Configuratie > Serverconfiguratie.
- **De pagina was "binnenkort".** Met deze stappenplannen heeft de pagina inhoud.
- **Drie stappenplannen, elk met een eigen kop.** Aanmaken staat in `steps` met
  `stepsCaption`; wijzigen en verwijderen staan in `stepGroups`. Elk stappenplan
  heeft een eigen anker, dus de inhoudsopgave en de bronlinks van de chat gaan
  direct naar het juiste stappenplan. Iemand die alleen iets wil wijzigen, hoeft
  de elf stappen van aanmaken niet door.
- **Wijzigen en verwijderen beginnen met inloggen en Redirects zoeken.** Die stap
  staat in elk stappenplan opnieuw, omdat de chat een stappenplan soms los van de
  rest leest.
- **Toegang** staat bovenaan de pagina: de loginpagina
  `https://psv.gxcloud.net/web/login`, en dat je voor toegang bij het Digital
  Marketing-team terechtkunt.

## Wat er met de originele tekst is gebeurd

- **Eén handeling per stap**, met de app vooraan (Xperience Central of Browser).
- **Schermteksten staan er precies zoals in XC:** *Configuratie*,
  *Serverconfiguratie*, *Redirects zoeken*, *Redirect toevoegen*, *Naam*,
  *Alias URL*, *Doel URL*, *Toepassen*, *Dump nu*, *Verwijder*.
- **"Zoek bestaande of maak een nieuwe aan"** is twee stappen geworden: eerst
  zoeken (stap 4), dan toevoegen (stap 5). Zo maakt niemand een redirect dubbel
  aan. Stap 4 verwijst naar Redirect wijzigen als een bestaande redirect naar een
  andere pagina moet.
- **Het voorbeeld psv.nl/winactie** staat in elke stap waar het helpt. De chat
  leest een stap soms los van de rest.
- **"PSV.nl"** is overal **psv.nl**: de hoofdletters in het domein doen er niet
  toe, de hoofdletters in de alias misschien wel (zie psv.nl/ucl en psv.nl/UCL).
- **"Neem contact op met Digital Marketing"** is "het Digital Marketing-team",
  net als op de andere kennisbankpagina's.
- **De twee regels** (één Doel URL per redirect; meerdere redirects standaard
  niet naar dezelfde Doel URL) staan als opmerking en waarschuwing bij de tips.
- **Toegevoegd:** de laatste stap van aanmaken en wijzigen (de redirect testen in
  de browser), een tip voor als de redirect nog niet werkt, en een waarschuwing om
  een redirect die nog in een mail, op social, op drukwerk of in een QR-code staat
  niet te verwijderen maar de Doel URL te wijzigen.

## Aangevuld na vragen

| Onderwerp | Wat er op de pagina staat |
|---|---|
| Wijzigen | Redirect wijzigen: bij Redirects zoeken zoeken op Naam, met het deel na psv.nl/. Daarna aanpassen, Toepassen en Dump nu. |
| Verwijderen | Redirect verwijderen: zoeken op Naam, het vinkje in de linkerkolom aanvinken en op Verwijder klikken. Daarna Dump nu. |
| Zonder Dump nu | Stap 10 en de tip: zonder Dump nu duurt het langer voordat de redirect live staat. |
| Vorm van de Doel URL | Stap 7: de volledige URL, met https:// ervoor, bijvoorbeeld https://www.psv.nl/fanstore. |
| 301 of 302 | Opmerking: een redirect in XC is tijdelijk (302). Een browser onthoudt die niet, dus een gewijzigde Doel URL geldt ook voor eerdere bezoekers. Daarom is "test in een privévenster" weggehaald. |
| GX Support en IT | Blijft zoals het staat: neem contact op met GX Support of de IT-afdeling van PSV. |
| Naamgeving van Naam | Naam is het deel van de link na psv.nl/, net als Alias URL. Je zoekt een redirect ook op Naam. |

## Open punten

Geen. Zie hieronder wat nog in de app te controleren is.

## Nog te controleren in de app

- **Opslaan bij wijzigen.** De pagina zegt dat je een gewijzigde redirect opslaat
  met *Toepassen*, net als bij toevoegen. Dat staat niet letterlijk in de
  antwoorden. Controleer de naam van de knop.
- **Dump nu na wijzigen en verwijderen.** De pagina zegt dat je ook na wijzigen
  en verwijderen op *Dump nu* klikt, omdat het anders langer duurt. Dat is
  afgeleid van de regel bij aanmaken.
- **Schuine streep in Alias URL.** Het voorbeeld is `winactie`, zonder `/` ervoor.
  Controleer of XC `/winactie` ook goed verwerkt of juist een fout geeft.
- **Hoofdletters in de alias.** Het voorbeeld psv.nl/ucl en psv.nl/UCL suggereert
  dat XC die als twee aliassen ziet. Controleer of psv.nl/UCL werkt als alleen de
  redirect ucl bestaat.
- **Waar Dump nu staat.** Volgens de originele tekst bij *Redirects zoeken*, na
  het opzoeken van de redirect. Controleer of de knop bij één redirect hoort of
  alle redirects tegelijk live zet.

## Testvragen voor de kennisbank-chat

| Vraag | Verwacht antwoord |
|---|---|
| Hoe maak ik een redirect aan? | Stap 1 t/m 11 op volgorde: inloggen, Configuratie, Serverconfiguratie, Redirects zoeken, Redirect toevoegen, Naam, Alias URL, Doel URL, Toepassen, Dump nu, testen. |
| Wat vul ik in bij Alias URL voor psv.nl/winactie? | `winactie`, zonder psv.nl ervoor. Bij Naam ook `winactie`. |
| Wat vul ik in bij Doel URL? | De volledige URL met https:// ervoor, bijvoorbeeld https://www.psv.nl/fanstore. |
| psv.nl/winactie moet naar een andere pagina. | Redirect wijzigen: Redirects zoeken, zoeken op Naam (winactie), Doel URL aanpassen, Toepassen, Dump nu, testen. |
| Hoe verwijder ik een redirect? | Redirect verwijderen: zoeken op Naam, vinkje in de linkerkolom, Verwijder, Dump nu. Met de waarschuwing: staat de link nog in een mail, op drukwerk of in een QR-code, wijzig dan de Doel URL. |
| Ik heb op Toepassen geklikt, maar de redirect werkt niet. | Klik op Dump nu; zonder Dump nu duurt het langer. Controleer Alias URL en Doel URL, en of de Doel URL volledig is. |
| Is een redirect permanent of tijdelijk? | Tijdelijk (302). |
| Kan psv.nl/ucl en psv.nl/UCL naar dezelfde pagina? | Standaard niet. Neem contact op met GX Support of de IT-afdeling van PSV. |
| Kan één redirect naar twee pagina's verwijzen? | Nee, een redirect heeft maar één Doel URL. |
| Ik kan niet inloggen in Xperience Central. | Neem contact op met het Digital Marketing-team. |
