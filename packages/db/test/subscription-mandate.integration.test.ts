import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeWorkFixture, createWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { SubscriptionMandateRepository } from "../src/subscription-mandate-repository.js";

describe("M4-13 PostgreSQL mandate persistence", () => {
  let f: WorkFixture, repo: SubscriptionMandateRepository;
  beforeAll(async () => { f = await createWorkFixture(); repo = new SubscriptionMandateRepository(f.runtime); }, 120000);
  afterAll(async () => closeWorkFixture(f));
  const prepare = async () => {
    const a = await meterCompany(f), context = testTenantContext(a.tenantId);
    const selection = { version: "subscription-agreement-selection.v1", termsVersion: "synthetic_subscription_success_terms.v1",
      catalogueVersion: "subscription_pricing_policy_v4", tenantId: a.tenantId, agreementId: randomUUID(), revision: 1,
      plan: "Solo", cadence: "monthly", anchorDay: 1, recipientRef: randomUUID(),
      validFrom: new Date(Date.now() + 60000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() };
    const approve = { version: "subscription-mandate-command.v1", kind: "approve", expectedSequence: 0, selection };
    const command = (value: unknown, id = randomUUID()) => repo.command(context, a.digest, id, value);
    return { a, context, selection, approve, command };
  };
  it("binds exact immutable terms, human provenance, idempotency and audit atomically", async () => {
    const { a, context, approve, command, selection } = await prepare(), id = randomUUID();
    const [accepted, concurrentReplay] = await Promise.all([command(approve, id), command(approve, id)]);
    expect(concurrentReplay).toEqual(accepted);
    expect(await command(approve, id)).toEqual(accepted);
    await expect(command({ ...approve, selection: { ...selection, plan: "Builder" } }, id)).rejects.toThrow("MANDATE_COMMAND_CONFLICT");
    const read = await repo.read(context, a.digest);
    expect(read.record?.selection).toEqual(selection);
    expect(read.record?.approval.actorMembershipId).toBe(a.actorId);
    expect(read.record?.approval.commandId).toBe(id);
    expect((await f.admin.query("SELECT count(*)::int n FROM app.subscription_mandate_event WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(1);
    expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='subscription.mandate.approve'", [a.tenantId])).rows[0].n).toBe(1);
  });
  it("two approvals and approve-vs-revoke races leave one consistent sequence", async () => {
    const initial = await prepare();
    const initialRace = await Promise.allSettled([
      initial.command(initial.approve),
      initial.command({ version: "subscription-mandate-command.v1", kind: "revoked", expectedSequence: 0 }),
    ]);
    expect(initialRace.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await repo.read(initial.context, initial.a.digest)).toMatchObject({ sequence: 1, record: { state: "active" } });
    const p = await prepare();
    const approvals = await Promise.allSettled([p.command(p.approve), p.command(p.approve)]);
    expect(approvals.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(approvals.filter(r => r.status === "rejected")).toHaveLength(1);
    const race = await Promise.allSettled([
      p.command({ ...p.approve, expectedSequence: 1 }),
      p.command({ version: "subscription-mandate-command.v1", kind: "revoked", expectedSequence: 1 }),
    ]);
    expect(race.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await repo.read(p.context, p.a.digest)).record?.state).toBe("revoked");
  });
  it("cancellation before approval fails; revocation and cancellation are durable pending actions", async () => {
    const p = await prepare();
    const cancel = { version: "subscription-mandate-command.v1", kind: "cancelled", expectedSequence: 0 };
    await expect(p.command(cancel)).rejects.toThrow("MANDATE_NOT_APPROVED");
    await p.command(p.approve);
    const revoked = { ...cancel, kind: "revoked", expectedSequence: 1 }, id = randomUUID();
    await p.command(revoked, id); await p.command(revoked, id);
    await p.command({ ...cancel, expectedSequence: 2 });
    expect(await repo.read(p.context, p.a.digest)).toMatchObject({ sequence: 3, providerCancellation: "pending", record: { state: "cancelled" } });
    await expect(p.command({ ...p.approve, expectedSequence: 3 })).rejects.toThrow("MANDATE_NOTICE_REAUTHORISATION_REQUIRED");
  });
  it("blocks changed price/allowance/anchor/recipient/plan terms without approved notice policy", async () => {
    const p = await prepare(); await p.command(p.approve);
    for (const patch of [{ plan: "Builder" }, { anchorDay: 2 }, { recipientRef: randomUUID() }])
      await expect(p.command({ ...p.approve, expectedSequence: 1, selection: { ...p.selection, ...patch } })).rejects.toThrow("MANDATE_NOTICE_REAUTHORISATION_REQUIRED");
    await expect(p.command({ ...p.approve, expectedSequence: 1, selection: { ...p.selection, cadence: "annual" } })).rejects.toThrow("MANDATE_INVALID");
  });
  it("denies cross-tenant reads/ids, worker writes and active non-owner approval", async () => {
    const p = await prepare(), other = await prepare(); await p.command(p.approve);
    await expect(repo.read(other.context, p.a.digest)).rejects.toThrow("MANDATE_FORBIDDEN");
    await expect(other.command({ ...other.approve, selection: p.selection })).rejects.toThrow("MANDATE_FORBIDDEN");
    await f.admin.query("UPDATE app.membership SET role='admin' WHERE tenant_id=$1 AND id=$2", [other.a.tenantId, other.a.actorId]);
    await expect(other.command(other.approve)).rejects.toThrow("MANDATE_FORBIDDEN");
    for (const table of ["subscription_terms_version", "subscription_mandate_event"]) {
      expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed", [`app.${table}`])).rows[0].allowed).toBe(false);
      await expect(workTenant(f.runtime, p.a.tenantId, db => db.query(`SELECT * FROM app.${table}`))).rejects.toMatchObject({ code: "42501" });
      await expect(workTenant(f.admin, p.a.tenantId, db => db.query(`UPDATE app.${table} SET tenant_id=tenant_id WHERE tenant_id=$1`, [p.a.tenantId]))).rejects.toThrow();
      expect((await workTenant(f.admin, other.a.tenantId, async db => {
        await db.query("SET LOCAL ROLE jobguard_migration");
        return db.query(`SELECT * FROM app.${table} WHERE tenant_id=$1`, [p.a.tenantId]);
      })).rows).toEqual([]);
    }
  });
  it("raw SQL cannot smuggle another tenant, hidden fields or malformed identifiers", async () => {
    const p = await prepare();
    for (const value of [
      { version: "subscription-mandate-command.v1", kind: "approve", expectedSequence: 0, termsText: "fictional private text", termsHash: "a".repeat(64) },
      { version: "subscription-mandate-command.v1", kind: "cancelled", expectedSequence: 0, shadowSignals: [] },
    ]) await expect(workTenant(f.runtime, p.a.tenantId, db => db.query(
      "SELECT app.m413_command($1,$2,$3,$4::jsonb)", [p.a.tenantId, p.a.digest, randomUUID(), JSON.stringify(value)],
    ))).rejects.toThrow(/^MANDATE_INVALID$/u);
  });
  it("rolls back terms, approval, receipt and history if audit fails", async () => {
    const p = await prepare();
    const tables = ["subscription_terms_version", "subscription_mandate_event", "action_authorization", "command_receipt"];
    const counts = async () => Promise.all(tables.map(async table =>
      (await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [p.a.tenantId])).rows[0].n));
    const before = await counts();
    // Fault injection is synthetic and tenant-local; force the final audit insert to fail.
    await f.admin.query(`CREATE FUNCTION app.m413_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='subscription.mandate.approve' AND NEW.tenant_id='${p.a.tenantId}'::uuid THEN RAISE EXCEPTION 'synthetic audit fault'; END IF; RETURN NEW; END $$`);
    await f.admin.query("CREATE TRIGGER m413_test_fail BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.m413_test_fail_audit()");
    await expect(p.command(p.approve)).rejects.toThrow("MANDATE_UNAVAILABLE");
    expect(await counts()).toEqual(before);
    // Keep the fault trigger: it targets this one unused synthetic tenant only.
  });
});
