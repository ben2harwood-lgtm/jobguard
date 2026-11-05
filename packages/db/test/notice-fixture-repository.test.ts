import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { assertRealConstructionNoticeAllowed, CONSTRUCTION_NOTICES_ENABLED, CONSTRUCTION_NOTICE_WATERMARK } from "@jobguard/core";
import { NoticeFixtureRepository } from "../src/notice-fixture-repository.js";
import { canonicalJson } from "../src/work-order-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

// Protocol double only. PostgreSQL locking, grants, RLS and durable replay have
// separate real-database tests; this double does not claim to prove them.
function fixture() {
  const tenantId = randomUUID(), jobId = randomUUID(), noticeId = randomUUID(), actorId = randomUUID();
  let records: any[] = [];
  const calls: string[] = [];
  const now = "2026-11-04T10:00:00.000Z";
  const client = { release() {}, async query(sql: string, args?: any[]) {
    calls.push(sql);
    if (!sql.includes("app.notice_fixture_records")) return { rows: [] };
    const op = sql.includes("NULL,'read'") ? "read" : args![3];
    if (op === "read") return { rows: [{ result: { records } }] };
    const v = JSON.parse(args![4]);
    if (op === "prepare") return { rows: [{ result: { records, actorId, now } }] };
    records.push(v.next); return { rows: [{ result: v.next }] };
  } };
  const pool = { async connect() { return client; } } as unknown as Pool;
  const context = testTenantContext(tenantId), actor = { kind: "human" as const, sessionDigest: "a".repeat(64) };
  const repo = new NoticeFixtureRepository(pool);
  const command = (kind: string, data: unknown, extra = {}) => ({ version: "notice.fixture-record-command.v1", commandId: randomUUID(), jobId, noticeId, kind, data, ...extra });
  const revision = (extra = {}) => command("revision", { version: "notice.input.v1", environment: "synthetic", revision: 1, previousRevisionId: null,
    revisionId: randomUUID(), profileId: "fixture-calendar", profileVersion: 1, recipientReference: "fictional-recipient-A",
    serviceMethod: "fixture_email", facts: { dueDate: "2026-11-10", contractReference: "fictional-A", triggerEvidenceId: randomUUID() }, ...extra });
  const send = (raw: unknown) => repo.command(context, actor, raw);
  const decision = (rev: any, extra = {}) => command("decision", { id: randomUUID(), noticeRevisionId: rev.data.revisionId,
    resolution: "approved", expiresAt: "2026-11-04T11:00:00.000Z", ...extra });
  const event = (rev: any, approval: any, extra = {}) => command("service_event", { id: randomUUID(), noticeRevisionId: rev.data.revisionId,
    decisionId: approval.data.id, state: "queued", providerReference: null, evidenceId: null, legalAssessmentReference: null, ...extra });
  return { repo, context, actor, actorId, jobId, noticeId, calls, revision, decision, event, send, command,
    records: () => records, replace: (value: any[]) => { records = value; } };
}

describe("dark notice fixture repository protocol and core rules", () => {
  it("binds exact stored facts and session actor, recreates views, and never enqueues or sends", async () => {
    const f = fixture(), rev = f.revision(); await f.send(rev);
    const approval = f.decision(rev); const stored = await f.send(approval);
    expect(stored.record).toMatchObject({ actorKind: "human", actorId: f.actorId });
    for (const state of ["queued", "provider_accepted", "outcome_unknown", "read", "legally_served"]) {
      await f.send(f.event(rev, approval, { state, ...(state !== "queued" ? { evidenceId: randomUUID(), providerReference: "fictional-provider", legalAssessmentReference: "fictional-assessment" } : {}) }));
    }
    const view = await f.repo.read(f.context, f.jobId, f.noticeId);
    expect(view.serviceBook.events.map(e => e.state)).toEqual(["queued", "provider_accepted", "outcome_unknown", "read", "legally_served"]);
    expect(view.records.every(r => r.environment === "synthetic" && r.watermark === CONSTRUCTION_NOTICE_WATERMARK)).toBe(true);
    expect(view).toMatchObject({ environment: "synthetic", watermark: CONSTRUCTION_NOTICE_WATERMARK, realSendEnabled: false });
    expect(f.calls.every(sql => !/outbox|INSERT|provider\./u.test(sql))).toBe(true);
    expect(CONSTRUCTION_NOTICES_ENABLED).toBe(false);
    expect(assertRealConstructionNoticeAllowed).toThrow("Real notice generation and sending are disabled");
  });
  it("preserves old revisions and rejects branching, duplicate identity and forged boundaries", async () => {
    const f = fixture(), rev = f.revision(); await f.send(rev);
    for (const extra of [{ tenantId: randomUUID() }, { actor: "human" }, { enabled: true }]) {
      await expect(f.send({ ...rev, ...extra })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    await expect(f.repo.command(f.context, { kind: "worker", sessionDigest: "a".repeat(64) } as any, rev)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(f.send(f.revision())).rejects.toMatchObject({ code: "STALE_REVISION" });
    await expect(f.send({ ...rev, commandId: randomUUID() })).rejects.toMatchObject({ code: "REPLAY_CONFLICT" });
    const next = f.revision({ revision: 2, previousRevisionId: rev.data.revisionId, recipientReference: "fictional-recipient-B" });
    await f.send(next);
    expect((await f.repo.read(f.context, f.jobId, f.noticeId)).history.revisions).toEqual([
      expect.objectContaining({ recipientReference: "fictional-recipient-A", revision: 1 }),
      expect.objectContaining({ recipientReference: "fictional-recipient-B", revision: 2 }),
    ]);
  });
  it("refuses stale, expired, revoked and forged human approvals and missing legal assessment", async () => {
    const f = fixture(), rev = f.revision(); await f.send(rev);
    await expect(f.send(f.decision(rev, { expiresAt: "2026-11-04T09:00:00.000Z" }))).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    const approval = f.decision(rev); await f.send(approval);
    await expect(f.send(f.command("decision", { ...approval.data, actorId: randomUUID() }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await f.send(f.event(rev, approval));
    await expect(f.send(f.event(rev, approval, { state: "legally_served", evidenceId: randomUUID() }))).rejects.toMatchObject({ code: "INVALID_SERVICE_STATE" });
    await f.send(f.decision(rev, { ...approval.data, resolution: "revoked" }));
    await expect(f.send(f.event(rev, approval, { state: "read", evidenceId: randomUUID(), providerReference: "fictional" }))).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    await expect(f.send(f.decision(rev, { ...approval.data, resolution: "approved" }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await f.send(f.revision({ revision: 2, previousRevisionId: rev.data.revisionId }));
    await expect(f.send(f.decision(rev))).rejects.toMatchObject({ code: "STALE_REVISION" });
    await expect(f.send(f.event(rev, approval))).rejects.toThrow();
  });
  it("rejects altered persisted records, including rehashed cross-tenant facts", async () => {
    const f = fixture(); await f.send(f.revision());
    const original = structuredClone(f.records());
    f.records()[0].record.recipientReference = "altered";
    await expect(f.repo.read(f.context, f.jobId, f.noticeId)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    f.replace(original);
    f.records()[0].record.tenantId = randomUUID();
    f.records()[0].recordHash = createHash("sha256").update(canonicalJson(f.records()[0].record)).digest("hex");
    await expect(f.repo.read(f.context, f.jobId, f.noticeId)).rejects.toMatchObject({ code: "CONTEXT_MISMATCH" });
  });
});
