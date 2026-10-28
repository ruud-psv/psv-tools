# Gebruikersbeheer

Op `/dashboard/gebruikersbeheer` bepaalt een admin per collega welke pagina's
zichtbaar zijn. Nieuwe collega's worden nog steeds in de Azure portal aan de
Enterprise Application toegevoegd; hier stel je alleen in wat ze mogen zien.

## Niveaus

| Niveau | Wat je ziet |
|---|---|
| **Admin** | Alle pagina's, de beta tools en gebruikersbeheer |
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
