/**
 * Drizzle configuration file for the Book Club Bot.
 *
 * Database dialect: Turso (libsql)
 * Credentials loaded from environment variables:
 *   - TURSO_DATABASE_URL (required)
 *   - TURSO_AUTH_TOKEN (optional)
 */

import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	out: "./drizzle",
	schema: "./src/core/db-schema.ts",
	dialect: "turso",
	dbCredentials: {
		url: process.env.TURSO_DATABASE_URL!,
		authToken: process.env.TURSO_AUTH_TOKEN,
	},
});
