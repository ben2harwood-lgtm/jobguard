import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import {
  appendRetentionRecord, reconcileRetentionBook, retentionBookV1, retentionRecordV1,
  retentionProfileV1, retentionReviewV1, retentionResolutionV1, retentionReleaseV1,
  retentionReceiptV1, retentionReversalV1, RetentionError, RETENTION_REVIEW_OWNER,
} from "@jobguard/core";
import { verifiedTenantContextForQueuedJob, withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const id = z.guid().transform(value => value.toLowerCase());
const omitted = { id: true, tenantId: true, jobId: true } as const;
const term = retentionProfileV1.shape.conditions.element;
const inputSource = z.union([term.shape.source.options[0], term.shape.source.options[1].omit({ actorId: true })]);
const recordInput = z.discriminatedUnion("version", [
  retentionProfileV1.omit(omitted).extend({ conditions: z.array(term.extend({ source: inputSource, dateSource: inputSource })).min(1).max(20) }),
  retentionReviewV1.omit(omitted).extend({ trigger: z.literal("human") }),
  retentionResolutionV1.omit(omitted).extend({ humanSource: retentionResolutionV1.shape.humanSource.omit({ actorId: true }) }),
  retentionReleaseV1.omit(omitted), retentionReceiptV1.omit(omitted), retentionReversalV1.omit(omitted),
]);
const commandV1 = z.object({ version: z.literal("retention-record-command.v1"), commandId: id, jobId: id, record: recordInput }).strict();
const actorV1 = z.object({ sessionDigest: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
const preparedV1 = z.object({ actorId: id.nullable(), records: z.array(retentionRecordV1), bookHash: z.string().regex(/^[a-f0-9]{64}$/u), today: z.iso.date() }).strict();
export class RetentionRecordRepositoryError extends Error {
  constructor(public readonly code: "INVALID_RETENTION_INPUT" | "RETENTION_NOT_FOUND" | "RETENTION_CONFLICT" | "RETENTION_DARK" | "RETENTION_UNAVAILABLE" | "RETENTION_FORBIDDEN" | "RETENTION_UNAUTHENTICATED") {
    super(code); this.name = "RetentionRecordRepositoryError";
  }
}
/** Dark synthetic persistence boundary. Core is the sole retention rule engine;
 * prepare, validate and append share one transaction and one job-book lock.
 * The session digest belongs to the authenticated caller, never raw command input.
 */
export class RetentionRecordRepository {
  constructor(private readonly pool: Pool) {}
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) {
      if (error instanceof RetentionError || error instanceof RetentionRecordRepositoryError) throw error;
      if ((error as { code?: string } | null)?.code === "23505") throw new RetentionRecordRepositoryError("RETENTION_CONFLICT");
      if (error instanceof z.ZodError) throw new RetentionRecordRepositoryError("RETENTION_CONFLICT");
      const message = error instanceof Error ? error.message : "";
      if (message === "JOB_NOT_LIVE") throw new RetentionRecordRepositoryError("RETENTION_CONFLICT");
      if (message === "METER_FORBIDDEN") throw new RetentionRecordRepositoryError("RETENTION_FORBIDDEN");
      if (message === "RETENTION_UNAUTHENTICATED") throw new RetentionRecordRepositoryError("RETENTION_UNAUTHENTICATED");
      if (["RETENTION_NOT_FOUND", "RETENTION_CONFLICT", "RETENTION_DARK"].includes(message)) {
        throw new RetentionRecordRepositoryError(message as "RETENTION_NOT_FOUND" | "RETENTION_CONFLICT" | "RETENTION_DARK");
      }
      throw new RetentionRecordRepositoryError("RETENTION_UNAVAILABLE");
    }
  }
  /** Infrastructure-only timer port: no actor, arbitrary record or date input. */
  async raiseTimerReviews(context: VerifiedTenantContext, onRefused: (refusal: { jobId: string; code: string }) => void = () => {}) {
    // Ben's 6 Nov 2026 router-chat "yes": this named sessionless port only.
    // Sessionless by design: the infrastructure timer login cannot bind a human session.
    // Hold: the break-glass identity design goes to Ben before real data.
    const scoped = verifiedTenantContextForQueuedJob(context.tenantId);
    const jobs = await this.guarded(() => withTenant(this.pool, scoped, async db =>
      z.array(id).parse((await db.$client.query(
        "SELECT app.retention_timer($1,NULL,NULL,NULL) result", [context.tenantId],
      )).rows[0]?.result)));
    let appended = 0, refused = 0;
    for (const jobId of jobs) {
     try { appended += await this.guarded(() => withTenant(this.pool, scoped, async db => {
      const invoke = async (record: unknown, expected: string | null) => (await db.$client.query(
        "SELECT app.retention_timer($1,$2,$3::jsonb,$4) result",
        [context.tenantId, jobId, record === null ? null : JSON.stringify(record), expected],
      )).rows[0]?.result;
      let stored = preparedV1.parse(await invoke(null, null));
      let book = retentionBookV1.parse({ version: "retention.book.v1", environment: "synthetic", tenantId: context.tenantId, jobId, records: stored.records });
      reconcileRetentionBook(book); // Reject altered histories even when there is nothing due.
      const profile = book.records.findLast(row => row.version === "retention.profile.v1");
      if (!profile || profile.version !== "retention.profile.v1") return 0;
      let count = 0;
      for (const condition of profile.conditions) {
        if (book.records.some(row => row.version === "retention.review.v1" && row.profileId === profile.id && row.conditionId === condition.id)) continue;
        const record = retentionReviewV1.parse({ version: "retention.review.v1", id: randomUUID(), tenantId: context.tenantId, jobId,
          profileId: profile.id, conditionId: condition.id, owner: RETENTION_REVIEW_OWNER, trigger: "timer", raisedOn: stored.today });
        try { book = appendRetentionRecord(book, record); }
        catch (error) {
          if (error instanceof RetentionError && error.code === "CONDITION_UNMET") continue;
          throw error;
        }
        stored = preparedV1.parse(await invoke(record, stored.bookHash));
        count++;
      }
      return count;
    }));
     } catch (error) {
      if (!(error instanceof RetentionError || error instanceof RetentionRecordRepositoryError)
        || (error instanceof RetentionRecordRepositoryError && !["RETENTION_CONFLICT", "RETENTION_NOT_FOUND"].includes(error.code))) throw error;
      refused++;
      onRefused({ jobId, code: error.code });
     }
    }
    return { appended, refused };
  }
  async read(context: VerifiedTenantContext, actor: { sessionDigest: string }, jobId: string) {
    const job = id.safeParse(jobId), session = actorV1.safeParse(actor);
    if (!job.success || !session.success) throw new RetentionRecordRepositoryError("INVALID_RETENTION_INPUT");
    return this.guarded(() => withTenant(this.pool, context, async db => {
      const stored = preparedV1.parse((await db.$client.query("SELECT app.retention_records($1,$2,$3,NULL,NULL,NULL) result", [context.tenantId, session.data.sessionDigest, job.data])).rows[0]?.result);
      const book = retentionBookV1.parse({ version: "retention.book.v1", environment: "synthetic", tenantId: context.tenantId, jobId: job.data, records: stored.records });
      return { book, reconciliation: reconcileRetentionBook(book) };
    }));
  }
  async command(context: VerifiedTenantContext, actor: { sessionDigest: string }, raw: unknown) {
    const parsed = commandV1.safeParse(raw), session = actorV1.safeParse(actor);
    if (!parsed.success || !session.success) throw new RetentionRecordRepositoryError("INVALID_RETENTION_INPUT");
    const input = parsed.data;
    return this.guarded(() => withTenant(this.pool, context, async db => {
      const invoke = async (record: unknown, expected: string | null) => (await db.$client.query(
        "SELECT app.retention_records($1,$2,$3,$4,$5::jsonb,$6) result",
        [context.tenantId, session.data.sessionDigest, input.jobId, input.commandId, record === null ? null : JSON.stringify(record), expected],
      )).rows[0]?.result;
      const stored = preparedV1.parse(await invoke(null, null));
      if (!stored.actorId) throw new RetentionRecordRepositoryError("RETENTION_NOT_FOUND");
      const stamp = (source: z.infer<typeof inputSource>) => source.kind === "human_input" ? { ...source, actorId: stored.actorId } : source;
      const prior = stored.records.find(row => row.id === input.commandId);
      const fields = input.record.version === "retention.review.v1"
        ? { ...input.record, raisedOn: prior?.version === "retention.review.v1" ? prior.raisedOn : stored.today }
        : input.record.version === "retention.profile.v1"
        ? { ...input.record, conditions: input.record.conditions.map(item => ({ ...item, source: stamp(item.source), dateSource: stamp(item.dateSource) })) }
        : input.record.version === "retention.resolution.v1"
          ? { ...input.record, humanSource: { ...input.record.humanSource, actorId: stored.actorId } } : input.record;
      const record = retentionRecordV1.parse({ ...fields, id: input.commandId, tenantId: context.tenantId, jobId: input.jobId });
      // Resolve lineage only inside this job's stored book. Foreign-tenant,
      // same-tenant/wrong-job and absent references share one not-found result.
      const references = ["previousProfileId", "profileId", "reviewId", "resolutionId", "releaseId", "receiptId"] as const;
      for (const key of references) {
        const reference = (record as unknown as Record<string, unknown>)[key];
        if (typeof reference === "string" && !stored.records.some(row => row.id === reference)) {
          throw new RetentionRecordRepositoryError("RETENTION_NOT_FOUND");
        }
      }
      const book = appendRetentionRecord({ version: "retention.book.v1", environment: "synthetic", tenantId: context.tenantId, jobId: input.jobId, records: stored.records }, record);
      await invoke(record, stored.bookHash);
      return { book, reconciliation: reconcileRetentionBook(book) };
    }));
  }
}
