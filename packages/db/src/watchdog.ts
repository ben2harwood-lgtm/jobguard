import { z } from "zod";
import type { TenantTransaction } from "./tenant-context.js";

export class WatchdogError extends Error {
  constructor(readonly code: "JOB_NOT_LIVE" | "JOB_NOT_FOUND") {
    super(code);
    this.name = "WatchdogError";
  }
}

/** First business lock. Held until commit, including through all audit appends.
 * Trigger rechecks acquire the same already-held share lock, never a new row lock.
 */
export async function requireLiveJob(database: TenantTransaction, jobId: string): Promise<void> {
  if (!z.string().uuid().safeParse(jobId).success) throw new WatchdogError("JOB_NOT_FOUND");
  try {
    await database.$client.query("SELECT app.require_watchdog_live($1::uuid)", [jobId]);
  } catch (error) {
    if (error instanceof Error && ["JOB_NOT_LIVE", "JOB_NOT_FOUND"].includes(error.message)) {
      throw new WatchdogError(error.message as "JOB_NOT_LIVE" | "JOB_NOT_FOUND");
    }
    throw error;
  }
}
