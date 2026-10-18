/**
 * Vercel's Neon and Postgres integrations name the connection string
 * differently depending on how the database was connected (and an optional
 * custom prefix), so known names come first, then any variable holding a
 * postgres:// URL.
 */

const isPostgres = (v: string | undefined): v is string => !!v && /^postgres(ql)?:\/\//.test(v);
const isDirect = (key: string) => /UNPOOLED|NON_POOLING|DIRECT/i.test(key);

function scan() {
  return Object.entries(process.env)
    .filter((e): e is [string, string] => isPostgres(e[1]))
    .sort(([a], [b]) => a.localeCompare(b));
}

export function pooledDatabaseUrl() {
  for (const k of ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL"]) if (isPostgres(process.env[k])) return process.env[k];
  return scan().find(([k]) => !isDirect(k))?.[1] ?? scan()[0]?.[1];
}

/** Migrations need a direct (unpooled) connection when one is available. */
export function directDatabaseUrl() {
  for (const k of ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"]) if (isPostgres(process.env[k])) return process.env[k];
  return scan().find(([k]) => isDirect(k))?.[1] ?? pooledDatabaseUrl();
}

/** Names (never values) of variables that look database-related, for build logs. */
export function databaseVariableNames() {
  return Object.keys(process.env)
    .filter((k) => /DATABASE|POSTGRES|NEON|PG/i.test(k))
    .sort();
}
