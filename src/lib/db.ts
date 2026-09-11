import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// The single Prisma client instance for this app — nothing outside this file
// may instantiate one (see .agents/rules/05-directory-structure.md).
//
// Cached on `globalThis` in development so Next.js's module hot-reloading
// doesn't spawn a new client (and a new connection pool) on every edit.
// Prisma 7 has no built-in query engine — it connects through the
// @prisma/adapter-pg driver adapter (see prisma.config.ts for the migration
// side of this same DATABASE_URL).

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
