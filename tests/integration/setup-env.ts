import { config } from "dotenv";
import { testDatabaseEnv } from "../test-database";

// Everything else (Clerk keys, CRON_SECRET, OUTBOX_ENCRYPTION_KEY …) from .env.local; the database is the
// Neon `test` branch, never `dev` (tests/test-database.ts).
config({ path: ".env.local", quiet: true });
Object.assign(process.env, testDatabaseEnv());
// Messages wait for the outbox job (tests read pickup codes from the outbox before they are sent and wiped).
process.env.OUTBOX_DISPATCH_AFTER_COMMIT = "0";
