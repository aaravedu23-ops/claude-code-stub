/**
 * Vercel's Neon and Postgres integrations name the connection string
 * differently depending on how the database was connected, so accept them all.
 */
export function pooledDatabaseUrl() {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL;
}

/** Migrations need a direct (unpooled) connection when one is available. */
export function directDatabaseUrl() {
  return (
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL_NO_SSL ??
    pooledDatabaseUrl()
  );
}
