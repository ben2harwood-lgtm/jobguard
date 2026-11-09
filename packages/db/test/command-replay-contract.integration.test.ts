import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ExtraApprovalRepository } from "../src/extra-approval-chain-repository.js";
import { cluster as clientCluster, chainWorld, submitted, approveInput, emailOf, newToken } from "./extra-approval-chain-fixtures.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { jobMutationRegistry, watchdogCommandGuards, watchdogRoutineGuards } from "@jobguard/core";
import { readFileSync } from "node:fs";
import { lp5RegistryRows } from "./lp5-command-catalog.js";
import { RateSuggestionRepository } from "../src/rate-suggestion-repository.js";
import { createWorkFixture, closeWorkFixture, workTenant } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { PurchaseOrderActionRepository } from "../src/purchase-order-action-repository.js";
import { cluster, world } from "./contractor-billing-fixtures.js";
import { direct } from "./site-extra-fixtures.js";
import { digestOf } from "./contractor-practice-session-fixtures.js";
import { ExtraRepository, readExtraDuplicateCandidates, resolveExtraDuplicateCandidates } from "../src/index.js";
import { createWatchdogHarness } from "./watchdog-command-harness.js";

// CH-2 Done-when, applied to EVERY watchdog_live_only command: once a command succeeds, replaying its id returns the first
// result (never the job's current state), the same id with a changed payload conflicts, the same id on another job conflicts,
// and a successful no-op keeps its identity. The command list is generated from the registry: a live-only registry key or a
// guarded command that no case covers fails this file, so a new or missed command cannot pass unnoticed.
const h = createWatchdogHarness("replay-contract", 61000);
const { caseKeys, live, probeJob, norm, CONFLICT } = h;
// These dark commands have no source guard entry. Exercise their real repository
// boundaries here without adding post-0606 facts to the pre-0096 legacy-id harness.
const attestationDigest = createHash("sha256").update(randomUUID()).digest("hex");
const darkCases: typeof h.cases = [
  { key: "purchase-order-action-repository.ts#attestManual", registry: ["command:purchase_order.attest_manual"],
    prepare: async job => { await h.pre.order(job); },
    run: async (job, id, variant) => new PurchaseOrderActionRepository(h.observed.pool).attestManual(h.ctx, {
      version: "manual-order-attestation.v1", jobId: job, revisionId: h.st(job).order.id, commandId: id,
      supplierReference: `synthetic-${id}${variant === "changed" ? "-changed" : ""}`,
    }, { sessionDigest: attestationDigest }),
    later: async job => { await h.repos.po.revise(h.ctx, job, h.orderInput(h.st(job).requirement, 1, randomUUID(), "12")); } },
  { key: "purchase-order-action-repository.ts#approve", registry: ["command:purchase_order.send.dark", "/api/jobs/[id]/purchase-orders/merchant-order"],
    prepare: async job => {
      await h.pre.order(job);
      h.st(job).darkPreview = await new PurchaseOrderActionRepository(h.observed.pool).preview(h.ctx,
        { version: "merchant-order-scope.v1", jobId: job, revisionId: h.st(job).order.id });
    },
    run: async (job, id, variant) => {
      const order = h.st(job).order, preview = h.st(job).darkPreview;
      return new PurchaseOrderActionRepository(h.observed.pool).approve(h.ctx,
        { version: "merchant-order-scope.v1", jobId: job, revisionId: order.id },
        { version: "command.v1", commandId: id, authorizationId: `a${id.slice(1)}`,
          commandType: "purchase_order.send.dark", semanticKey: `merchant-order:${job}:${order.id}`,
          actorMembershipId: h.member, subjectType: "purchase_order", subjectRef: order.id,
          action: { actionType: "purchase_order.send.dark", recipient: preview.order.recipient,
            contentHash: preview.contentHash, aggregateRevision: order.revision,
            amountPence: preview.amountPence + (variant === "changed" ? 1 : 0), currency: "GBP",
            policyVersion: "dark-merchant-order.v1", expiresAt: new Date("2099-01-01T00:00:00Z") } });
    },
    later: async job => { await h.repos.po.revise(h.ctx, job, h.orderInput(h.st(job).requirement, 1, randomUUID(), "12")); } },
];
const cases = [...h.cases, ...darkCases];
// This route uses credential-bound client commands and needs the complete contractor
// schema, rather than the legacy-id watchdog harness. Its executable case is below.
const clientReplayCase = { key: "/api/customer-portal/extra-approvals", registry: ["/api/customer-portal/extra-approvals"] };
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); await h.boot();
  const user = (await h.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [h.tenant,h.member])).rows[0].identity_user_id;
  await h.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user,h.tenant,h.member]);
  await h.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${user}@fictional.invalid`,user]);
  await h.admin.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 hour')`, [randomUUID(),user,attestationDigest,randomUUID()]);
}, 120000);
afterAll(async () => { await h.stop(); vi.unstubAllEnvs(); });

describe("every watchdog_live_only command is covered by this contract", () => {
  it("reconciles every dispatcher database registry key with watchdog.ts", () => {
    const seeds = ["0521_lp5a_commands.sql", "0522_lp5b_writers.sql"].map(file =>
      readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8").split("INSERT INTO app.command_type_registry VALUES")[1]!.split(";")[0]!).join("\n");
    const keys = [...seeds.matchAll(/\('([^']+)','([^']+)'/g)].map(m => `${m[1]}:${m[2]}`).sort();
    expect(keys).toEqual(lp5RegistryRows.map(r => `${r.command_type}:${r.version}`).sort());
    for (const row of lp5RegistryRows) expect(jobMutationRegistry[`command:${row.command_type}`]).toBeDefined();
  });

  it("has a case for every guarded command (the registry's command list)", () => {
    expect(caseKeys.slice().sort()).toEqual([...watchdogCommandGuards, ...watchdogRoutineGuards].map(entry => `${entry.file}#${entry.method}`).sort());
  });
  it("covers every watchdog_live_only registry key (web routes, dynamic actions, commands and Nest routes), and no stale key", () => {
    const liveOnly = Object.entries(jobMutationRegistry).filter(([, phase]) => phase === "watchdog_live_only").map(([key]) => key).sort();
    const covered = new Set([...cases, clientReplayCase].flatMap(c => c.registry));
    expect(liveOnly.filter(key => !covered.has(key))).toEqual([]);
    expect([...covered].filter(key => !liveOnly.includes(key)).sort()).toEqual([]);
  });
});

describe("CH-2 replay contract for each watchdog_live_only command", () => {
  it.each(cases.map(c => [c.key, c] as const))("%s", async (_key, c) => {
    const a = await live(), b = await live();
    await c.prepare(a); await c.prepare(b);
    const id = randomUUID(), first = norm(await c.run(a, id, "base"));
    let noopId: string | undefined, noopFirst: unknown;
    if (c.noop) { noopId = randomUUID(); noopFirst = norm(await c.noop(a, noopId, "base")); }
    await c.later(a);
    // First result, not current state, even after the job has moved on.
    expect(norm(await c.run(a, id, "base"))).toEqual(first);
    // An exact retry whose server-generated fields differ replays the same result.
    for (const retry of c.retries ?? []) expect(norm(await c.run(a, id, retry))).toEqual(first);
    // Same id, changed payload; same id, another job.
    for (const change of ["changed", ...(c.moreChanges ?? [])]) await expect(c.run(a, id, change)).rejects.toThrow(CONFLICT);
    await expect(c.run(b, id, "base")).rejects.toThrow(CONFLICT);
    if (c.noop) {
      // A successful no-op keeps its identity.
      expect(norm(await c.noop(a, noopId!, "base"))).toEqual(noopFirst);
      await expect(c.noop(a, noopId!, "changed")).rejects.toThrow(CONFLICT);
      await expect(c.noop(b, noopId!, "base")).rejects.toThrow(CONFLICT);
    }
    // Same id, another KIND of command: all share one tenant-wide identity, whichever store holds the result.
    for (const other of cases) {
      if (other === c) continue;
      const foreign = await probeJob(other);
      await expect(other.run(foreign, id, "base"), `${other.key} must not run with ${c.key}'s id`).rejects.toThrow(CONFLICT);
      if (noopId) await expect(other.run(foreign, noopId, "base"), `${other.key} must not run with ${c.key}'s no-op id`).rejects.toThrow(CONFLICT);
    }
    // The failed attempts changed nothing, and the id still replays on the first job.
    expect(norm(await c.run(a, id, "base"))).toEqual(first);
  }, 240000);

  // The claim is atomic: two commands racing for one id, in different kinds or on different jobs, leave exactly one winner.
  it.each(cases.map((c, index) => [c.key, c, cases[(index + 1) % cases.length]!] as const))("%s races another kind for one id", async (_key, c, partner) => {
    const mine = await live(), theirs = await live();
    await c.prepare(mine); await partner.prepare(theirs);
    const id = randomUUID(), outcomes = await Promise.allSettled([c.run(mine, id, "base"), partner.run(theirs, id, "base")]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    const lost = outcomes.find(outcome => outcome.status === "rejected") as PromiseRejectedResult;
    expect(String(lost.reason)).toMatch(CONFLICT);
  }, 240000);

  it.each(cases.map(c => [c.key, c] as const))("%s: parallel duplicates of one command replay one result", async (_key, c) => {
    const job = await live(); await c.prepare(job);
    const id = randomUUID(), results = await Promise.all([1, 2, 3].map(() => c.run(job, id, "base")));
    for (const result of results) expect(norm(result)).toEqual(norm(results[0]));
  }, 240000);
});

// Dedicated synthetic seam: LP-5 cross-family identity remains held in the rate contract.
it("rate acceptance replays the stored result after new evidence and rejects changed intent", async () => {
  const f = await createWorkFixture();
  try {
    const a = await meterCompany(f), repo = new RateSuggestionRepository(f.runtime);
    const actor = { kind: "human", sessionDigest: a.digest };
    const query = { version: "rate-query.v1", asOf: "2026-11-01T00:00:00.000Z", unit: "each",
      taxBasis: "standard_rate_20", category: "paint", region: "london" };
    async function sample() {
      const scope = randomUUID(), revision = randomUUID();
      await workTenant(f.admin, a.tenantId, async db => {
        await db.query("INSERT INTO app.scope_identity(tenant_id,job_id,id,state) VALUES($1,$2,$3,'confirmed')", [a.tenantId,a.jobId,scope]);
        await db.query(`INSERT INTO app.scope_revision(tenant_id,job_id,scope_item_id,id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence)
          VALUES($1,$2,$3,$4,1,'Fictional paint','1','each',100,100)`, [a.tenantId,a.jobId,scope,revision]);
        await db.query(`INSERT INTO app.rate_book_observation(tenant_id,job_id,scope_item_id,id,source_scope_revision_id,unit,rate_principal_pence,currency,tax_basis,category,region,effective_at,provenance)
          VALUES($1,$2,$3,$4,$5,'each',100,'GBP','standard_rate_20','paint','london','2026-10-30','entered')`,
        [a.tenantId,a.jobId,scope,randomUUID(),revision]);
      });
      return { scope, revision };
    }
    const target = await sample(); await sample(); await sample();
    const baseline = await repo.read(a.context, query);
    const input = { version: "rate-suggestion-accept.v1", commandId: randomUUID(), query, jobId: a.jobId,
      scopeItemId: target.scope, currentRevisionId: target.revision, acceptedRatePence: 100, baselineHash: baseline.baselineHash };
    const results = await Promise.all([repo.accept(a.context, actor, input), repo.accept(a.context, actor, input)]);
    expect(results[1]).toEqual(results[0]);
    await sample();
    expect(await repo.accept(a.context, actor, input)).toEqual(results[0]);
    await expect(repo.accept(a.context, actor, { ...input, acceptedRatePence: 101 })).rejects.toThrow("COMMAND_CONFLICT");
    await expect(repo.accept(a.context, actor, { ...input, jobId: randomUUID() })).rejects.toThrow("NOT_FOUND");
    expect((await f.admin.query("SELECT count(*)::int n FROM app.rate_suggestion_acceptance WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(1);
  } finally { await closeWorkFixture(f); }
}, 120_000);

it(`${clientReplayCase.key}: client decision replays the first result and conflicts across payload, job and kind`, async () => {
  const c = await clientCluster();
  let identity: Pool | undefined;
  try {
    await c.admin.query("ALTER ROLE jobguard_identity LOGIN PASSWORD 'synthetic'");
    identity = new Pool({ ...c.config, database: c.admin.options.database, user: "jobguard_identity", max: 1 });
    expect((await identity.query("SELECT session_user,current_user,has_schema_privilege(current_user,'app','USAGE') app_usage")).rows)
      .toEqual([{ session_user: "jobguard_identity", current_user: "jobguard_identity", app_usage: false }]);
    const w = await chainWorld(c), repo = new ExtraApprovalRepository(c.runtime), ctx = await w.ctx;
    const actor = w.members.client_approver.member.membershipId;
    async function client() {
      const s = await submitted(c, w, 150000);
      await repo.approveExtraStep(ctx, w.members.supervisor.member, approveInput(s, 0));
      await repo.approveExtraStep(ctx, w.supervisor2.member, approveInput(s, 1));
      const signin = randomUUID().replaceAll("-", "").repeat(2), digest = randomUUID().replaceAll("-", "").repeat(2);
      await repo.issueClientApproval(ctx, w.members.surveyor.member, {
        version: "issue-client-approval.v1", commandId: randomUUID(), jobId: s.jobId, requestId: s.requestId,
        approverMembershipId: actor, recipient: await emailOf(c, w, actor), linkToken: newToken(),
        signinDigest: signin, expiresAt: new Date(Date.now() + 7 * 86400000),
      });
      await identity!.query("SELECT identity.extra_customer_use($1,$2,$3,$4,$5,'redeem')", [w.p.tenantId, s.jobId, actor, signin, digest]);
      const input = { version: "extra-customer.v1", action: "decide", jobId: s.jobId, requestId: s.requestId,
        commandId: randomUUID(), revisionHash: s.hash, netPence: s.net, decision: "approve" };
      const run = (command = input) => identity!.query("SELECT identity.extra_customer_approval($1,$2,$3,$4,$5::jsonb) result",
        [w.p.tenantId, s.jobId, actor, digest, command]).then(r => r.rows[0].result);
      return { s, input, run };
    }
    const a = await client(), b = await client(), first = await a.run();
    expect(first).toMatchObject({ state: "approved" });
    expect(await a.run()).toEqual(first);
    for (const change of [{ decision: "reject" }, { netPence: a.input.netPence + 1 }, { revisionHash: "a".repeat(64) }])
      await expect(a.run({ ...a.input, ...change })).rejects.toThrow(CONFLICT);
    await expect(b.run({ ...b.input, commandId: a.input.commandId })).rejects.toThrow(CONFLICT);
    // Both directions share tenant-wide command identity with a real other command kind.
    const other = await submitted(c, w, 150000);
    await expect(repo.approveExtraStep(ctx, w.members.supervisor.member,
      approveInput(other, 0, { commandId: a.input.commandId }))).rejects.toThrow(CONFLICT);
    const otherId = randomUUID();
    await repo.approveExtraStep(ctx, w.members.supervisor.member, approveInput(other, 0, { commandId: otherId }));
    await expect(b.run({ ...b.input, commandId: otherId })).rejects.toThrow(CONFLICT);
    expect(await a.run()).toEqual(first);
    expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_approval_step_fact WHERE tenant_id=$1 AND request_id=$2 AND actor_kind='client_approver'",
      [w.p.tenantId, a.s.requestId])).rows).toEqual([{ n: 1 }]);
    expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_approval_step_fact WHERE tenant_id=$1 AND request_id=$2 AND actor_kind='client_approver'",
      [w.p.tenantId, b.s.requestId])).rows).toEqual([{ n: 0 }]);
  } finally { await identity?.end(); await c.close(); }
}, 240000);
// Dedicated receipt path: LP-5 lifecycle integration remains held in extra-unlink-v1.
it("ResolveDuplicateCandidates replays one stored result and refuses changed intent", async () => {
  const c = await cluster();
  try {
    const w = await world(c), actor = w.w.members.supervisor.member;
    const extras = new ExtraRepository(c.runtime);
    for (let i = 0; i < 2; i++) await extras.raiseExtra(w.ctx, direct(w.w, w.w.members.operative, {
      jobId: w.s.jobId, sorItem: { versionId: w.w.demo.sorVersionId, code: "CLEAR-GUTTER" },
    }));
    const group = (await readExtraDuplicateCandidates(c.runtime, w.ctx, actor, w.s.jobId)).groups[0]!;
    expect(group).toBeDefined();
    const session = randomUUID();
    await c.admin.query(`INSERT INTO control_plane.contractor_practice_session
      (session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
      VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 day')`,
    [session, actor.tenantId, actor.membershipId, actor.identityUserId, digestOf(session)]);
    const input = { version: "duplicate-disposition.v1", commandId: randomUUID(), groupId: group.id,
      fingerprint: group.fingerprint, disposition: "not_duplicates", reasonCode: "different_work" };
    const run = (raw: unknown) => resolveExtraDuplicateCandidates(c.runtime, w.ctx, session, w.s.jobId, raw);
    const results = await Promise.all([run(input), run(input)]);
    expect(results[1]).toEqual(results[0]);
    const counts = async () => (await c.admin.query(`SELECT
      (SELECT count(*) FROM app.command_receipt WHERE tenant_id=$1) receipts,
      (SELECT count(*) FROM app.extra_duplicate_disposition WHERE tenant_id=$1) facts,
      (SELECT count(*) FROM app.audit_event WHERE tenant_id=$1) audits`, [actor.tenantId])).rows[0];
    const written = await counts();
    expect(await run(input)).toEqual(results[0]);
    await expect(run({ ...input, reasonCode: "different_location" })).rejects.toThrow("COMMAND_CONFLICT");
    expect(await counts()).toEqual(written);
  } finally { await c.close(); }
}, 120_000);
