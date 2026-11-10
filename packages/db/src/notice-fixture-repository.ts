import { isRequestBindingRefusal } from "./request-binding-error.js";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import {
  appendNoticeFixtureRevision, appendNoticeFixtureServiceEvent, CONSTRUCTION_NOTICE_WATERMARK,
  ConstructionNoticeError, noticeFixtureApprovalTarget, noticeFixtureDecisionV1, noticeInputV1,
  noticeServiceEventV1, previewConstructionNoticeFixture,
  type NoticeFixtureHistory, type NoticeFixtureServiceBook,
} from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { canonicalJson } from "./work-order-repository.js";

const id = z.guid().transform(value => value.toLowerCase());
const base = { version: z.literal("notice.fixture-record-command.v1"), commandId: id, jobId: id, noticeId: id };
const commandV1 = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("revision"), data: noticeInputV1.omit({ tenantId: true, jobId: true, noticeId: true }) }).strict(),
  z.object({ ...base, kind: z.literal("decision"), data: z.object({ id, noticeRevisionId: id,
    resolution: noticeFixtureDecisionV1.shape.resolution, expiresAt: noticeFixtureDecisionV1.shape.expiresAt }).strict() }).strict(),
  z.object({ ...base, kind: z.literal("service_event"), data: noticeServiceEventV1.omit({
    version: true, environment: true, tenantId: true, jobId: true, recordedAt: true,
  }) }).strict(),
]);
const actorV1 = z.object({ kind: z.literal("human"), sessionDigest: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
/** Server session credential, supplied by the caller separately from the untrusted command. */
export type NoticeFixtureActor = z.infer<typeof actorV1>;
const recordV1 = z.object({ sequence: z.number().int().positive(), commandId: id, actorId: id,
  kind: z.enum(["revision", "decision", "service_event"]), record: z.unknown(),
  recordHash: z.string().regex(/^[a-f0-9]{64}$/u), environment: z.literal("synthetic"),
  watermark: z.literal(CONSTRUCTION_NOTICE_WATERMARK),
}).strict();
type StoredRecord = z.infer<typeof recordV1>;
const hash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const emptyBook = (): NoticeFixtureServiceBook => ({ version: "notice.fixture-service-book.v1", decision: null, events: [] });
function invalid(message = "Invalid notice fixture record"): never { throw new ConstructionNoticeError("INVALID_INPUT", message); }
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) invalid();
  return result.data;
}

/** Rebuild from immutable facts in order. Old books are validated at their own
 * revision/decision, not reinterpreted under a later revision or revocation. */
function project(tenantId: string, jobId: string, noticeId: string, raw: unknown) {
  const records = parse(z.array(recordV1), raw);
  let history: NoticeFixtureHistory = { version: "notice.history.v1", environment: "synthetic", tenantId, jobId, noticeId, revisions: [] };
  const decisions = new Map<string, z.infer<typeof noticeFixtureDecisionV1>>();
  const books = new Map<string, NoticeFixtureServiceBook>();
  for (const [index, row] of records.entries()) {
    if (row.sequence !== index + 1 || hash(row.record) !== row.recordHash) invalid("Altered notice fixture record");
    if (row.kind === "revision") history = appendNoticeFixtureRevision(history, row.record);
    else if (row.kind === "decision") {
      const decision = parse(noticeFixtureDecisionV1, row.record);
      if (decision.tenantId !== tenantId || decision.jobId !== jobId || decision.actorId !== row.actorId
        || decision.approvedPreview !== noticeFixtureApprovalTarget(history)) invalid("Altered notice fixture decision");
      const prior = decisions.get(decision.id);
      if (prior && (!["revoked", "superseded"].includes(decision.resolution)
        || prior.resolution !== "approved" || canonicalJson({ ...decision, resolution: prior.resolution }) !== canonicalJson(prior))) {
        invalid("A recorded approval can only be revoked or superseded");
      }
      decisions.set(decision.id, decision);
    } else {
      const event = parse(noticeServiceEventV1, row.record), decision = decisions.get(event.decisionId);
      const key = `${event.noticeRevisionId}:${event.decisionId}`;
      books.set(key, appendNoticeFixtureServiceEvent(history, decision, books.get(key) ?? emptyBook(), event));
    }
  }
  const currentRevision = history.revisions.at(-1)?.revisionId;
  return { version: "notice.fixture-records.v1" as const, environment: "synthetic" as const,
    watermark: CONSTRUCTION_NOTICE_WATERMARK, records, history,
    preview: history.revisions.length ? previewConstructionNoticeFixture(history) : null,
    serviceBook: [...books.values()].filter(book => book.events[0]?.noticeRevisionId === currentRevision).at(-1) ?? emptyBook(),
    serviceBooks: [...books.values()], decisions: [...decisions.values()], realSendEnabled: false as const };
}

/** Dark persistence only. One transaction holds the notice lock across load,
 * core validation and append. SQL rechecks session, sequence and stored bindings. */
export class NoticeFixtureRepository {
  constructor(private readonly pool: Pool) {}
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) {
      if (error instanceof ConstructionNoticeError) throw error;
      const message = error instanceof Error ? error.message : "";
      if (error instanceof Error && "code" in error && error.code === "P0001"
        && ["STALE_REVISION", "REPLAY_CONFLICT", "APPROVAL_REQUIRED", "INVALID_SERVICE_STATE", "INVALID_INPUT"].includes(message)) {
        throw new ConstructionNoticeError(message as ConstructionNoticeError["code"], message);
      }
      // Keep the routine's scope refusal and its session helper's explicit
      // authority refusal indistinguishable. Other SQL faults are unknown.
      const notFound = isRequestBindingRefusal(error) || error instanceof Error && "code" in error
        && ((message === "NOT_FOUND" && error.code === "P0002")
          || (message === "METER_FORBIDDEN" && error.code === "42501"));
      throw new NoticeFixtureRepositoryError(notFound ? "NOT_FOUND" : "NOTICE_UNAVAILABLE");
    }
  }
  async read(context: VerifiedTenantContext, jobId: string, noticeId: string) {
    const j = parse(id, jobId), n = parse(id, noticeId);
    return this.guarded(() => withTenant(this.pool, context, async db => {
      const result = (await db.$client.query("SELECT app.notice_fixture_records($1,$2,NULL,'read','{}'::jsonb) result", [j, n])).rows[0]!.result;
      return project(context.tenantId, j, n, result.records);
    }));
  }
  async command(context: VerifiedTenantContext, actor: NoticeFixtureActor, raw: unknown) {
    const input = parse(commandV1, raw), session = parse(actorV1, actor);
    return this.guarded(() => withTenant(this.pool, context, async db => {
      const call = async (operation: string, value: unknown) => (await db.$client.query(
        "SELECT app.notice_fixture_records($1,$2,$3,$4,$5::jsonb) result",
        [input.jobId, input.noticeId, session.sessionDigest, operation, JSON.stringify(value)])).rows[0]!.result;
      const loaded = await call("prepare", input);
      const view = project(context.tenantId, input.jobId, input.noticeId, loaded.records);
      if (loaded.replay) return loaded.replay as StoredRecord;
      const scope = { tenantId: context.tenantId, jobId: input.jobId };
      let record: unknown;
      if (input.kind === "revision") {
        record = appendNoticeFixtureRevision(view.history, { ...input.data, ...scope, noticeId: input.noticeId }).revisions.at(-1)!;
        if (view.history.revisions.some(r => r.revisionId === (record as { revisionId: string }).revisionId)) {
          throw new ConstructionNoticeError("REPLAY_CONFLICT", "Revision already recorded by another command");
        }
      } else if (input.kind === "decision") {
        if (input.data.noticeRevisionId !== view.history.revisions.at(-1)?.revisionId) {
          throw new ConstructionNoticeError("STALE_REVISION", "Decision must target the current revision");
        }
        const prior = view.decisions.find(d => d.id === input.data.id);
        record = prior ? { ...prior, resolution: input.data.resolution } : {
          version: "notice.fixture-decision.v1", environment: "synthetic", ...scope,
          id: input.data.id, action: "notice.fixture_service", actorKind: "human", actorId: loaded.actorId,
          resolution: input.data.resolution, approvedPreview: noticeFixtureApprovalTarget(view.history),
          decidedAt: loaded.now, expiresAt: input.data.expiresAt,
        };
        parse(noticeFixtureDecisionV1, record);
        if (Date.parse(input.data.expiresAt) <= Date.parse(loaded.now)) {
          throw new ConstructionNoticeError("APPROVAL_REQUIRED", "Decision expiry must be in the future");
        }
      } else {
        const event = { ...input.data, version: "notice.fixture-service-event.v1", environment: "synthetic", ...scope, recordedAt: loaded.now };
        const decision = view.decisions.find(d => d.id === event.decisionId);
        const book = view.serviceBooks.find(b => b.events[0]?.noticeRevisionId === event.noticeRevisionId && b.decision?.id === event.decisionId) ?? emptyBook();
        record = appendNoticeFixtureServiceEvent(view.history, decision, book, event).events.at(-1)!;
        if (book.events.some(e => e.id === event.id)) throw new ConstructionNoticeError("REPLAY_CONFLICT", "Event already recorded");
      }
      const next: StoredRecord = { sequence: view.records.length + 1, commandId: input.commandId, actorId: loaded.actorId,
        kind: input.kind, record, recordHash: hash(record), environment: "synthetic", watermark: CONSTRUCTION_NOTICE_WATERMARK };
      project(context.tenantId, input.jobId, input.noticeId, [...view.records, next]);
      return parse(recordV1, await call("append", { input, next, canonicalRecord: canonicalJson(record) }));
    }));
  }
}
export class NoticeFixtureRepositoryError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "NOTICE_UNAVAILABLE") { super(code); this.name = "NoticeFixtureRepositoryError"; }
}
