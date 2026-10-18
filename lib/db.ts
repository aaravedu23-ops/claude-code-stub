import { PrismaPg } from "@prisma/adapter-pg";
import { pooledDatabaseUrl } from "@/lib/database-url";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = pooledDatabaseUrl();
  // Don't throw here: `next build` imports this module without touching the database.
  if (!connectionString) console.warn("DATABASE_URL is not set. Add your Postgres connection string to .env.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
