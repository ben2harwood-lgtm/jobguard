import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ContractorRepository, ContractorPracticeSessionRepository, EnterpriseFeeRepository, PracticeWorkerSwitchRepository,
  contractorSessionContext, registerNorthsideRun, verifyAuditChain, migrate } from "../src/index.js";
import { cluster, startSession, currentCommand, counts, makeSessionExpired, type Cluster } from "./contractor-practice-session-fixtures.js";
import { status } from "./contractor-entitlement-fixtures.js";
let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); }, 240000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
const fresh = () => startSession(c, false, false); // No privileged agreement fixture.
const tables = ["app.contractor_agreement_status_revision", "app.enterprise_agreement_version", "app.northside_run", "app.audit_event"];
const facts = async (tenant: string) => (await c.admin.query(`SELECT s.status,s.assignment_id,a.id agreement_id,a.rate_numerator::text n,a.rate_denominator::text d,a.agreement_ref
 FROM app.contractor_agreement_status_revision s JOIN app.enterprise_agreement_version a USING(tenant_id) WHERE s.tenant_id=$1 ORDER BY s.revision`, [tenant])).rows;

it("fresh normal startup, concurrent retry and a new practice retain one fictional agreement and audit per run", async () => {
  const f = await fresh();
  expect(await facts(f.p.tenantId)).toEqual([]);
  await Promise.all([registerNorthsideRun(c.runtime, f.p, f.context), registerNorthsideRun(c.runtime, f.p, f.context)]);
  const stored = await facts(f.p.tenantId), before = await counts(c.admin, tables);
  expect(stored).toHaveLength(1); expect(stored[0]).toMatchObject({ status: "active", n: "1", d: "10" });
  await new ContractorRepository(c.runtime).startPractice(f.session);
  await registerNorthsideRun(c.runtime, f.p, f.context);
  expect(await counts(c.admin, tables)).toEqual(before);
  expect(await facts(f.p.tenantId)).toEqual(stored);
  const reset = await fresh(); await registerNorthsideRun(c.runtime, reset.p, reset.context);
  expect(reset.p.tenantId).not.toBe(f.p.tenantId);
  expect((await facts(reset.p.tenantId))[0].agreement_id).not.toBe(stored[0].agreement_id);
  expect(await facts(f.p.tenantId)).toEqual(stored);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='northside.fictional_agreements.provisioned'", [f.p.tenantId])).rows[0].n).toBe(1);
  const rows = (await c.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [f.p.tenantId])).rows;
  verifyAuditChain(rows.map(r => ({ id: r.id, version: r.version, tenantId: r.tenant_id, sequence: Number(r.sequence), actorRef: r.actor_ref,
    eventType: r.event_type, subjectType: r.subject_type, subjectRef: r.subject_ref, occurredAt: r.occurred_at, payload: r.payload,
    payloadHash: r.payload_hash, previousHash: r.previous_hash, eventHash: r.event_hash })));
});

it.each(["inactive", "suspended"] as const)("never restores %s agreement authority on first start or retry", async value => {
  for (const registered of [false, true]) {
    const f = await fresh(); if (registered) await registerNorthsideRun(c.runtime, f.p, f.context);
    await status(c, f, value); const before = await counts(c.admin, tables);
    await expect(registerNorthsideRun(c.runtime, f.p, f.context)).rejects.toThrow("FORBIDDEN");
    expect(await counts(c.admin, tables)).toEqual(before);
  }
});

it.each(["expired", "revoked", "member_revoked"])("cannot provision or revive a %s session/owner", async reason => {
  const f = await fresh();
  if (reason === "expired") await makeSessionExpired(c, f.session);
  else if (reason === "revoked") await new ContractorPracticeSessionRepository(c.runtime).revoke(f.context, f.session);
  else await c.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, f.p.membershipId]);
  const before = await counts(c.admin, tables);
  await expect(registerNorthsideRun(c.runtime, f.p, f.context)).rejects.toThrow();
  expect(await counts(c.admin, tables)).toEqual(before);
});

it("refuses an owner/context from another practice without provisioning either tenant", async () => {
  const a = await fresh(), b = await fresh(), before = await counts(c.admin, tables);
  await expect(registerNorthsideRun(c.runtime, a.p, b.context)).rejects.toThrow();
  expect(await counts(c.admin, tables)).toEqual(before);
});

it("selects only this run's stored agreement under finance/session checks and preserves command replay", async () => {
  const f = await fresh(), foreign = await fresh(), repo = new EnterpriseFeeRepository(c.runtime);
  await registerNorthsideRun(c.runtime, f.p, f.context);
  await registerNorthsideRun(c.runtime, foreign.p, foreign.context);
  const input = { version: "northside-fee-derive.v1", commandId: randomUUID(), period: "2026-11" };
  await expect(repo.deriveNorthside(f.context, f.session, input)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
  const contractors = new ContractorRepository(c.runtime);
  const finance = await contractors.command(f.p, await currentCommand(c, f, { kind: "member.invite", role: "finance", email: "finance@northside-fictional.invalid", scope: { kind: "tenant", id: f.p.tenantId }, clientId: null, contractId: null }));
  await contractors.command(f.p, await currentCommand(c, f, { kind: "grant.create", membershipId: finance.id, role: "read_only", scope: { kind: "tenant", id: f.p.tenantId }, contractId: null }));
  await new PracticeWorkerSwitchRepository(c.runtime).switchOn(f.context, f.p, f.session, { version: "practice-worker-switch-on.v1", commandId: randomUUID(), workerId: finance.id });
  const context = await contractorSessionContext(c.runtime, f.session);
  const derived = await repo.deriveNorthside(context, f.session, input);
  expect(await repo.deriveNorthside(context, f.session, input)).toEqual({ ...derived, replayed: true });
  expect((await repo.read(context, f.session, derived.derivationId)).agreementVersionId).toBe((await facts(f.p.tenantId))[0].agreement_id);
  await expect(repo.deriveNorthside(context, foreign.session, { ...input, commandId: randomUUID() })).rejects.toThrow();
  await expect(repo.deriveNorthside(context, f.session, { ...input, agreementVersionId: (await facts(foreign.p.tenantId))[0].agreement_id })).rejects.toMatchObject({ code: "INVALID_FEE_INPUT" });
  const ownerContext = await contractorSessionContext(c.runtime, foreign.session);
  await expect(repo.deriveNorthside(ownerContext, f.session, input)).rejects.toThrow();
  // Immutable authority loss fences even an exact replay; startup cannot restore it.
  await status(c, f, "suspended");
  await expect(repo.deriveNorthside(context, f.session, input)).rejects.toThrow();
});

it("reapplying the forward migration does not provision, edit or remove existing facts", async () => {
  const f = await fresh(); await registerNorthsideRun(c.runtime, f.p, f.context);
  const before = await counts(c.admin, tables), stored = await facts(f.p.tenantId);
  const sql = await readFile(new URL("../migrations/0762_northside_hosted_agreement.sql", import.meta.url), "utf8");
  await c.admin.query(sql); await c.admin.query(sql);
  expect(await counts(c.admin, tables)).toEqual(before); expect(await facts(f.p.tenantId)).toEqual(stored);
});

it("refuses the actual non-synthetic database even if the application claims synthetic mode", async () => {
  await c.admin.query("CREATE DATABASE northside_wrong_environment");
  const admin = new Pool({ ...c.config, database: "northside_wrong_environment" });
  const runtime = new Pool({ ...c.config, database: "northside_wrong_environment", user: "ent4b_login" });
  try {
    await migrate(admin); const before = await counts(admin, tables);
    await expect(runtime.query("SELECT app.ef_derive_northside($1,$2,$3)", [randomUUID(), randomUUID(), "2026-11"]))
      .rejects.toMatchObject({ message: "FEE_GATE_CLOSED" });
    await expect(new ContractorRepository(runtime).startPractice(randomUUID())).rejects.toThrow();
    expect(await counts(admin, tables)).toEqual(before);
  } finally { await runtime.end(); await admin.end(); }
});
