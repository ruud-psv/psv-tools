# Domeinscan psv.\<tld\>

`scripts/psv-domeinscan.mjs` kijkt voor álle topleveldomeinen (actuele lijst van
IANA, ± 1.450) plus veelgebruikte tweede niveaus (`co.uk`, `com.au`, `com.br`, …)
wat er op `psv.<tld>` draait, en maakt van elke website een screenshot. Zo zie je
wie de combinatie gebruikt en of iemand onze site namaakt voor phishing.

## Draaien

Eenmalig:

```bash
npm i -D playwright
npx playwright install chromium
```

Daarna (duurt ± 10 à 20 minuten):

```bash
node scripts/psv-domeinscan.mjs
```

De uitvoer komt in `domeinscan/<datum>/` (staat in `.gitignore`):

- `rapport.html` — alle geregistreerde domeinen met screenshot, filterbaar per categorie
- `resultaten.csv` / `resultaten.json` — alles, ook de niet-geregistreerde domeinen
- `screenshots/` — de losse afbeeldingen

## Categorieën

| Categorie | Betekenis |
|---|---|
| verdacht | Niet van ons, maar de pagina noemt PSV Eindhoven, Philips Stadion, tickets, seizoenkaart e.d., of heeft een inlogveld en noemt PSV. **Bekijk deze als eerste.** |
| ander gebruik | Een site van iemand anders (bijv. een bedrijf dat ook PSV heet). |
| geparkeerd | Parkeerpagina, "domein te koop" of een (bijna) lege pagina. |
| eigen | Draait op, of stuurt door naar, een van de domeinen in `--eigen`. |
| geen website | Domein wijst naar een server, maar die gaf geen pagina. |
| geregistreerd, geen webadres | Domein bestaat (nameservers), maar heeft geen IP-adres. |

Niet-geregistreerde domeinen en TLD's die elk domein laten resolven (wildcard)
staan alleen in de CSV/JSON. De indeling is een heuristiek op basis van tekst:
een kloon die alleen uit afbeeldingen bestaat valt mogelijk onder "ander
gebruik". Loop die categorie dus ook even door.

## Opties

```bash
node scripts/psv-domeinscan.mjs --eigen psv.nl,psv.com,psv.eu   # welke domeinen van ons zijn
node scripts/psv-domeinscan.mjs --alleen nl,com,co.uk           # alleen een paar TLD's (testen)
node scripts/psv-domeinscan.mjs --www                           # ook www.psv.<tld> proberen
node scripts/psv-domeinscan.mjs --parallel 10                   # meer tabbladen tegelijk
node scripts/psv-domeinscan.mjs --naam psveindhoven             # ander label dan "psv"
node scripts/psv-domeinscan.mjs --dns 1.1.1.1,8.8.8.8           # andere DNS-servers
```

### Periodiek vergelijken

Geef de `resultaten.json` van een eerdere scan mee; nieuwe domeinen en domeinen
waarvan de categorie, het eindadres of de titel veranderd is krijgen een gouden
label in het rapport (en een waarde in de kolom `wijziging`):

```bash
node scripts/psv-domeinscan.mjs --vorige domeinscan/2026-11-25/resultaten.json
```
