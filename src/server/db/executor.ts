import type { NeonQueryResultHKT } from "drizzle-orm/neon-serverless";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * Anything that can run queries: the `db` pool or a transaction `tx` inside the Workflow Engine.
 * Data helpers take one of these so they run inside the caller's transaction.
 */
export type DbExecutor = PgDatabase<NeonQueryResultHKT, typeof schema>;
