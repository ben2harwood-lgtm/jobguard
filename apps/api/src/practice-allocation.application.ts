import type { Pool } from "pg";
import { z } from "zod";
import { PracticeAllocationRepository } from "@jobguard/db";
import { practiceAllocationCommandV1, practiceAllocationQueryV1, practiceAllocationResponseV1, type PracticeAllocationResponse } from "./practice-allocation.contracts.js";

export class PracticeAllocationApplicationError extends Error {
  constructor(readonly code: "UNAUTHENTICATED" | "INVALID_QUERY" | "INVALID_COMMAND" | "NOT_FOUND" | "SYNTHETIC_ONLY") { super(code); }
}

type PracticeAllocationStore = Pick<PracticeAllocationRepository, "view" | "command">;
const identifier = z.string().uuid();
/** Synthetic session ownership and membership are rechecked by the repository on every call. */
export class PracticeAllocationApplication {
  private readonly repository: PracticeAllocationStore;
  constructor(pool: Pool, repository?: PracticeAllocationStore) {
    this.repository = repository ?? new PracticeAllocationRepository(pool, process.env.JOBGUARD_ENV ?? "unconfigured");
  }

  private authorize(sessionId: string | undefined, jobId: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PracticeAllocationApplicationError("SYNTHETIC_ONLY");
    if (!identifier.safeParse(sessionId).success) throw new PracticeAllocationApplicationError("UNAUTHENTICATED");
    const job = identifier.safeParse(jobId);
    if (!job.success) throw new PracticeAllocationApplicationError("NOT_FOUND");
    return { sessionId: sessionId!, jobId: job.data };
  }

  async view(sessionId: string | undefined, jobId: unknown, rawQuery: unknown = { version: "practice-allocation-query.v1" }): Promise<PracticeAllocationResponse> {
    const scope = this.authorize(sessionId, jobId);
    const parsed = practiceAllocationQueryV1.safeParse(rawQuery);
    if (!parsed.success) throw new PracticeAllocationApplicationError("INVALID_QUERY");
    return practiceAllocationResponseV1.parse(await this.repository.view(scope.sessionId, scope.jobId, parsed.data));
  }

  async command(sessionId: string | undefined, jobId: unknown, raw: unknown): Promise<PracticeAllocationResponse> {
    const scope = this.authorize(sessionId, jobId);
    const parsed = practiceAllocationCommandV1.safeParse(raw);
    if (!parsed.success) throw new PracticeAllocationApplicationError("INVALID_COMMAND");
    return practiceAllocationResponseV1.parse(await this.repository.command(scope.sessionId, scope.jobId, parsed.data));
  }
}
