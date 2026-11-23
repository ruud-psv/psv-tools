# PSV Play

Inzichten in PSV Play, de videodienst in het Mijn PSV+-lidmaatschap, die op JW
Player draait. Pagina: `/dashboard/psv-play` (Marketing > Inzichten). Voor de
assistent is er een MCP-server: `/api/mcp/psv-play`.

## Omgevingsvariabelen

| Variabele | Nodig | Wat |
|---|---|---|
| `JWPLAYER_SECRET` | ja | API-sleutel van JW Player (v2, bearer). Staat al in Vercel. |
| `JWPLAYER_SITE_IDS` | nee | Properties met label, komma-gescheiden: `KhctZQO0:PSV Play,abcd1234:Ander`. Zonder deze variabele: PSV Play (`KhctZQO0`). `JWPLAYER_SITE_ID` (één id) mag ook. |
| `MCP_PSVPLAY_TOKEN` | voor de MCP-server | Willekeurig token van minstens 32 tekens: het wachtwoord van `/api/mcp/psv-play`. |
| `CRON_SECRET` | voor de cron en de backfill | Bestaat al. |
| `BLOB_READ_WRITE_TOKEN` | ja | Bestaat al (Vercel Blob). |

Het secret wordt alleen op de server gebruikt: alle JW-verzoeken lopen via de
API-routes van PSV Tools en het secret komt nooit in de browser, een log of een
foutmelding.

## Capability probe

De JW-API geeft per licentie andere dimensies en metrics. PSV Tools gaat
daarom niet uit van aannames, maar test het:

- **Wanneer**: automatisch bij de eerste vraag (de pagina of een MCP-tool;
  duurt ongeveer een minuut door de rate limit), elke maandag via de cron, en
  met de hand via `/api/psv-play/probe?opnieuw=1` (ingelogd).
- **Wat**: elke metric los (met de `operation` die werkt), de dimensies
  `tag`, `platform_id`, `video_duration`, `browser`, `city`, `media_id`,
  `device_id`, `country_code` en `player_playback_mode`, `include_metadata`,
  de OTT-bron met `logged_in_unique_viewers`, het live-filter, de
  percentage-completes, het grootste datumbereik per query, de oudste dag met
  data en de velden van de Management API.
- **Waar**: Vercel Blob, `psv-play/capabilities.json`, met elke losse check.
  Bekijk de laatste uitkomst op `/api/psv-play/probe`.
- **Gevolg**: onderdelen die niet kunnen, verdwijnen van de pagina en uit de
  tools, met een korte uitleg op die plek (zoals "vereist JW Enterprise").

Lokaal kan het ook, met `JWPLAYER_SECRET` in `.env.local`:

```bash
node --experimental-strip-types --no-warnings --import ./scripts/test-hooks.mjs scripts/jwplayer-probe.ts
```

**Uitkomst**: nog niet bekend. De probe draait voor het eerst bij de eerste
vraag na de deploy. Zet de uitkomst daarna hier.

## Tags voor de redactie

PSV Tools groepeert video's op tags met een prefix. Geef elke video in JW
Player:

| Prefix | Waarden | Voorbeeld |
|---|---|---|
| `type:` | `persconferentie`, `oefenwedstrijd`, `docu`, `interview`, `behind-the-scenes`, `samenvatting` | `type:persconferentie` |
| `team:` | `psv1`, `vrouwen`, `jong`, `jeugd` | `team:vrouwen` |
| `seizoen:` | het seizoen, van 1 juli tot en met 30 juni | `seizoen:2026-27` |

Een video zonder `type:`-tag valt onder **Ongecategoriseerd**. Het tabblad
Content toont welk deel van de kijktijd dat is: hoe lager, hoe beter de cijfers
per type kloppen. Hoofdletters en spaties rond de dubbele punt tellen niet. Een
nieuwe waarde (zoals `type:podcast`) telt meteen mee; zet hem in
`config/psvplay-taxonomy.ts` voor een nette naam.

## De pagina

- Periode: 7, 30 of 90 dagen, dit seizoen (vanaf 1 juli) of een eigen bereik.
  Altijd met de delta ten opzichte van de vorige periode (even lang, direct
  ervoor; bij het seizoen dezelfde dagen een seizoen eerder).
- **Overzicht**: kijktijd in uren (de north star), unieke kijkers, plays,
  kijktijd per kijker, complete rate, en het verloop per dag.
- **Content**: top-video's met afhaakcurve, prestaties per type en per team, en
  het aandeel ongecategoriseerd.
- **Live**: per uitzending de live-plays (playback mode LIVE of DVR), unieke
  kijkers, kijktijd en de nakijk-plays in de zeven dagen erna, plus een
  vergelijking per type.
- **Publiek**: device, platform en land (top 10, Nederland en buitenland totaal).
- Met meerdere properties een propertykiezer.

## MCP-tools

Alle tools lezen alleen en werken met vaste lijsten van metrics en dimensies:
er is geen vrije query-tool en niets schrijft naar JW. Invoer: `preset`
(`7d`, `30d`, `90d`, `season`) of `start_date`/`end_date`, en optioneel
`site`. Uitvoer: compacte JSON met titels, de periode in JW-datums,
`data_through` en `notes`.

| Tool | Wat hij doet |
|---|---|
| `psvplay_overview` | KPI's met delta ten opzichte van de vorige periode, en het verloop per dag. |
| `psvplay_top_content` | Top-N op kijktijd, plays, unieke kijkers of complete rate; filter op type, team of seizoen. Met prestaties per type en team en het aandeel ongecategoriseerd. |
| `psvplay_media_detail` | Eén video: kerncijfers, afhaakcurve, verloop per dag en het gemiddelde van hetzelfde type. |
| `psvplay_compare_periods` | Twee periodes naast elkaar, totaal of per type. |
| `psvplay_live_events` | Live-uitzendingen met live- en nakijkcijfers. |
| `psvplay_audience` | Device, platform en land. |
| `psvplay_search_media` | Video's zoeken op titel of tag (Management API), ook op publicatiedatum. |

**Aanzetten in de assistent**: zet `MCP_PSVPLAY_TOKEN` in Vercel en deploy.
Klik in Beheer > MCP Servers bij **Ingebouwd: PSV Play** op **Invullen** en
**Opslaan**, dan **Verbinding testen**, en zet de tools aan. Alleen wie PSV Play
mag zien, krijgt de tools.

## Opslag, cache en de dagelijkse snapshot

- **Cache**: query's die tot en met gisteren of vandaag lopen 15 minuten in het
  geheugen (JW verwerkt cijfers met vertraging); query's over afgesloten dagen
  30 dagen, ook in Blob (`psv-play/cache/`).
- **Media**: titels, tags, publicatiedatum en duur per video uit de Management
  API, zes uur bewaard in Blob (`psv-play/<site>/media.json.gz`). Een
  verwijderde video heet "Verwijderde video (<id>)".
- **Snapshot**: de cron (`/api/psv-play/snapshot`, 06.00 uur UTC: 07.00 uur in
  de winter, 08.00 uur in de zomer) legt per JW-dag vast: totalen, per video
  (plays, kijktijd, completes, 25/50/75%, unieke kijkers) en, als de licentie
  het toelaat, per tag, platform, device en land. Gisteren en eergisteren worden
  elke dag opnieuw geschreven, en gaten van de laatste week gevuld. Opslag:
  `psv-play/<site>/dagen/<JJJJ-MM-DD>.json.gz`. Dagen die de API zelf niet meer
  geeft, komen uit deze snapshots.
- **Rate limit**: 60 verzoeken per minuut per token. De client wacht als het
  venster vol is en probeert het bij een 429 opnieuw na 1, 2, 4, 8 en 16
  seconden (of na `Retry-After`).

### Backfill

Legt elke ontbrekende dag vast vanaf een datum, of vanaf de oudste dag die de
API kent (`begin`). Het werk gebeurt op Vercel; de route start zelf vervolgruns.

```bash
CRON_SECRET=… node scripts/jwplayer-backfill.mjs begin
```

Of met een startdatum: `node scripts/jwplayer-backfill.mjs 2024-07-01`. Opnieuw
draaien kan altijd: bestaande dagen worden overgeslagen.

## Bekende beperkingen

- **Tijdzone**: JW telt in US Eastern. Een JW-dag loopt in Nederland van
  06.00 tot 06.00 uur (een paar weken per jaar 05.00 tot 05.00 uur). Een
  avondwedstrijd om 21.00 uur valt dus op de juiste dag, maar kijken om 02.00
  uur 's nachts telt bij de dag ervoor. PSV Tools rekent niet om: datums zijn
  JW-datums, en de pagina zegt dat in een voetnoot.
- **Unieke kijkers** zijn een benadering (IP-adres plus browser) en niet
  optelbaar over dagen, video's of groepen. PSV Tools haalt ze over een periode
  altijd met één query over die hele periode op. Is de periode langer dan één
  query toelaat, dan staat er "–".
- **Percentage-completes** (25/50/75%) en de afhaakcurve bestaan alleen voor
  video's langer dan 30 seconden.
- **Licentie**: premium-dimensies en -metrics (zoals platform, land, tag en de
  percentage-completes) vragen mogelijk JW Enterprise. De probe bepaalt wat er
  is.
- **Nakijken**: een opname die als losse video is gepubliceerd, wordt op titel
  gekoppeld (dezelfde titel, tot drie dagen na de uitzending). Een andere titel
  wordt niet herkend.
- **Snapshot direct na middernacht Eastern**: de cron draait kort nadat een
  JW-dag sluit; daarom wordt eergisteren de dag erna nog eens geschreven.

## Bestanden

| Onderdeel | Bestand |
|---|---|
| Client (throttle, backoff, paginering) | `lib/jwplayer/client.ts` |
| Periodes en JW-datums | `lib/jwplayer/periode.ts` |
| Cijfers voor pagina en tools | `lib/jwplayer/rapport.ts` |
| Probe en capabilities | `lib/jwplayer/probe.ts`, `lib/jwplayer/capabilities.ts`, `config/jwplayer-capabilities.ts` |
| Tags | `config/psvplay-taxonomy.ts`, `lib/jwplayer/taxonomie.ts` |
| Cache, media, snapshot, opslag | `lib/jwplayer/cache.ts`, `media.ts`, `snapshot.ts`, `store.ts` |
| Routes | `app/api/psv-play/route.ts`, `probe/route.ts`, `snapshot/route.ts` |
| MCP | `lib/mcp/servers/psv-play.ts`, `app/api/mcp/psv-play/route.ts` |
| Pagina | `app/dashboard/psv-play/page.tsx`, `components/psv-play/` |

Tests: `npm test` (alles in `lib/jwplayer/*.test.ts` en
`lib/mcp/servers/psv-play.test.ts`, met gemockte JW-antwoorden).
