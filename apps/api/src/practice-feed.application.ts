import type { Pool } from "pg";
import { z } from "zod";
import {
  DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, PracticeFeedRepository, verifiedTenantContextFromMembership,
  type PracticeFeedActor,
} from "@jobguard/db";
import { practiceFeedCommandV1, practiceFeedQueryV1, practiceFeedResponseV1, type PracticeFeedResponse } from "./practice-feed.contracts.js";

export class PracticeFeedApplicationError extends Error {
  constructor(readonly code: "UNAUTHENTICATED" | "INVALID_QUERY" | "INVALID_COMMAND" | "NOT_FOUND" | "SYNTHETIC_ONLY") { super(code); }
}

type PracticeFeedStore = Pick<PracticeFeedRepository, "view" | "command">;
const identifier = z.string().uuid();
// Existing synthetic principal bridge: no client-selected identity or tenant. The repository re-verifies the live membership.
const membership = { identityUserId: DEMO_IDENTITY_USER_ID, membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID };
const actor: PracticeFeedActor = { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID };
const context = () => verifiedTenantContextFromMembership(membership as Parameters<typeof verifiedTenantContextFromMembership>[0]);

/** One application for both transports (Nest and the in-process Next route handlers). */
export class PracticeFeedApplication {
  private readonly repository: PracticeFeedStore;
  constructor(pool: Pool, repository?: PracticeFeedStore) {
    this.repository = repository ?? new PracticeFeedRepository(pool, process.env.JOBGUARD_ENV ?? "unconfigured");
  }

  private authorize(sessionId: string | undefined, jobId: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PracticeFeedApplicationError("SYNTHETIC_ONLY");
    if (!identifier.safeParse(sessionId).success) throw new PracticeFeedApplicationError("UNAUTHENTICATED");
    const job = identifier.safeParse(jobId);
    if (!job.success) throw new PracticeFeedApplicationError("NOT_FOUND");
    return { sessionId: sessionId!, jobId: job.data };
  }

  async view(sessionId: string | undefined, jobId: unknown, rawQuery: unknown = { version: "practice-feed-query.v1" }): Promise<PracticeFeedResponse> {
    const scope = this.authorize(sessionId, jobId);
    const parsed = practiceFeedQueryV1.safeParse(rawQuery);
    if (!parsed.success) throw new PracticeFeedApplicationError("INVALID_QUERY");
    return practiceFeedResponseV1.parse(await this.repository.view(context(), actor, scope.sessionId, scope.jobId, parsed.data));
  }

  async command(sessionId: string | undefined, jobId: unknown, raw: unknown): Promise<PracticeFeedResponse> {
    const scope = this.authorize(sessionId, jobId);
    const parsed = practiceFeedCommandV1.safeParse(raw);
    if (!parsed.success) throw new PracticeFeedApplicationError("INVALID_COMMAND");
    return practiceFeedResponseV1.parse(await this.repository.command(context(), actor, scope.sessionId, scope.jobId, parsed.data));
  }
}
