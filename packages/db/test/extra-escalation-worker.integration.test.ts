import { testActorContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ExtraApprovalRepository, escalateOverdueExtrasTask, verifiedTenantContextForQueuedJob, withTenant } from "../src/index.js";
import { approveInput, chain, chainWorld, cluster, command, sleep, submitted, type Cluster } from "./extra-approval-chain-fixtures.js";

let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); }, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

it("ENT-5 worker discovery, crash rollback, concurrent restart, tenant confinement and alternate revocation", async () => {
  const a = await chainWorld(c), b = await chainWorld(c);
  const overdue = await submitted(c, a, 40000), other = await submitted(c, b, 40000);
  const decided = await submitted(c, a, 40000);
  const repository = new ExtraApprovalRepository(c.runtime), context = await a.ctx;
  await repository.approveExtraStep(await testActorContext(c.admin, context, a.members.supervisor.member), a.members.supervisor.member, approveInput(decided, 0));
  const doneStep = await submitted(c, a, 150000);
  await repository.approveExtraStep(await testActorContext(c.admin, context, a.members.supervisor.member), a.members.supervisor.member, approveInput(doneStep, 0));
  await submitted(c, a, null); // unpriced requests are not discovery candidates
  const discover = () => withTenant(c.admin, context, async db => {
    await db.$client.query("SET LOCAL ROLE jobguard_infrastructure");
    const before = (await db.$client.query("SELECT current_setting('app.tenant_id') t")).rows[0];
    const rows = (await db.$client.query("SELECT * FROM infrastructure.discover_extra_escalations()")).rows;
    expect((await db.$client.query("SELECT current_setting('app.tenant_id') t")).rows[0]).toEqual(before);
    return rows;
  });
  expect(await discover()).toEqual([]);
  await expect(withTenant(c.runtime, context, db => db.$client.query("SELECT * FROM infrastructure.discover_extra_escalations()"))).rejects.toMatchObject({code: "42501"});
  const grants = (await c.admin.query(`SELECT p.prosecdef, r.rolname,
    has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') AS worker,
    has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') AS runtime
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
    WHERE p.oid='infrastructure.discover_extra_escalations()'::regprocedure`)).rows;
  expect(grants).toEqual([{prosecdef: true, rolname: "jobguard_migration", worker: true, runtime: false}]);
  await sleep(61_000);
  expect(await discover()).toEqual(expect.arrayContaining([{tenant_id: a.p.tenantId}, {tenant_id: b.p.tenantId}]));
  expect((await discover()).every(row => Object.keys(row).join() === "tenant_id")).toBe(true);
  // Crash after the fact insert but before appendAuditBatch: rollback must leave neither behind.
  await expect(withTenant(c.runtime, context, async db => {
    const fired = await db.$client.query("SELECT * FROM app.xa_escalate()");
    expect(fired.rows.some(row => row.request_id === overdue.requestId)).toBe(true);
    throw new Error("synthetic crash before audit");
  })).rejects.toThrow("synthetic crash before audit");
  expect((await c.admin.query("SELECT 1 FROM app.extra_escalation_fact WHERE tenant_id=$1", [a.p.tenantId])).rows).toEqual([]);
  const run = () => escalateOverdueExtrasTask(c.runtime, verifiedTenantContextForQueuedJob(a.p.tenantId));
  const pair = await Promise.all([run(), run()]);
  expect(pair.flat().filter(row => row.request_id === overdue.requestId)).toHaveLength(1);
  // Fresh repository instance represents a restart after commit, before job acknowledgement.
  expect(await new ExtraApprovalRepository(c.runtime).escalateOverdue(context)).toEqual([]);
  expect((await c.admin.query("SELECT 1 FROM app.extra_escalation_fact WHERE request_id=$1", [overdue.requestId])).rows).toHaveLength(1);
  expect((await c.admin.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND event_type='contractor.extra.escalated' AND subject_ref=$2", [a.p.tenantId, overdue.extraId])).rows).toHaveLength(1);
  expect((await c.admin.query("SELECT 1 FROM app.extra_escalation_fact WHERE request_id=$1", [other.requestId])).rows).toEqual([]);
  expect((await c.admin.query("SELECT 1 FROM app.extra_escalation_fact WHERE request_id=$1", [decided.requestId])).rows).toEqual([]);
  expect((await c.admin.query("SELECT step_index FROM app.extra_escalation_fact WHERE request_id=$1", [doneStep.requestId])).rows).toEqual([{step_index: 1}]);
  expect(await discover()).toEqual([{tenant_id: b.p.tenantId}]);
  // A valid different tenant identifier confines execution to that tenant, never to A's requests.
  expect((await escalateOverdueExtrasTask(c.runtime, verifiedTenantContextForQueuedJob(b.p.tenantId))).map(row => row.request_id)).toEqual([other.requestId]);
  expect(await discover()).toEqual([]);
  expect((await repository.queue(context, a.members.surveyor.member.membershipId)).some(row => row.request_id === overdue.requestId)).toBe(true);
  await expect(repository.approveExtraStep(await testActorContext(c.admin, context, a.members.finance.member), a.members.finance.member, approveInput(overdue, 0))).rejects.toMatchObject({code: "PERMISSION_DENIED"});
  await command(c, a, {kind: "grant.revoke", grantId: a.members.surveyor.grant});
  await expect(repository.approveExtraStep(await testActorContext(c.admin, context, a.members.surveyor.member), a.members.surveyor.member, approveInput(overdue, 0))).rejects.toMatchObject({code: "PERMISSION_DENIED"});
  expect((await repository.queue(context, a.members.surveyor.member.membershipId)).some(row => row.request_id === overdue.requestId)).toBe(false);
  // The original approver retains authority; a decided request cannot fire again.
  await repository.approveExtraStep(await testActorContext(c.admin, context, a.members.supervisor.member), a.members.supervisor.member, approveInput(overdue, 0, {commandId: randomUUID()}));
  expect(await run()).toEqual([]);
  const source = (await c.admin.query("SELECT prosrc FROM pg_proc WHERE oid='infrastructure.discover_extra_escalations()'::regprocedure")).rows[0].prosrc as string;
  expect(source).not.toMatch(/finding|suppress|advisory/iu);
  expect(await chain(c, a)).toBeTruthy(); expect(await chain(c, b)).toBeTruthy();
}, 240_000);
