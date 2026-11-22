import { requirePilotG1 } from "@jobguard/config";
import { FINAL_CHECK_EMPTY_TEXT, FINAL_CHECK_RUNNING_TEXT, parseFinalCheckDisposition } from "@jobguard/core";
import { FinalCheckRepository, type VerifiedTenantContext } from "@jobguard/db";
import type { Pool } from "pg";
import type { PilotJobAccess } from "./pilot-job-access.js";

export function pilotFinalCheck(pool: Pool, context: VerifiedTenantContext, access: PilotJobAccess) {
  const repository = new FinalCheckRepository(pool);
  async function authorize(jobId: string) {
    await access(jobId, true);
    requirePilotG1(process.env);
  }
  return {
    async get(jobId: string) {
      await authorize(jobId);
      const view = await repository.read(context, jobId, null);
      const message = view.state === "pending" ? FINAL_CHECK_RUNNING_TEXT
        : view.state === "completed" && view.items.length === 0 ? FINAL_CHECK_EMPTY_TEXT : null;
      return { ...view, message };
    },
    async disputes(jobId: string) {
      await authorize(jobId);
      return repository.disputes(context, jobId, null);
    },
    async disposition(jobId: string, raw: unknown) {
      await authorize(jobId);
      return repository.disposition(context, jobId, null, parseFinalCheckDisposition(raw));
    },
    async confirmCatch(jobId: string, raw: unknown) {
      await authorize(jobId);
      return repository.confirmCatch(context, jobId, null, raw);
    },
  };
}
