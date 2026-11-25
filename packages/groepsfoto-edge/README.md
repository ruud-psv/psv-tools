# Groepsfoto-campagne: het script op Bunny

Het publieke deel van de groepsfoto-campagne (zie `docs/groepsfoto-campagne.md`).
Fans op de Playable-pagina praten alleen met dit script; het script praat met
Replicate en leest wat PSV Tools in de privé storage zone heeft gezet.

## Routes

Alles onder `/groepsfoto/<campagne>/`, met `<campagne>` de sleutel uit
PSV Tools (bijv. `kerst-2026`):

| Route | Wat |
|---|---|
| `POST maak` | body `{ selfie, toestemming: true, positie?, kleding?, turnstile }` → `{ ticket }` |
| `GET status/<ticket>` | `{ status: "bezig" \| "klaar" \| "mislukt", melding? }`; om de ~1,5 s opvragen |
| `GET beeld/<ticket>` | het beeld; ophalen met `fetch()` (niet als `<img src>`: zonder `Origin`-header weigert het script) en daarna als blob tonen of op een canvas zetten |

Een fout is altijd `{ code, melding }`, met een melding die je zo aan de fan kunt
tonen. Codes: `onbekend`, `herkomst`, `gesloten`, `vol`, `te-vaak`, `robot`,
`selfie`, `te-groot`, `toestemming`, `keuze`, `ticket`, `verlopen`, `storing`.

Alleen de adressen in de config van de campagne (`origins`) krijgen
CORS-headers. Een ticket is een uur geldig, zo lang als Replicate het beeld
bewaart.

## Bouwen

```bash
npm run edge:check   # typecheck
npm test             # de tests draaien mee met die van PSV Tools
npm run edge:build   # → packages/groepsfoto-edge/dist/groepsfoto.js
```

Het resultaat is één bestand; alleen de SDK van Bunny wordt bij het starten
van `esm.sh` geladen. **`dist/groepsfoto.js` staat in de repo**, zodat je hem
zonder npm in Bunny kunt plakken. Een test in `npm test` faalt als de code is
aangepast zonder dat het bestand opnieuw is gebouwd.

## Inrichten op Bunny

1. **Storage zone** (privé, zonder pull zone, S3-compatibiliteit uit). Bunny
   toont daarbij deze velden:

   | Veld in Bunny | Waar het heen gaat |
   |---|---|
   | **Naam** | `GROEPSFOTO_BUNNY_STORAGE_ZONE` in Vercel en `STORAGE_ZONE` in het script |
   | **Password** | `GROEPSFOTO_BUNNY_STORAGE_KEY` in Vercel en `STORAGE_KEY` in het script. Het script schrijft de dagteller, dus het read-only password is niet genoeg |
   | **Read-only password** | niet nodig |
   | **Storage zone ID** | niet nodig |
   | **Hostname** (onder FTP & API Access) | alleen invullen als hij niet `storage.bunnycdn.com` is: `GROEPSFOTO_BUNNY_STORAGE_HOST` in Vercel en `STORAGE_HOST` in het script |

2. **Edge Script**, type standalone. Open `dist/groepsfoto.js` op GitHub (knop
   *Raw* of *Copy raw file*), plak de inhoud in de editor van Bunny en publiceer. Het script krijgt een eigen `*.b-cdn.net`-adres; dat
   adres komt in de widget op Playable.
3. **Omgeving** van het script (zet de geheime waarden als *secret*):

   | Naam | Wat |
   |---|---|
   | `STORAGE_ZONE` | de naam van de privé storage zone |
   | `STORAGE_KEY` | het wachtwoord (API-sleutel) van die zone |
   | `STORAGE_HOST` | optioneel, alleen bij een andere regio (bijv. `uk.storage.bunnycdn.com`) |
   | `REPLICATE_API_TOKEN` | een **eigen** Replicate-sleutel voor campagnes, met een bestedingslimiet |
   | `TICKET_SLEUTEL` | 32 willekeurige bytes als base64: `openssl rand -base64 32` |
   | `TURNSTILE_SECRET` | de geheime sleutel van de Turnstile-site (Cloudflare) |
   | `IP_HEADER` | optioneel, standaard `x-real-ip`; zie hieronder |

4. **Rate limit** in Bunny Shield op `/groepsfoto/*/maak`, als harde aanvulling
   op de limiet per IP in het script (die geldt per instantie).

## Na te gaan bij de eerste deploy

De documentatie van Bunny was bij het bouwen niet bereikbaar; de code volgt de
officiële SDK (`@bunny.net/edgescript-sdk` 0.13.0). Controleer:

- **IP-adres van de bezoeker.** Het script leest `IP_HEADER` (standaard
  `x-real-ip`) en anders de eerste waarde van `x-forwarded-for`. Klopt dat niet
  voor Bunny, zet dan `IP_HEADER` goed; zonder IP werkt de limiet per IP niet.
- **Limieten van Edge Scripting**: maximale grootte van een aanvraag (een selfie
  is ± 300 kB, de grens in het script 4,5 MB) en de looptijd (`maak` wacht
  niet op het model, dus dat blijft kort).
- **Omgevingsvariabelen**: het script leest ze met `Deno.env.get()` en valt
  terug op `process.env`.

## De widget op Playable

In `widget/` staan de drie blokken voor de Playable loader in PSV Tools
(`/dashboard/playable-loader`, stap Code): `pagina.html`, `pagina.css` en
`pagina.js`. De Kit zet de loader er zelf bij.

Bovenaan `pagina.js` staan de instellingen:

| Instelling | Wat |
|---|---|
| `script` | het `*.b-cdn.net`-adres van het Edge Script, zonder `/` aan het eind |
| `campagne` | de sleutel van de campagne in PSV Tools (tabblad Campagnes) |
| `turnstileSiteKey` | de openbare site key van de Turnstile-widget |
| `kleding` | de keuzes; moeten passen bij wat de campagne in PSV Tools toestaat |
| `kaarttekst` | de tekst in de rode band onder de foto |

Wat de widget doet: selfie kiezen of maken (op een telefoon opent de
voorcamera), verkleinen in de browser (de metadata valt eraf), kleding kiezen,
toestemming en Turnstile, maken, wachten, en de kaart samenstellen op een
canvas: foto met witte rand, label "Gemaakt met AI" op de foto, rode band met
tekst en logo. Downloaden als JPEG, en delen op telefoons die dat kennen.

Getest in Chromium (desktop en iPhone-formaat) tegen de echte `handler.ts`,
met Replicate en Turnstile nagebootst.
