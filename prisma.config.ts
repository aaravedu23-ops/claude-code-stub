import "dotenv/config";
import { defineConfig } from "prisma/config";
import { directDatabaseUrl } from "./lib/database-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // `prisma generate` needs no connection at all, so a missing URL must not
    // fail installs. scripts/migrate.ts stops the build when there's no database.
    url: directDatabaseUrl() ?? "postgresql://localhost:5432/stub",
  },
});
