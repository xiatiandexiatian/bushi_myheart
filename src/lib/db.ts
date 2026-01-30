import postgres from "postgres";

let sqlClient: ReturnType<typeof postgres> | null = null;

export const sql = (...args: Parameters<ReturnType<typeof postgres>>) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }
  if (!sqlClient) {
    sqlClient = postgres(databaseUrl, { ssl: "require" });
  }
  return sqlClient(...args);
};

export async function ensureSchema() {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto;`;
  await sql`
    CREATE TABLE IF NOT EXISTS records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      content text,
      mood text,
      images jsonb,
      videos jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `;
}
