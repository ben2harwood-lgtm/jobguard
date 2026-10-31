import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfirmProposalReview } from "../src/review-repository.js";
import { UserCommandDispatcher } from "../src/commands.js";
import { jobDoorCounts, jobDoorsActor, jobDoorsDatabase, reviewFixture, transaction, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(); }, 300_000);
afterAll(async () => { await db?.close(); });
describe("LP-2 narrow review transition", () => {
  it("[LP2-A01] inherited runtime cannot execute any broad transition overload or assume its owner", async () => {
    const routines = (await db.owner.query(`SELECT p.oid::regprocedure::text AS signature,
      has_function_privilege('lp2_login',p.oid,'EXECUTE') AS allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='app' AND p.proname='transition_job'`)).rows;
    expect(routines.length).toBeGreaterThan(0);
    expect(routines.every(r => r.allowed === false)).toBe(true);
    const f = await reviewFixture(db), before = await jobDoorCounts(db.owner, f.actor.tenant);
    await expect(transaction(db.runtime, f.actor.tenant, c => c.query("SELECT app.transition_job($1,$2,0,'quoting','start_quote')", [f.actor.tenant, f.review.jobId])))
      .rejects.toMatchObject({ code: "42501" });
    expect(await jobDoorCounts(db.owner, f.actor.tenant)).toEqual(before);
  });
  it("[LP2-A07] [LP2-A09] concurrent confirmation replays the saved result with stable scope identities and no billing", async () => {
    const f = await reviewFixture(db), dispatcher = new UserCommandDispatcher(db.runtime), mutation = new ConfirmProposalReview(f.review);
    const results = await Promise.all([dispatcher.dispatch(f.context, f.command, mutation), dispatcher.dispatch(f.context, f.command, mutation)]);
    expect(results[0]).toEqual({ jobId: f.review.jobId, reviewId: f.review.reviewId, jobRevision: 1, status: "quoting" });
    expect(results[1]).toEqual(results[0]);
    expect((await db.owner.query("SELECT scope_item_id FROM app.scope_revision WHERE tenant_id=$1 AND job_id=$2", [f.actor.tenant, f.review.jobId])).rows)
      .toEqual([{ scope_item_id: f.scopeId }]);
    const counts = await jobDoorCounts(db.owner, f.actor.tenant);
    expect(counts.customer_invoice).toBe(0); expect(counts.recovery_fee_journal).toBe(0);
    for (const table of ["quote_document_version", "action_outbox", "job_activation", "journal", "simulated_settlement_event"]) {
      expect((await db.owner.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [f.actor.tenant])).rows[0]!.n).toBe(0);
    }
    await expect(dispatcher.dispatch(f.context, { ...f.command, action: { ...f.command.action, contentHash: "b".repeat(64) } }, mutation))
      .rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    expect(await jobDoorCounts(db.owner, f.actor.tenant)).toEqual(counts);
    expect((await db.owner.query("SELECT status,revision FROM app.job WHERE tenant_id=$1 AND id=$2", [f.actor.tenant, f.review.jobId])).rows)
      .toEqual([{ status: "quoting", revision: 1 }]);
  });
  it("[LP2-A08] SQL refuses unauthorized actors identically before looking up an unknown, foreign, draft or quoting job", async () => {
    const f = await reviewFixture(db), stranger = await jobDoorsActor(db.owner), worker = await jobDoorsActor(db.owner, f.actor.tenant);
    await db.owner.query("UPDATE app.membership SET role='worker' WHERE tenant_id=$1 AND id=$2", [worker.tenant, worker.member]);
    const foreign = await reviewFixture(db), quoting = await reviewFixture(db);
    await new UserCommandDispatcher(db.runtime).dispatch(quoting.context, quoting.command, new ConfirmProposalReview(quoting.review));
    const before = await jobDoorCounts(db.owner, f.actor.tenant), errors: unknown[] = [];
    for (const job of [randomUUID(), foreign.review.jobId, f.review.jobId, quoting.review.jobId]) {
      try { await transaction(db.runtime, f.actor.tenant, c => c.query("SELECT app.start_quote_from_review($1,$2,0,$3,$4,$5,$6,$7)",
        [f.actor.tenant, job, worker.member, randomUUID(), randomUUID(), f.review.reviewId, JSON.stringify(f.review)])); }
      catch (error) { const e = error as { code: string; message: string }; errors.push({ code: e.code, message: e.message }); }
    }
    expect(errors).toEqual(Array.from({ length: 4 }, () => ({ code: "42501", message: "FORBIDDEN" })));
    expect(stranger.tenant).not.toBe(f.actor.tenant);
    expect(await jobDoorCounts(db.owner, f.actor.tenant)).toEqual(before);
  });
  it.each(["tenant", "actor", "receipt", "authorization", "review", "job", "revision", "content", "state"])("[LP2-A08] checked confirmation refuses changed %s atomically", async field => {
    const f = await reviewFixture(db);
    await transaction(db.owner, f.actor.tenant, async c => {
      const line = f.review.lines[0]!;
      await c.query("UPDATE app.scope_identity SET state='confirmed' WHERE tenant_id=$1 AND id=$2", [f.actor.tenant, line.scopeItemId]);
      await c.query(`INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence)
        VALUES($1,$2,$3,$4,1,$5,'1','item',NULL,NULL)`, [randomUUID(), f.actor.tenant, f.review.jobId, line.scopeItemId, line.description]);
    });
    if (field === "state") await transaction(db.owner, f.actor.tenant, c => c.query("UPDATE app.job SET status='quoting' WHERE tenant_id=$1 AND id=$2", [f.actor.tenant, f.review.jobId]));
    const before = await jobDoorCounts(db.owner, f.actor.tenant);
    await expect(new UserCommandDispatcher(db.runtime).dispatch(f.context, f.command, {
      async mutate(database, command) {
        return (await database.$client.query("SELECT * FROM app.start_quote_from_review($1,$2,$3,$4,$5,$6,$7,$8)",
          [field === "tenant" ? randomUUID() : f.actor.tenant, field === "job" ? randomUUID() : f.review.jobId, field === "revision" ? 1 : 0,
            field === "actor" ? randomUUID() : f.actor.member, field === "receipt" ? randomUUID() : command.commandId,
            field === "authorization" ? randomUUID() : command.authorizationId, field === "review" ? randomUUID() : f.review.reviewId,
            JSON.stringify(field === "content" ? { ...f.review, lines: [] } : f.review)])).rows[0]!;
      },
    })).rejects.toMatchObject({ code: ["review", "job", "revision", "state"].includes(field) ? "40001" : ["authorization", "content"].includes(field) ? "AUTHORIZATION_INVALID" : "FORBIDDEN" });
    expect(await jobDoorCounts(db.owner, f.actor.tenant)).toEqual(before);
  });
  it("[LP2-A10] failure after scope writes rolls back scope, review, job, authorization, receipt and audit", async () => {
    const f = await reviewFixture(db);
    const before = await jobDoorCounts(db.owner, f.actor.tenant);
    await expect(new UserCommandDispatcher(db.runtime).dispatch(f.context, f.command, new ConfirmProposalReview(f.review, true))).rejects.toThrow("SYNTHETIC_CONFIRMATION_FAILURE");
    expect(await jobDoorCounts(db.owner, f.actor.tenant)).toEqual(before);
    expect((await db.owner.query("SELECT state FROM app.proposal_review WHERE tenant_id=$1 AND id=$2", [f.actor.tenant, f.review.reviewId])).rows).toEqual([{ state: "reviewing" }]);
    expect((await db.owner.query("SELECT count(*)::int n FROM app.scope_revision WHERE tenant_id=$1", [f.actor.tenant])).rows).toEqual([{ n: 0 }]);
  });
});
