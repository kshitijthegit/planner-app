import type { Env, Router } from '../lib/core';

/**
 * A backend feature module. To add a feature: create a file in worker/modules/,
 * export a BackendModule, and list it in worker/modules/index.ts.
 */
export interface BackendModule {
  id: string;
  register(r: Router): void;
  /** Runs every 5 minutes from the cron trigger. */
  cron?(env: Env, now: Date): Promise<void>;
}
