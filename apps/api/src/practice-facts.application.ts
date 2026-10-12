import type { Pool } from "pg";
import { z } from "zod";
import {
  PracticeFeedRepository,
} from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { practiceFactsCommandV1, practiceFactsQueryV1, practiceFactsResponseV1, type PracticeFactsResponse } from "./practice-facts.contracts.js";

export class PracticeFactsApplicationError extends Error {
  constructor(readonly code: "UNAUTHENTICATED" | "INVALID_QUERY" | "INVALID_COMMAND" | "NOT_FOUND" | "SYNTHETIC_ONLY") { super(code); }
}

type PracticeFactsStore = Pick<PracticeFeedRepository, "factsView" | "factsCommand">;
const identifier = z.string().uuid();
/** One application for both transports (Nest and the in-process Next route handlers). */
export class PracticeFactsApplication {
  private readonly repository: PracticeFactsStore;
  constructor(private readonly pool: Pool, repository?: PracticeFactsStore) {
    this.repository = repository ?? new PracticeFeedRepository(pool, process.env.JOBGUARD_ENV ?? "unconfigured");
  }

  private async authorize(sessionId: string | undefined, jobId: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PracticeFactsApplicationError("SYNTHETIC_ONLY");
    if (!identifier.safeParse(sessionId).success) throw new PracticeFactsApplicationError("UNAUTHENTICATED");
    const job = identifier.safeParse(jobId);
    if (!job.success) throw new PracticeFactsApplicationError("NOT_FOUND");
    // SBOX authenticates the opaque cookie and resolves the creator-owned job. Only its digest continues to the repository:
    // the 7-day bearer token is never passed on, stored, set in a transaction or audited by the feed.
    const auth = await new PracticeAccess(this.pool, sessionId).job(job.data);
    return { jobId: job.data, auth };
  }

  async view(sessionId: string | undefined, jobId: unknown, rawQuery: unknown = { version: "practice-facts-query.v1" }): Promise<PracticeFactsResponse> {
    const scope = await this.authorize(sessionId, jobId);
    const parsed = practiceFactsQueryV1.safeParse(rawQuery);
    if (!parsed.success) throw new PracticeFactsApplicationError("INVALID_QUERY");
    return practiceFactsResponseV1.parse(await this.repository.factsView(scope.auth.context, { membershipId: scope.auth.membershipId, identityUserId: scope.auth.identityUserId }, scope.auth.digest, scope.jobId, parsed.data));
  }

  async command(sessionId: string | undefined, jobId: unknown, raw: unknown): Promise<PracticeFactsResponse> {
    const scope = await this.authorize(sessionId, jobId);
    const parsed = practiceFactsCommandV1.safeParse(raw);
    if (!parsed.success) throw new PracticeFactsApplicationError("INVALID_COMMAND");
    return practiceFactsResponseV1.parse(await this.repository.factsCommand(scope.auth.context, { membershipId: scope.auth.membershipId, identityUserId: scope.auth.identityUserId }, scope.auth.digest, scope.jobId, parsed.data));
  }
}
