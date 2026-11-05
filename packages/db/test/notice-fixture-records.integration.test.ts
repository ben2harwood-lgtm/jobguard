import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONSTRUCTION_NOTICE_WATERMARK, CONSTRUCTION_NOTICES_ENABLED, assertRealConstructionNoticeAllowed } from "@jobguard/core";
import { NoticeFixtureRepository } from "../src/notice-fixture-repository.js";
import { closeWorkFixture, createWorkFixture, seedWorkJob, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";

describe("M4-19 append-only durable synthetic notice book (real PostgreSQL)", () => {
  let f: WorkFixture;
  beforeAll(async () => { f = await createWorkFixture(); }, 240000);
  afterAll(async () => { await closeWorkFixture(f); });
  async function fixture() {
    const a = await meterCompany(f), n = randomUUID(), repo = new NoticeFixtureRepository(f.runtime);
    const actor = { kind: "human" as const, sessionDigest: a.digest };
    const command = (kind: string, data: unknown, extra = {}) => ({ version: "notice.fixture-record-command.v1", commandId: randomUUID(), jobId: a.jobId, noticeId: n, kind, data, ...extra });
    const revision = (extra = {}) => command("revision", { version: "notice.input.v1", environment: "synthetic", revision: 1, previousRevisionId: null,
      revisionId: randomUUID(), profileId: "fixture-calendar", profileVersion: 1, recipientReference: "fictional-recipient-A", serviceMethod: "fixture_email",
      facts: { dueDate: "2026-11-10", contractReference: "fictional-contract", triggerEvidenceId: randomUUID() }, ...extra });
    const decision = (rev: any, extra = {}) => command("decision", { id: randomUUID(), noticeRevisionId: rev.data.revisionId, resolution: "approved", expiresAt: new Date(Date.now() + 3600000).toISOString(), ...extra });
    const event = (rev: any, d: any, extra = {}) => command("service_event", { id: randomUUID(), noticeRevisionId: rev.data.revisionId, decisionId: d.data.id,
      state: "queued", providerReference: null, evidenceId: null, legalAssessmentReference: null, ...extra });
    const send = (raw: unknown) => repo.command(a.context, actor, raw);
    const read = () => new NoticeFixtureRepository(f.runtime).read(a.context, a.jobId, n);
    return { a, n, repo, actor, command, revision, decision, event, send, read };
  }
  it("reports a real PostgreSQL query fault as unavailable, not a missing notice", async () => {
    const x = await fixture();
    const faultPool = { async connect() {
      const client = await f.runtime.connect();
      return { release: () => client.release(), query: (sql: string, args?: unknown[]) =>
        client.query(sql.includes("app.notice_fixture_records") ? "SELECT 1/0" : sql,
          sql.includes("app.notice_fixture_records") ? [] : args) };
    } } as unknown as Pool;
    const repo = new NoticeFixtureRepository(faultPool);
    await expect(repo.read(x.a.context, x.a.jobId, x.n)).rejects.toMatchObject({ code: "NOTICE_UNAVAILABLE" });
    await expect(repo.command(x.a.context, x.actor, x.revision())).rejects.toMatchObject({ code: "NOTICE_UNAVAILABLE" });
    await expect(x.read()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("persists exact revisions, serializes competing extensions and refuses mutation even by the owner", async () => {
    const x = await fixture(), rev = x.revision(); await x.send(rev);
    const changes = { revision: 2, previousRevisionId: rev.data.revisionId, recipientReference: "fictional-B", serviceMethod: "fixture_hand_delivery" };
    const results = await Promise.allSettled([x.send(x.revision(changes)), x.send(x.revision(changes))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const view = await x.read();
    expect(view.history.revisions).toHaveLength(2);
    expect(view.history.revisions[0]).toMatchObject(rev.data);
    expect(view.history.revisions[1]).toMatchObject(changes);
    for (const sql of ["UPDATE app.notice_fixture_record SET record='{}' WHERE tenant_id=$1", "DELETE FROM app.notice_fixture_record WHERE tenant_id=$1"]) {
      await expect(f.admin.query(sql, [x.a.tenantId])).rejects.toMatchObject({ code: "55000" });
    }
    await expect(f.admin.query("TRUNCATE app.notice_fixture_record")).rejects.toMatchObject({ code: "55000" });
  });
  it("deduplicates concurrent commands and rejects changed replays and duplicate revision identities", async () => {
    const x = await fixture(), rev = x.revision();
    const [one, two] = await Promise.all([x.send(rev), x.send(rev)]);
    expect(one).toEqual(two); expect((await x.read()).records).toHaveLength(1);
    await expect(x.send({ ...rev, data: { ...rev.data, recipientReference: "changed" } })).rejects.toMatchObject({ code: "REPLAY_CONFLICT" });
    await expect(x.send({ ...rev, commandId: randomUUID() })).rejects.toMatchObject({ code: "REPLAY_CONFLICT" });
  });
  it("retains each distinct service fact bound to the stored session decision without sending anything", async () => {
    const x = await fixture(), rev = x.revision(); await x.send(rev);
    const d = x.decision(rev); await x.send(d);
    const before = (await f.admin.query("SELECT count(*)::int n FROM app.action_outbox")).rows[0].n;
    const queued = x.event(rev, d); await x.send(queued); expect(await x.send(queued)).toMatchObject({ kind: "service_event" });
    for (const state of ["provider_accepted", "outcome_unknown", "read"]) await x.send(x.event(rev, d, { state, evidenceId: randomUUID(), providerReference: "fictional-provider" }));
    await expect(x.send(x.event(rev, d, { state: "legally_served", evidenceId: randomUUID() }))).rejects.toMatchObject({ code: "INVALID_SERVICE_STATE" });
    await x.send(x.event(rev, d, { state: "legally_served", evidenceId: randomUUID(), legalAssessmentReference: "fictional-assessor" }));
    const view = await x.read();
    expect(view.serviceBook.events.map(e => e.state)).toEqual(["queued", "provider_accepted", "outcome_unknown", "read", "legally_served"]);
    expect(view.serviceBook.decision).toMatchObject({ actorKind: "human", actorId: x.a.actorId });
    expect(view.serviceBook.decision?.approvedPreview).toBe(JSON.stringify(view.preview));
    expect(view.records.every(r => r.environment === "synthetic" && r.watermark === CONSTRUCTION_NOTICE_WATERMARK)).toBe(true);
    expect(view).toMatchObject({ environment: "synthetic", watermark: CONSTRUCTION_NOTICE_WATERMARK, realSendEnabled: false });
    expect((await f.admin.query("SELECT count(*)::int n FROM app.action_outbox")).rows[0].n).toBe(before);
    expect((await f.admin.query("SELECT DISTINCT kind FROM app.notice_fixture_record WHERE tenant_id=$1", [x.a.tenantId])).rows.map(r => r.kind).sort()).toEqual(["decision", "revision", "service_event"]);
    expect(CONSTRUCTION_NOTICES_ENABLED).toBe(false); expect(assertRealConstructionNoticeAllowed).toThrow();
  });
  it("refuses stale, revoked, expired and foreign decisions and forged actors", async () => {
    const x = await fixture(), rev = x.revision(); await x.send(rev);
    await expect(x.send(x.decision(rev, { expiresAt: new Date(Date.now() - 1000).toISOString() }))).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    const d = x.decision(rev); await x.send(d);
    await x.send(x.decision(rev, { ...d.data, resolution: "revoked" }));
    await expect(x.send(x.event(rev, d))).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    await expect(x.send(x.decision(rev, { ...d.data, resolution: "approved" }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const approved = x.decision(rev); await x.send(approved);
    await x.send(x.revision({ revision: 2, previousRevisionId: rev.data.revisionId }));
    await expect(x.send(x.event(rev, approved))).rejects.toThrow();
    await expect(x.send(x.event(rev, x.decision(rev)))).rejects.toThrow();
    await expect(x.send(x.decision(rev))).rejects.toMatchObject({ code: "STALE_REVISION" });
    await expect(x.repo.command(x.a.context, { ...x.actor, kind: "worker" } as any, x.revision())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    for (const extra of [{ tenantId: randomUUID() }, { actorId: randomUUID() }, { enabled: true }]) await expect(x.send({ ...x.revision(), ...extra })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const y = await fixture(); await expect(x.repo.command(x.a.context, y.actor, x.revision())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [x.a.sessionId]);
    await expect(x.send(x.revision())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("refuses an approval that expires between storage and service", async () => {
    const x = await fixture(), rev = x.revision(); await x.send(rev);
    const d = x.decision(rev, { expiresAt: new Date(Date.now() + 2000).toISOString() }); await x.send(d);
    await f.admin.query("SELECT pg_sleep(2.1)");
    await expect(x.send(x.event(rev, d))).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  });
  it("returns identical not-found for foreign tenant and wrong job, and refuses direct runtime access", async () => {
    const x = await fixture(), y = await fixture(), rev = x.revision(); await x.send(rev);
    const otherJob = await seedWorkJob(f, x.a.tenantId);
    for (const [ctx, job] of [[y.a.context, x.a.jobId], [x.a.context, otherJob.jobId], [x.a.context, randomUUID()]] as const) {
      await expect(x.repo.read(ctx, job, x.n)).rejects.toMatchObject({ code: "NOT_FOUND", message: "NOT_FOUND" });
    }
    await expect(x.repo.read(x.a.context, x.a.jobId, randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND", message: "NOT_FOUND" });
    for (const sql of ["SELECT * FROM app.notice_fixture_record", "UPDATE app.notice_fixture_record SET record='{}'", "DELETE FROM app.notice_fixture_record"]) {
      await expect(workTenant(f.runtime, x.a.tenantId, db => db.query(sql))).rejects.toMatchObject({ code: "42501" });
    }
    const policy = (await f.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.notice_fixture_record'::regclass")).rows[0];
    expect(policy).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    await workTenant(f.admin, y.a.tenantId, async db => {
      await db.query("SET LOCAL ROLE jobguard_migration");
      expect((await db.query("SELECT * FROM app.notice_fixture_record WHERE notice_id=$1", [x.n])).rows).toEqual([]);
    });
    await workTenant(f.runtime, x.a.tenantId, async db => {
      await db.query("SELECT app.notice_fixture_records($1,$2,NULL,'read','{}')", [x.a.jobId, x.n]);
      expect((await db.query("SELECT current_setting('app.tenant_id') t")).rows[0].t).toBe(x.a.tenantId);
    });
  });
});
