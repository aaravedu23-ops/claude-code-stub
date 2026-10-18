import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Migrations need a direct (unpooled) connection; Neon on Vercel provides
    // DATABASE_URL_UNPOOLED for that. `prisma generate` needs no connection at
    // all, so a missing URL must not fail installs.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "postgresql://localhost:5432/stub",
  },
});
