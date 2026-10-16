# Redirect aanmaken voor psv.nl (Xperience Central)

Brondocument voor het stappenplan **Redirect aanmaken voor psv.nl** op de
kennisbankpagina **Xperience Central** (`lib/kennisbank.ts`, slug
`xperience-central`, sectie `#aan-de-slag`). De kennisbank-chat beantwoordt
vragen alleen met wat in de kennisbank staat. Wat hier als **open** staat, kan de
chat dus niet beantwoorden. De chat zegt dan dat het ontbreekt en verzint niets.

De chat stelt "Hoe maak ik een redirect aan?" al voor als voorbeeldvraag
(`app/dashboard/kennisbank/KennisbankChat.tsx`). Met deze pagina kan de chat die
vraag beantwoorden.

Pas de pagina aan in `lib/kennisbank.ts`. Werk daarna dit document bij en stel
de testvragen opnieuw in de kennisbank-chat.

## Waarom op de pagina Xperience Central

- **Xperience Central (XC) is het CMS van psv.nl.** De redirects staan daar, onder
  Configuratie > Serverconfiguratie.
- **De pagina was "binnenkort".** Met dit stappenplan heeft de pagina inhoud. De
  kop boven de stappen is "Redirect aanmaken voor psv.nl" (`stepsCaption`), zodat
  duidelijk blijft waar de stappen over gaan als er later meer onderwerpen bij
  komen.
- **Toegang** staat bovenaan de pagina: de loginpagina
  `https://psv.gxcloud.net/web/login`, en dat je voor toegang bij het Digital
  Marketing-team terechtkunt.

## Wat er met de originele tekst is gebeurd

- **Eén handeling per stap**, met de app vooraan (Xperience Central of Browser).
- **Schermteksten staan er precies zoals in XC:** *Configuratie*,
  *Serverconfiguratie*, *Redirects zoeken*, *Redirect toevoegen*, *Naam*,
  *Alias URL*, *Doel URL*, *Toepassen*, *Dump nu*.
- **"Zoek bestaande of maak een nieuwe aan"** is twee stappen geworden: eerst
  zoeken (stap 4), dan toevoegen (stap 5). Zo maakt niemand een redirect dubbel
  aan.
- **Het voorbeeld psv.nl/winactie** staat in elke stap waar het helpt. De chat
  leest een stap soms los van de rest.
- **"PSV.nl"** is overal **psv.nl**: de hoofdletters in het domein doen er niet
  toe, de hoofdletters in de alias misschien wel (zie psv.nl/ucl en psv.nl/UCL).
- **"Neem contact op met Digital Marketing"** is "het Digital Marketing-team",
  net als op de andere kennisbankpagina's.
- **De twee regels** (één Doel URL per redirect; meerdere redirects standaard
  niet naar dezelfde Doel URL) staan als opmerking en waarschuwing bij de tips.
- **Toegevoegd:** stap 11 (de redirect testen in een privévenster) en een tip
  voor als de redirect nog niet werkt. Een browser onthoudt een redirect; in een
  privévenster zie je wat een nieuwe bezoeker ziet.

## Open punten

| Open punt | Waarom het telt | Voorstel |
|---|---|---|
| **Een bestaande redirect wijzigen of verwijderen.** De originele tekst zegt alleen hoe je een redirect zoekt en toevoegt. | "De winactie is voorbij, waar moet psv.nl/winactie nu heen?" kan de chat niet beantwoorden. | Voeg toe hoe je bij *Redirects zoeken* een redirect aanpast of verwijdert, en of daarna weer *Dump nu* nodig is. |
| **Wat zonder Dump nu gebeurt.** *Dump nu* zet de redirect "snel" live. | Onduidelijk of de redirect zonder *Dump nu* later vanzelf live gaat (bijvoorbeeld 's nachts) of nooit. | Noem wanneer de dump anders draait. |
| **Vorm van de Doel URL.** Een volledige URL met `https://www.psv.nl/...`, of mag ook een pad zoals `/fanstore`? | Een verkeerde vorm geeft een redirect die nergens heen gaat. | Noem de vorm met een voorbeeld, ook voor een URL buiten psv.nl. |
| **Permanent of tijdelijk (301 of 302).** Staat niet in de originele tekst. | Een browser onthoudt een permanente redirect lang. Verwijst psv.nl/winactie later ergens anders heen, dan komen eerdere bezoekers nog op de oude pagina. | Noem welk type XC maakt en of je dat kunt kiezen. |
| **Uitzondering via GX Support of IT.** Voor meerdere redirects naar dezelfde Doel URL. | De chat kan niet zeggen hoe je GX Support of de IT-afdeling bereikt. | Zet het mailadres, portaal of de route via IT op de pagina. |
| **Naamgeving van Naam.** Nu is Naam gelijk aan de alias. | Maileon, Typeform en Playable hebben een vaste naamgeving met DMID. | Bevestig dat Naam gelijk is aan de alias, of geef een naamgeving. |

## Nog te controleren in de app

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
| Ik heb op Toepassen geklikt, maar de redirect werkt niet. | Zoek de redirect op bij Redirects zoeken en klik op Dump nu. Controleer Alias URL en Doel URL. Test in een privévenster. |
| Kan psv.nl/ucl en psv.nl/UCL naar dezelfde pagina? | Standaard niet. Neem contact op met GX Support of de IT-afdeling van PSV. |
| Kan één redirect naar twee pagina's verwijzen? | Nee, een redirect heeft maar één Doel URL. |
| Ik kan niet inloggen in Xperience Central. | Neem contact op met het Digital Marketing-team. |
| Hoe pas ik een bestaande redirect aan? | De chat zegt dat dit niet in de kennisbank staat (open punt) en verwijst naar het Digital Marketing-team. |
