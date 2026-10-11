import type { Pool } from "pg";
import { z } from "zod";
import {
  PracticeFeedRepository,
} from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { practiceFeedCommandV1, practiceFeedQueryV1, practiceFeedResponseV1, type PracticeFeedResponse } from "./practice-feed.contracts.js";

export class PracticeFeedApplicationError extends Error {
  constructor(readonly code: "UNAUTHENTICATED" | "INVALID_QUERY" | "INVALID_COMMAND" | "NOT_FOUND" | "SYNTHETIC_ONLY") { super(code); }
}

type PracticeFeedStore = Pick<PracticeFeedRepository, "view" | "command">;
const identifier = z.string().uuid();
/** One application for both transports (Nest and the in-process Next route handlers). */
export class PracticeFeedApplication {
  private readonly repository: PracticeFeedStore;
  constructor(private readonly pool: Pool, repository?: PracticeFeedStore) {
    this.repository = repository ?? new PracticeFeedRepository(pool, process.env.JOBGUARD_ENV ?? "unconfigured");
  }

  private async authorize(sessionId: string | undefined, jobId: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PracticeFeedApplicationError("SYNTHETIC_ONLY");
    if (!identifier.safeParse(sessionId).success) throw new PracticeFeedApplicationError("UNAUTHENTICATED");
    const job = identifier.safeParse(jobId);
    if (!job.success) throw new PracticeFeedApplicationError("NOT_FOUND");
    // SBOX authenticates the opaque cookie and resolves the creator-owned job. Only its digest continues to the repository:
    // the 7-day bearer token is never passed on, stored, set in a transaction or audited by the feed.
    const auth = await new PracticeAccess(this.pool, sessionId).job(job.data);
    return { jobId: job.data, auth };
  }

  async view(sessionId: string | undefined, jobId: unknown, rawQuery: unknown = { version: "practice-feed-query.v1" }): Promise<PracticeFeedResponse> {
    const scope = await this.authorize(sessionId, jobId);
    const parsed = practiceFeedQueryV1.safeParse(rawQuery);
    if (!parsed.success) throw new PracticeFeedApplicationError("INVALID_QUERY");
    return practiceFeedResponseV1.parse(await this.repository.view(scope.auth.context, { membershipId: scope.auth.membershipId, identityUserId: scope.auth.identityUserId }, scope.auth.digest, scope.jobId, parsed.data));
  }

  async command(sessionId: string | undefined, jobId: unknown, raw: unknown): Promise<PracticeFeedResponse> {
    const scope = await this.authorize(sessionId, jobId);
    const parsed = practiceFeedCommandV1.safeParse(raw);
    if (!parsed.success) throw new PracticeFeedApplicationError("INVALID_COMMAND");
    return practiceFeedResponseV1.parse(await this.repository.command(scope.auth.context, { membershipId: scope.auth.membershipId, identityUserId: scope.auth.identityUserId }, scope.auth.digest, scope.jobId, parsed.data));
  }
}
