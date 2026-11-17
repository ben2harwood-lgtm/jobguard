import type { Pool } from "pg";
import { z } from "zod";
import { RecoveryAllocationRepository } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { recoveryAllocationCommandV1, recoveryAllocationViewV1, type RecoveryAllocationView } from "./recovery-allocation.contracts.js";
export class RecoveryAllocationApplicationError extends Error {
  constructor(readonly code: "UNAUTHENTICATED" | "NOT_FOUND" | "SYNTHETIC_ONLY" | "INVALID_COMMAND" | "INVALID_QUERY") { super(code); }
}
type Store = Pick<RecoveryAllocationRepository, "view" | "command">;
const identifier = z.guid({ error: "Invalid uuid" });
export class RecoveryAllocationApplication {
  private readonly repository: Store;
  constructor(private readonly pool: Pool, repository?: Store) { this.repository = repository ?? new RecoveryAllocationRepository(pool, process.env.JOBGUARD_ENV ?? "unconfigured"); }
  private async authorize(sessionId: string | undefined, rawJobId: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new RecoveryAllocationApplicationError("SYNTHETIC_ONLY");
    if (!identifier.safeParse(sessionId).success) throw new RecoveryAllocationApplicationError("UNAUTHENTICATED");
    const job = identifier.safeParse(rawJobId);
    if (!job.success) throw new RecoveryAllocationApplicationError("NOT_FOUND");
    const auth = await new PracticeAccess(this.pool, sessionId).job(job.data);
    return { jobId: job.data, auth };
  }
  async view(sessionId: string | undefined, jobId: unknown, query: unknown = {}): Promise<RecoveryAllocationView> {
    const scope = await this.authorize(sessionId, jobId);
    if (!z.object({}).strict().safeParse(query).success) throw new RecoveryAllocationApplicationError("INVALID_QUERY");
    return recoveryAllocationViewV1.parse(await this.repository.view(scope.auth.context, { membershipId: scope.auth.membershipId, identityUserId: scope.auth.identityUserId }, scope.auth.digest, scope.jobId));
  }
  async command(sessionId: string | undefined, jobId: unknown, raw: unknown, reversalOnly = false): Promise<RecoveryAllocationView> {
    const scope = await this.authorize(sessionId, jobId);
    let body = raw;
    if (typeof raw === "function") { try { body = await raw(); } catch { throw new RecoveryAllocationApplicationError("INVALID_COMMAND"); } }
    const parsed = recoveryAllocationCommandV1.safeParse(body);
    if (!parsed.success || (reversalOnly && !["review_reverse", "reverse"].includes(parsed.data.action))) throw new RecoveryAllocationApplicationError("INVALID_COMMAND");
    return recoveryAllocationViewV1.parse(await this.repository.command(scope.auth.context, { membershipId: scope.auth.membershipId, identityUserId: scope.auth.identityUserId }, scope.auth.digest, scope.jobId, parsed.data));
  }
}
