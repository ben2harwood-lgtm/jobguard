import type { TenantTransaction } from "./tenant-context.js";
import { JobWorkStateError } from "@jobguard/core";
import { z } from "zod";

/** B must replace the private SQL seam under tenant-capacity-first locking.
 * A cached count or fixture result cannot authorize this transaction.
 * This module cannot open a transaction or mint an admission token.
 */
const admissionV1 = z.object({
 version: z.literal("job-work-place-admission.v1"), jobId: z.guid({ error: "Invalid uuid" }),
 action: z.enum(["reopen", "resume", "restart"]),
}).strict();
export async function admitWorkPlace(database: TenantTransaction, raw: z.infer<typeof admissionV1>): Promise<never> {
 const parsed = admissionV1.safeParse(raw);
 if (!parsed.success) throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
 // The runtime has no EXECUTE grant on ch4_admit_place. Only checked SQL
 // commands invoke it. Keep the typed integration seam equally fail-closed.
 void database;
 throw new JobWorkStateError("CAPACITY_ADMISSION_UNAVAILABLE");
}
