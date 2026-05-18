import { sql as _sql } from "@vercel/postgres";

// Re-export sql; routes will catch errors when POSTGRES_URL is not provisioned.
export const sql = _sql;

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

export async function ensureShareSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS share_links (
      token      TEXT PRIMARY KEY,
      params     JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}
