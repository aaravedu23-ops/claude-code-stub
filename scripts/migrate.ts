/**
 * Runs before `next build`: applies database migrations, or stops the build
 * with a plain explanation when no database is connected.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { directDatabaseUrl } from "../lib/database-url";

const url = directDatabaseUrl();
if (!url) {
  console.error(`
──────────────────────────────────────────────────────────────
 No database is connected, so the build can't create tables.

 On Vercel: open your project → Storage → Create Database →
 Neon, connect it to this project, then redeploy.

 Locally: set DATABASE_URL in .env (see .env.example).
──────────────────────────────────────────────────────────────
`);
  process.exit(1);
}

const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable URL)";
  }
})();
console.log(`Applying database migrations on ${host}…`);
execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL_UNPOOLED: url } });
