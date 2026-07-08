import { sql as _sql } from "@vercel/postgres";

// Re-export sql; routes will catch errors when POSTGRES_URL is not provisioned.
export const sql = _sql;

export async function ensureShareSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS share_links (
      token      TEXT PRIMARY KEY,
      params     JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}
