import "server-only";
import { parseEnv } from "@/lib/env-schema";

/**
 * Validated environment for server code (CLAUDE.md §9). Parsed once when the server starts; a missing or
 * placeholder value stops `next dev` / `next build` with a list of variable names (never values).
 * Client components must not import this file — public values are read via `process.env.NEXT_PUBLIC_*`.
 */
export const env = parseEnv(process.env);
