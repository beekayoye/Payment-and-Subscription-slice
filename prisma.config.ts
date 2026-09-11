import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moved connection URLs out of schema.prisma — see
// https://pris.ly/d/prisma7-client-config. Only DATABASE_URL lives here;
// the client itself connects via the @prisma/adapter-pg driver adapter
// (see src/lib/db.ts), not by reading this file at runtime.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
