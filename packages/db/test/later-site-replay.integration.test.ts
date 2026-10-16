// LATER-B10: written before the implementation. Real PostgreSQL; CI runs this file.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { siteExtraFailureV1, siteExtraHttpStatus, siteVisitFailureV1, siteVisitHttpStatus } from "@jobguard/core";
import { SiteExtraRepository, SiteVisitRepository, withTenant } from "../src/index.js";
import { readReplay } from "../src/site-extra-pricing-queries.js";
import { input, counts, command } from "./site-extra-fixtures.js";
import { sorInput, written } from "./site-extra-pricing-fixtures.js";
import { photo, shownFor } from "./site-extra-evidence-fixtures.js";
import { cluster, visitFixture, startInput, completeInput, moveOffLive, snapshot, chain, type Cluster } from "./site-visit-fixtures.js";

vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 });
let c: Cluster, extras: SiteExtraRepository, visits: SiteVisitRepository;
beforeAll(async () => { c = await cluster(); extras = new SiteExtraRepository(c.runtime); visits = new SiteVisitRepository(c.runtime); });
afterAll(async () => { await c?.close(); });
const auditCount = async (tenant: string) => (await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [tenant])).rows[0]!.n;
const failure = async (run: Promise<unknown>) => run.then(() => { throw new Error("unexpected success"); }, (error: { code: string }) => error);

describe("LATER-B10 site replay and pricing consistency", () => {
  it("[L034] pricing projection cannot mix receipt and revision snapshots with an intervening writer", async () => {
    const f = await visitFixture(c), actor = f.members.operative.member, raw = sorInput(f.jobId);
    let wrote = false;
    const before = await withTenant(c.runtime, f.ctx, async db => {
      const query = db.$client.query.bind(db.$client);
      // Run real SQL first, then commit the writer before the reader can issue another statement.
      const spy = vi.spyOn(db.$client, "query").mockImplementation((async (...args: any[]) => {
        const result = await (query as any)(...args);
        if (!wrote && typeof args[0] === "string" && args[0].includes("app.extra_sor_revision")) {
          wrote = true;
          await extras.logSorSiteExtra(f.ctx, actor, raw);
        }
        return result;
      }) as typeof db.$client.query);
      try { return await readReplay(db, f.p.tenantId, raw.commandId); } finally { spy.mockRestore(); }
    });
    expect(wrote).toBe(true);
    expect(before).toEqual({ receiptExists: false });
    const after = await withTenant(c.runtime, f.ctx, db => readReplay(db, f.p.tenantId, raw.commandId));
    expect(after).toMatchObject({ receiptExists: true, revision: { jobId: f.jobId, raisingMembershipId: actor.membershipId } });
    expect(await written(c, f.p.tenantId)).toMatchObject({ extra_origin: 1, extra_sor_revision: 1 });
  });

  it.each(["plain", "photo-confirmation"] as const)("[L035] exact prior command replays after visit closes (%s); changed and fresh commands refuse", async kind => {
    const f = await visitFixture(c), actor = f.members.operative.member;
    const open = await visits.startVisit(f.ctx, actor, startInput(f));
    const evidence = kind === "photo-confirmation" ? await photo(c, f) : null;
    const raw = { ...input(f), siteVisitId: open.visitId, ...(evidence ? { photoEvidenceId: evidence.id, shownContentSha256: shownFor(f, evidence.sha256) } : {}) };
    const result = await extras.logSiteExtra(f.ctx, actor, raw);
    await visits.completeVisit(f.ctx, actor, completeInput(f, open.visitId, "no"));
    const before = await counts(c, f), visitBefore = await snapshot(c, f.p.tenantId), audits = await auditCount(f.p.tenantId);
    expect(await extras.logSiteExtra(f.ctx, actor, raw)).toEqual(result);
    expect(await counts(c, f)).toEqual(before);
    expect(await snapshot(c, f.p.tenantId)).toEqual(visitBefore);
    expect(await auditCount(f.p.tenantId)).toBe(audits);
    for (const changed of [{ note: "Changed fictional note" }, { description: "Changed fictional description" }, { siteVisitId: randomUUID() }, { photoEvidenceId: randomUUID() }, { shownContentSha256: "0".repeat(64) }]) {
      await expect(extras.logSiteExtra(f.ctx, actor, { ...raw, ...changed })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    }
    await expect(extras.logSiteExtra(f.ctx, actor, { ...raw, commandId: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await counts(c, f)).toEqual(before);
    await moveOffLive(c, f);
    expect(await extras.logSiteExtra(f.ctx, actor, raw)).toEqual(result);
    await expect(extras.logSiteExtra(f.ctx, actor, { ...raw, commandId: randomUUID(), siteVisitId: undefined })).rejects.toMatchObject({ code: "JOB_NOT_LIVE" });
    await chain(c, f);
  });

  it("[L035] current authority precedes receipt disclosure for closed, live, foreign and unknown jobs", async () => {
    const f = await visitFixture(c), foreign = await visitFixture(c), actor = f.members.operative.member;
    const raw = input(f);
    await extras.logSiteExtra(f.ctx, actor, raw);
    await command(c, f, { kind: "membership.revoke", membershipId: actor.membershipId });
    const before = await counts(c, f);
    for (const jobId of [f.jobId, foreign.jobId, randomUUID()]) {
      const error = await failure(extras.logSiteExtra(f.ctx, actor, { ...raw, jobId }));
      expect({ status: siteExtraHttpStatus(error.code as any), body: siteExtraFailureV1.parse({ version: "site-extra-error.v1", code: error.code }) }).toEqual({ status: 403, body: { version: "site-extra-error.v1", code: "EXTRA_FORBIDDEN" } });
    }
    await moveOffLive(c, f);
    await expect(extras.logSiteExtra(f.ctx, actor, raw)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
    expect(await counts(c, f)).toEqual(before);
  });

  it("[L036] exact visit command replays after job ceases to be live; changed and fresh commands refuse without effects", async () => {
    const f = await visitFixture(c), actor = f.members.operative.member, start = startInput(f);
    const opened = await visits.startVisit(f.ctx, actor, start), complete = completeInput(f, opened.visitId, "yes");
    const completed = await visits.completeVisit(f.ctx, actor, complete);
    await moveOffLive(c, f);
    const before = await snapshot(c, f.p.tenantId), audits = await auditCount(f.p.tenantId);
    expect(await visits.startVisit(f.ctx, actor, start)).toEqual(opened);
    expect(await visits.completeVisit(f.ctx, actor, complete)).toEqual(completed);
    expect(await snapshot(c, f.p.tenantId)).toEqual(before);
    expect(await auditCount(f.p.tenantId)).toBe(audits);
    await expect(visits.completeVisit(f.ctx, actor, { ...complete, closeoutAnswer: "no" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(visits.startVisit(f.ctx, actor, { ...start, commandId: complete.commandId })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(visits.startVisit(f.ctx, actor, startInput(f))).rejects.toMatchObject({ code: "JOB_NOT_LIVE" });
    await expect(visits.completeVisit(f.ctx, actor, completeInput(f, opened.visitId))).rejects.toMatchObject({ code: "JOB_NOT_LIVE" });
    expect(await snapshot(c, f.p.tenantId)).toEqual(before);
    expect(await auditCount(f.p.tenantId)).toBe(audits);
    await chain(c, f);
  });

  it("[L036] revoked caller still refuses identical start and completion replays without receipt disclosure", async () => {
    const f = await visitFixture(c), foreign = await visitFixture(c), actor = f.members.operative.member, start = startInput(f);
    const opened = await visits.startVisit(f.ctx, actor, start), complete = completeInput(f, opened.visitId, "no");
    await visits.completeVisit(f.ctx, actor, complete);
    await command(c, f, { kind: "membership.revoke", membershipId: actor.membershipId });
    const before = await snapshot(c, f.p.tenantId);
    for (const jobId of [f.jobId, foreign.jobId, randomUUID()]) {
      for (const run of [() => visits.startVisit(f.ctx, actor, { ...start, jobId }), () => visits.completeVisit(f.ctx, actor, { ...complete, jobId })]) {
        const error = await failure(run());
        expect({ status: siteVisitHttpStatus(error.code as any), body: siteVisitFailureV1.parse({ version: "site-visit-error.v1", code: error.code }) }).toEqual({ status: 403, body: { version: "site-visit-error.v1", code: "VISIT_FORBIDDEN" } });
      }
    }
    await moveOffLive(c, f);
    await expect(visits.startVisit(f.ctx, actor, start)).rejects.toMatchObject({ code: "VISIT_FORBIDDEN" });
    await expect(visits.completeVisit(f.ctx, actor, complete)).rejects.toMatchObject({ code: "VISIT_FORBIDDEN" });
    expect(await snapshot(c, f.p.tenantId)).toEqual(before);
  });
});
