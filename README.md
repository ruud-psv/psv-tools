# PSV Tools

Interne tools van PSV (Next.js op Vercel). Documentatie per tool staat in `docs/`.

## PSV Play (JW Player)

Inzichten in PSV Play op `/dashboard/psv-play` en MCP-tools op `/api/mcp/psv-play`.
Alles staat in [`docs/psv-play.md`](docs/psv-play.md); kort:

- **Env vars**: `JWPLAYER_SECRET` (staat al in Vercel), optioneel `JWPLAYER_SITE_IDS`
  (`KhctZQO0:PSV Play,…`; standaard PSV Play), `MCP_PSVPLAY_TOKEN` voor de MCP-server, en de
  bestaande `CRON_SECRET` en `BLOB_READ_WRITE_TOKEN`.
- **Capability probe**: draait op Vercel bij de eerste vraag, elke maandag, en met de hand via
  `/api/psv-play/probe?opnieuw=1`. De uitkomst staat in Blob en bepaalt wat de pagina en de tools
  tonen. Bij oplevering nog niet gedraaid: de eerste uitkomst volgt na de deploy.
- **Tags voor de redactie**: `type:` (persconferentie, oefenwedstrijd, docu, interview,
  behind-the-scenes, samenvatting), `team:` (psv1, vrouwen, jong, jeugd) en `seizoen:` (zoals
  `2026-27`). Zonder `type:` valt een video onder Ongecategoriseerd.
- **Backfill**: `CRON_SECRET=… node scripts/jwplayer-backfill.mjs begin` (of een startdatum).
- **Beperkingen**: datums zijn JW-datums (US Eastern; een dag loopt bij ons van 06.00 tot
  06.00 uur), unieke kijkers zijn een benadering en niet optelbaar, percentage-completes alleen
  voor video's langer dan 30 seconden, en premium-onderdelen vragen mogelijk JW Enterprise.

## Tests

```bash
npm test
```
