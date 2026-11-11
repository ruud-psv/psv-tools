# Playable API-test

Op `/dashboard/playable-api-test` test je wat PSV Tools met de API van
Playable kan. De pagina staat bij de **Beta tools** in de sidebar; wie hem ziet
regel je in Gebruikersbeheer, net als bij de andere beta tools.

Het is een tijdelijke pagina: hij beantwoordt de vraag of een tool in PSV Tools
de HTML, CSS en JS van een campagnepagina zelf kan ophalen en terugzetten, of
dat een collega die blijft kopiëren en plakken.

## Wat de test doet

1. Leest de API-beschrijving op `https://api.playable.com/openapi.yaml`: welke
   rechten (scopes) en endpoints er zijn.
2. Vraagt met `PLAYABLE_CLIENT_ID` en `PLAYABLE_SECRET` een token aan voor alle
   rechten tegelijk. Lukt dat niet, dan per recht, zodat je ziet welke
   ontbreken. Lukt het wel, dan controleert hij met een verzonnen recht of
   Playable de rechten bij het aanvragen echt nakijkt.
3. Vraagt een token aan met **alleen lees-rechten** (`.list` en `.view`) en
   zonder rechten op registraties of andere persoonsgegevens.
4. Haalt met dat token alle GET-endpoints van de campagne op die in de
   beschrijving staan, plus de onderdelen van lijsten zoals
   `/campaign/{id}/sections/{section}`. Endpoints met mogelijk
   persoonsgegevens slaat hij over.
5. Zoekt in de antwoorden naar velden die op pagina-code lijken: klassen van de
   PSV Campaign Kit (`psvk-`), HTML-tags, CSS-regels, JavaScript, of velden die
   `html`, `css` of `js` heten.

De test verandert niets in Playable. Schrijfrechten als `campaigns.modify` en
`campaigns.copy` test hij alleen door er een token voor aan te vragen; dat
token gebruikt hij nergens voor. Tokens en sleutels komen niet in het rapport.

## Het resultaat lezen

- **Conclusie:** of de API pagina-code teruggeeft en waar, en of de sleutels
  `campaigns.modify` en `campaigns.copy` krijgen.
- **Rechten van de sleutels:** per recht toegestaan, niet toegestaan of
  onbekend, met de melding van Playable.
- **Opgehaald voor deze campagne:** per endpoint de status, de gevonden
  codevelden en het volledige antwoord.
- **API-beschrijving:** alle endpoints, en welke bij `campaigns.modify` en
  `campaigns.copy` horen.

Met **Kopieer rapport** zet je het hele resultaat als JSON op het klembord,
bijvoorbeeld om het in een gesprek met Claude te plakken.

## Wat je ermee doet

| Uitkomst | Betekenis |
|---|---|
| Code gevonden | Een tool kan de huidige pagina-code zelf ophalen; de collega hoeft alleen een campagne te kiezen |
| Geen code gevonden | De collega plakt de code de eerste keer; daarna bewaart PSV Tools de versie |
| `campaigns.modify` toegestaan | Terugzetten via de API is misschien mogelijk; kijk welke endpoints erbij horen |
| `campaigns.copy` toegestaan | Een tool kan een kopie als concept klaarzetten (let op: nieuwe campagne, nieuwe URL) |
| Niet toegestaan | Vraag bij Playable na of deze rechten aan de sleutels kunnen worden toegevoegd |

Neem voor de test een campagne die met de PSV Campaign Kit is gebouwd, anders
vindt hij geen `psvk-`-klassen.

## Code

- `lib/playable-api-test/spec.ts`: de API-beschrijving inlezen
- `lib/playable-api-test/scan.ts`: welke endpoints, pagina-code herkennen
- `lib/playable-api-test/run.ts`: de test zelf
- `app/api/playable-api-test/route.ts`: de API-route
- `components/playable-api-test.tsx`: de pagina

Is de vraag beantwoord, dan kunnen deze bestanden weg, samen met de regel in
`betaTools` (`lib/tools.ts`) en die in `API_PAGES` (`lib/access.ts`).
