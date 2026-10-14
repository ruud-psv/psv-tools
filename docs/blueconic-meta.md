# BlueConic-doelgroepen delen met Meta

Brondocument voor het stappenplan **Doelgroepen delen met Meta** op de
kennisbankpagina **BlueConic** (`lib/kennisbank.ts`, slug `blueconic`, sectie
`#aan-de-slag`). De kennisbank-chat beantwoordt vragen alleen met wat in de
kennisbank staat. Wat hier als **open** staat, kan de chat dus niet beantwoorden.
De chat zegt dan dat het ontbreekt en verzint niets.

Pas de pagina aan in `lib/kennisbank.ts`. Werk daarna dit document bij en stel
de testvragen opnieuw in de kennisbank-chat.

## Waarom op de BlueConic-pagina

- **Op één plek.** Op twee pagina's raken dezelfde stappen uit elkaar.
  De chat krijgt de hele kennisbank mee en vindt de stappen dus ook bij een vraag
  over Meta.
- **Het werk gebeurt in BlueConic.** Alleen de controle aan het eind gebeurt in
  Meta.
- **De kop boven de stappen** is "Doelgroepen delen met Meta" (`stepsCaption`)
  in plaats van "Aan de slag". Zo is ook duidelijk waar de stappen over gaan als
  de BlueConic-pagina later meer onderwerpen krijgt.
- **Meta Ads** heeft nog geen documentatie ("binnenkort"). Krijgt die pagina
  inhoud, zet er dan een opmerking op die naar de BlueConic-pagina verwijst.

## Wat er met de originele tekst is gebeurd

- **Eén handeling per stap**, met de app vooraan (BlueConic of Meta). De drie
  genummerde stappen uit de originele tekst (link, map, run) zijn stap 5 t/m 9.
- **Engelse schermteksten blijven Engels**, precies zoals in BlueConic: *Add
  connection*, *Link identifiers between BlueConic and Meta (Facebook and
  Instagram)*, *Map BlueConic segments to Meta (Facebook and Instagram) Custom
  Audiences*, *Create [naam doelgroep]*, *Set up and run*, *Run now*. De
  uitleg eromheen is vertaald.
- **"Selecteer bijvoorbeeld Create Facebook Custom Audiences"** staat op de
  pagina zonder "bijvoorbeeld": dat is het goal om lijsten in bulk door te zetten.
  Zie ook het open punt over andere goals.
- **Consent** staat zowel in stap 5 als in een waarschuwing, met het waarom
  erbij. De chat leest een stap soms los van de rest.
- **Toegevoegd:** stap 10 (controleren in Meta) en een opmerking dat een Custom
  Audience in Meta meestal kleiner is dan het segment. Volgens BlueConic komen
  alleen profielen met een koppelbare identifier in de audience.

## Aangevuld na vragen

| Onderwerp | Wat er op de pagina staat |
|---|---|
| Toegang | Toegang: toegang tot BlueConic vraag je aan bij het Digital Marketing-team. Iedereen met toegang tot BlueConic kan de connecties gebruiken. |
| Welk Meta Ads-account | Stap 2 en de tabel Meta Ads-accounts: PSV (1062594023819316) en PSV FANstore (1038583669553685). |
| Goal | Stap 4: *Create Facebook Custom Audiences* is het goal om lijsten in bulk door te zetten. |
| Naamgeving | Stap 7: de naam van een Custom Audience volgt de naamgeving van Meta Ads. |
| Uit het segment | Opmerking: BlueConic haalt het profiel bij de volgende run uit de Custom Audience, standaard elke nacht. |

## Open punten

| Open punt | Waarom het telt | Voorstel |
|---|---|---|
| **Welke toestemming telt?** De pagina zegt "alleen identifiers met de juiste toestemming", maar niet welk veld of welke objective in BlueConic dat bepaalt. | Zonder dat kan een collega niet controleren of een segment mag. Het gaat om persoonsgegevens die naar Meta gaan. | Noem het consentveld of de objective, en of het segment daar al op filtert. |
| **Naamgeving van Meta Ads.** Stap 7 verwijst ernaar, maar de pagina Meta Ads is nog "binnenkort". | Tot die pagina er is, kan de chat de naamgeving niet geven. | Zet de taxonomie op de pagina Meta Ads, net als bij Maileon en Typeform. |
| **Andere goals.** Welke goals zijn er naast *Create Facebook Custom Audiences*, en wanneer gebruik je ze? | Nu staat alleen het bulk-goal op de pagina. | Vul aan op de BlueConic-pagina. |
| **Connectie voor PSV FANstore.** De stappen noemen de connectie Ads - Facebook - PSV. | Heeft PSV FANstore een eigen connectie, dan klopt stap 3 en 4 niet voor FANstore. | Noem de naam van de connectie voor PSV FANstore, of bevestig dat het dezelfde is. |

Zodra de pagina Meta Ads inhoud krijgt: zet daar een opmerking die naar de
stappen op de BlueConic-pagina verwijst.

## Nog te controleren in de app

- **Stap 10, de plek in Meta.** Waar je de Custom Audience in Meta vindt (Ads
  Manager > Audiences) staat niet in de originele tekst en is daarom niet op de
  pagina gezet.
- **Opslaan.** Of je de connectie eerst moet opslaan voordat je op *Run now*
  klikt, staat niet in de originele tekst.

## Testvragen voor de kennisbank-chat

| Vraag | Verwacht antwoord |
|---|---|
| Hoe zet ik een BlueConic-segment door naar Facebook? | Stap 1 t/m 10 op volgorde: Connections, Ads - Facebook - PSV, Create Facebook Custom Audiences, identifiers, mapping, Run now. |
| Op welke identifier koppel ik? | Bij voorkeur e-mailadres, telefoonnummer of de advanced Meta ID. Een combinatie van woonplaats, leeftijd en naam kan ook. Alleen met toestemming. |
| De doelgroep bestaat nog niet in Meta. | Typ de naam in de dropdown van de mapping en klik op Create [naam doelgroep]. |
| Ik zie mijn nieuwe audience niet in Meta. | Die verschijnt pas na de eerste run. Standaard 's nachts om 3.00 uur, of meteen met Run now. |
| Hoe vaak draait de connectie? | Standaard elke nacht om 3.00 uur. Aan te passen via het tandwiel bij Set up and run. |
| Waarom is mijn audience in Meta kleiner dan het segment? | Meta herkent niet elk profiel. Alleen profielen met een koppelbare identifier komen erin. |
| Er staat geen connectie met ons Meta-account. | Connections > Add connection en koppel het juiste Meta Ads-account. |
| Welk Meta Ads-account is van de FANstore? | PSV FANstore, 1038583669553685. PSV is 1062594023819316. |
| Iemand zit niet meer in het segment, blijft die in de audience? | Nee, BlueConic haalt het profiel bij de volgende run eruit, standaard elke nacht om 3.00 uur. |
| Hoe kom ik in BlueConic? | Vraag toegang aan bij het Digital Marketing-team. |
| Hoe noem ik de Custom Audience? | Volgens de naamgeving van Meta Ads. Die staat er nog niet (open punt). |
| Welk consentveld moet ik controleren? | Staat er niet (open punt). |

## Bronnen

De help van BlueConic was vanuit deze omgeving niet te openen. De pagina volgt
de originele tekst. Twee feiten zijn gecontroleerd via zoekresultaten:

- Alleen profielen met een identifier die het advertentieplatform kan koppelen,
  komen in de audience. Het aantal gekoppelde profielen is meestal lager dan het
  aantal dat BlueConic verstuurt:
  [Syncing segments with custom audiences in advertising connections](https://support.blueconic.com/en/articles/248045-syncing-segments-with-custom-audiences-in-advertising-connections-deep-dive)
- BlueConic vraagt om gebruikers te informeren en toestemming te vragen waar
  nodig: [Facebook Advertising Connection](https://support.blueconic.com/hc/en-us/articles/205377811)
