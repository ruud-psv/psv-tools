import { sql } from "@vercel/postgres";

export { sql };

export async function ensureSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS ticket_snapshots (
      id        BIGSERIAL PRIMARY KEY,
      ts        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      event_id  TEXT        NOT NULL,
      available INTEGER     NOT NULL,
      sold      INTEGER     NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ts_snapshots_event
    ON ticket_snapshots (event_id, ts)
  `;
}
