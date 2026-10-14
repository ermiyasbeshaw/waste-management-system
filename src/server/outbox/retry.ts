/** Outbox retry schedule (CLAUDE.md §6): 1 / 5 / 15 / 60 minutes, then every 60 minutes until the limit. */

export const RETRY_DELAYS_MINUTES = [1, 5, 15, 60] as const;

/** Delay before the next try after `attempts` failed attempts (1-based); 60 min from the 4th on. */
export function retryDelayMinutes(attempts: number): number {
  return RETRY_DELAYS_MINUTES[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MINUTES.length) - 1];
}
