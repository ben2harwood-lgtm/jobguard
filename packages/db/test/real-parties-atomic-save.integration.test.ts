import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ObservedPool, analyseLockOrder, mutableTables } from "./lock-observer.js";
import { createWatchdogHarness } from "./watchdog-command-harness.js";
import { JobPartiesRepository } from "../src/job-parties-repository.js";
import { JobPartiesApplication } from "../../../apps/api/src/job-parties.application.js";
import { authenticatePracticeSession } from "../src/practice-session.js";
import { DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID } from "../src/index.js";
import type { JobPartiesCommandV1 } from "@jobguard/core";

// Every migration, the real runtime role, controlled command lifecycle and audit.
// No successful save, routine or SQL result is mocked. CI owns execution.
const h = createWatchdogHarness("real-parties-atomic-save", 63200);
let repo: JobPartiesRepository;
beforeAll(async () => { await h.boot(); repo = new JobPartiesRepository(h.runtime); }, 300_000);
afterAll(async () => { vi.unstubAllEnvs(); await h.stop(); });
type Form = Extract<JobPartiesCommandV1, { action: "save_form" }>;
const form = (): Form => ({ version: "job-parties-command.v1", commandId: randomUUID(), action: "save_form", expectedJobRevision: 0,
  expectedBindingId: null, customer: { version: "customer.v1", name: "Mrs Sample", type: "person", email: "sample@example.invalid" }, customerRef: null,
  site: { version: "site.v1", addressLines: ["4 Madeup Lane"], town: "London", postcode: "SW1A 1AA" }, savedSiteRevisionId: null,
  reuseSiteId: null, expectedReuseRevisionId: null, confirmSamePlace: false, payingPartyRevisionId: null, expectedPayerRevisionId: null, correct: false });
const job = async () => {
  const id = randomUUID(); await h.admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional atomic save','quoting')", [h.tenant, id]); return id;
};
const run = (id: string, input: unknown) => repo.command(h.ctx, h.member, id, input);
async function counts(tenant = h.tenant) {
  const tables = ["customer", "customer_revision", "site", "site_revision", "job_party_binding", "job_party_current", "command_receipt", "command_lifecycle_claim", "audit_event"] as const;
  const result = {} as Record<typeof tables[number], number>;
  for (const table of tables) {
    result[table] = (await h.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [tenant])).rows[0].n;
  }
  return result;
}
async function edited(id: string): Promise<Form> {
  const v = await repo.view(h.ctx, h.member, id), c = v.customers.find(c => c.id === v.currentIds!.customerId)!;
  return { ...form(), expectedJobRevision: v.jobRevision, expectedBindingId: v.current!.bindingId, customer: v.current!.customer,
    customerRef: { id: c.id, revisionId: v.current!.customerRevisionId, expectedRevision: c.revision }, site: v.current!.site, savedSiteRevisionId: v.current!.siteRevisionId };
}
it("walk 2 invalid postcode leaves no customer", async () => {
  const id = await job(), before = await counts(), input = { ...form(), site: { ...form().site, postcode: "ZZ1 1ZZ" } };
  for (let n = 0; n < 2; n++) await expect(run(id, input)).rejects.toMatchObject({ code: "INVALID_PARTIES", fields: [{ field: "postcode", message: "Check UK postcode. Use a valid-format practice postcode, such as SW1A 1AA. Nothing was saved." }] });
  expect(await counts()).toEqual(before);
  expect((await repo.view(h.ctx, h.member, id)).current).toBeNull();
  const fixed = { ...input, site: { ...input.site, postcode: "SW1A 1AA" } };
  const saved = await run(id, fixed); expect(await run(id, fixed)).toEqual(saved);
  const after = await counts(); expect(after.customer - before.customer!).toBe(1); expect(after.job_party_binding - before.job_party_binding!).toBe(1);
  expect((await repo.view(h.ctx, h.member, id)).current?.customer.name).toBe("Mrs Sample");
});
it("binding failure after customer creation rolls back identities, audit, claims and receipts; retry succeeds", async () => {
  const id = await job(), input = form(), before = await counts();
  await h.admin.query(`CREATE FUNCTION app.atomic_save_test_refusal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.job_id='${id}'::uuid THEN
      IF NOT EXISTS(SELECT 1 FROM app.customer_revision WHERE tenant_id=NEW.tenant_id AND id=NEW.customer_revision_id) THEN RAISE EXCEPTION 'TEST_CUSTOMER_MISSING'; END IF;
      RAISE EXCEPTION 'TEST_BIND_FAILURE';
    END IF; RETURN NEW; END $$;
    CREATE TRIGGER atomic_save_test_refusal BEFORE INSERT ON app.job_party_binding FOR EACH ROW EXECUTE FUNCTION app.atomic_save_test_refusal()`);
  try { await expect(run(id, input)).rejects.toThrow("TEST_BIND_FAILURE"); }
  finally { await h.admin.query("ALTER TABLE app.job_party_binding DISABLE TRIGGER atomic_save_test_refusal"); }
  expect(await counts()).toEqual(before); expect((await repo.view(h.ctx, h.member, id)).jobRevision).toBe(0);
  await run(id, input); expect((await counts()).customer - before.customer!).toBe(1);
});
it("lost-response and concurrent identical retries return the original binding; changed payload conflicts", async () => {
  const id = await job(), input = form(), before = await counts();
  const results = await Promise.all([run(id, input), run(id, input)]); expect(results[0]).toEqual(results[1]);
  expect(await run(id, input)).toEqual(results[0]);
  await expect(run(id, { ...input, customer: { ...input.customer, name: "Changed fictional request" } })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
  expect((await counts()).customer - before.customer!).toBe(1);
  expect((await h.admin.query("SELECT result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [h.tenant, input.commandId])).rows[0].result).toEqual(results[0]);
  const events = (await h.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2", [h.tenant, id])).rows;
  expect(events).toHaveLength(3); expect(JSON.stringify(events)).not.toMatch(/Mrs Sample|Madeup Lane|sample@example/);
});
it("concurrent different forms on one revision have one winner and no losing customer", async () => {
  const id = await job(), before = await counts();
  const results = await Promise.allSettled([run(id, form()), run(id, form())]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "REVISION_CONFLICT" } });
  expect((await counts()).customer - before.customer!).toBe(1);
});
it("stale bindings, customer revisions, invalid payer and missing correction reason have no effects", async () => {
  const id = await job(); await run(id, form()); const input = await edited(id);
  for (const invalid of [{ ...input, expectedBindingId: randomUUID() }, { ...input, customerRef: { ...input.customerRef!, expectedRevision: 99 } },
    { ...input, payingPartyRevisionId: randomUUID(), expectedPayerRevisionId: randomUUID() }]) {
    const before = await counts(); await expect(run(id, invalid)).rejects.toThrow(); expect(await counts()).toEqual(before);
  }
  await h.admin.query("BEGIN; SELECT set_config('app.tenant_id','" + h.tenant + "',true); UPDATE app.job SET status='live' WHERE id='" + id + "'; COMMIT");
  const before = await counts(); await expect(run(id, { ...input, correct: true })).rejects.toMatchObject({ code: "CORRECTION_REASON_REQUIRED" }); expect(await counts()).toEqual(before);
  const old = (await repo.view(h.ctx, h.member, id)).current;
  await run(id, { ...input, correct: true, reason: "Fictional spelling correction", customer: { ...input.customer, name: "Mrs Sample corrected" } });
  expect((await h.admin.query("SELECT snapshot FROM app.job_party_snapshot WHERE tenant_id=$1 AND binding_id=$2", [h.tenant, old!.bindingId])).rows[0].snapshot).toEqual(old);
});
it("failed reuse rolls back a newly created customer; explicit confirmation permits reuse and distinct units remain separate", async () => {
  const first = await job(); await run(first, form()); const v = await repo.view(h.ctx, h.member, first);
  const id = await job(), before = await counts(), input = { ...form(), reuseSiteId: v.currentIds!.siteId, expectedReuseRevisionId: v.current!.siteRevisionId };
  await expect(run(id, input)).rejects.toMatchObject({ code: "SAME_PLACE_CONFIRMATION_REQUIRED" }); expect(await counts()).toEqual(before);
  await expect(run(id, { ...input, confirmSamePlace: true, site: { ...input.site, unit: "Flat 2" } })).rejects.toMatchObject({ code: "PARTY_NOT_FOUND" }); expect(await counts()).toEqual(before);
  await run(id, { ...input, confirmSamePlace: true }); expect((await repo.view(h.ctx, h.member, id)).currentIds!.siteId).toBe(v.currentIds!.siteId);
  const separate = await job(); await run(separate, { ...form(), site: { ...form().site, unit: "Flat 2" } });
  expect((await repo.view(h.ctx, h.member, separate)).currentIds!.siteId).not.toBe(v.currentIds!.siteId);
});
it("stale customer or payer changed on another job refuses without creating anything", async () => {
  const id = await job(); await run(id, form()); const input = await edited(id);
  await run(id, { version: input.version, commandId: randomUUID(), action: "revise_customer", customerId: input.customerRef!.id, expectedRevision: 1, customer: { ...input.customer, name: "Changed elsewhere" } });
  const before = await counts(); await expect(run(id, input)).rejects.toMatchObject({ code: "REVISION_CONFLICT" }); expect(await counts()).toEqual(before);
  const payer = await run(id, { version: input.version, commandId: randomUUID(), action: "create_customer", customer: { ...input.customer, name: "Fictional payer" } });
  const next = await edited(id);
  await run(id, { version: input.version, commandId: randomUUID(), action: "revise_customer", customerId: payer.id, expectedRevision: 1, customer: { ...input.customer, name: "New payer revision" } });
  const after = await counts(); await expect(run(id, { ...next, payingPartyRevisionId: payer.revisionId, expectedPayerRevisionId: payer.revisionId })).rejects.toMatchObject({ code: "REVISION_CONFLICT" }); expect(await counts()).toEqual(after);
});
it("another blank firm cannot read jobs, references, validation details or replay; revoked sessions cannot replay", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const account = randomUUID();
  await h.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [DEMO_TENANT_ID]);
  await h.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING", [DEMO_IDENTITY_USER_ID]);
  await h.admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional practice')", [DEMO_TENANT_ID, account]);
  await h.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING", [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, account, DEMO_IDENTITY_USER_ID]);
  async function blank() {
    const token = randomUUID(), digest = createHash("sha256").update(token).digest("hex");
    await h.runtime.query("SELECT app.start_blank_practice_company($1)", [digest]);
    const auth = await authenticatePracticeSession(h.runtime, token), id = randomUUID();
    await h.admin.query("INSERT INTO app.job(tenant_id,id,title,status,practice_session_digest,practice_scenario) VALUES($1,$2,'Private fictional source','draft',$3,'capture')", [DEMO_TENANT_ID, id, digest]);
    return { token, digest, id, auth };
  }
  const a = await blank(), b = await blank(), app = new JobPartiesApplication(h.runtime), input = form();
  const saved = await app.command({ sessionId: a.token }, a.id, input), v = await app.view({ sessionId: a.token }, a.id);
  const foreignBefore = await counts(), foreignJob = await job();
  await expect(run(a.id, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  for (const forged of [
    { customerRef: { id: v.currentIds!.customerId, revisionId: v.current!.customerRevisionId, expectedRevision: 1 } },
    { savedSiteRevisionId: v.current!.siteRevisionId },
    { payingPartyRevisionId: v.current!.customerRevisionId, expectedPayerRevisionId: v.current!.customerRevisionId },
  ]) await expect(run(foreignJob, { ...form(), ...forged })).rejects.toThrow();
  expect(await counts()).toEqual(foreignBefore);
  const before = await counts(DEMO_TENANT_ID);
  for (const id of [a.id, randomUUID()]) {
    await expect(app.view({ sessionId: b.token }, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(app.command({ sessionId: b.token }, id, { ...input, site: { postcode: "ZZ1 1ZZ" } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(app.command({ sessionId: b.token }, id, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  for (const forged of [
    { customerRef: { id: v.currentIds!.customerId, revisionId: v.current!.customerRevisionId, expectedRevision: 1 } },
    { savedSiteRevisionId: v.current!.siteRevisionId },
    { reuseSiteId: v.currentIds!.siteId, expectedReuseRevisionId: v.current!.siteRevisionId },
    { payingPartyRevisionId: v.current!.customerRevisionId, expectedPayerRevisionId: v.current!.customerRevisionId },
  ]) await expect(app.command({ sessionId: b.token }, b.id, { ...form(), ...forged })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const empty = await app.view({ sessionId: b.token }, b.id); expect(empty.customers).toEqual([]); expect(empty.sites).toEqual([]);
  expect((await app.list({ sessionId: b.token })).jobs.map(j => j.id)).toEqual([b.id]);
  expect(await app.command({ sessionId: a.token }, a.id, input)).toEqual(saved);
  await h.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [a.digest]);
  await expect(app.command({ sessionId: a.token }, a.id, input)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(await counts(DEMO_TENANT_ID)).toEqual(before);
});

it("business locks precede the audit head, and an audit failure rolls back the whole form", async () => {
  // Ensure the head is a committed row even when this case is run alone.
  await run(await job(), form());
  const id = await job(), observed = new ObservedPool(h.runtime, h.admin), repository = new JobPartiesRepository(observed.pool);
  const recording = await observed.record(() => repository.command(h.ctx, h.member, id, form()));
  const ownership = { mutable: await mutableTables(h.admin) };
  const transaction = recording.transactions.find(t => t.outcome === "commit" && t.statements.some(s => s.sql.includes("bind_job_parties")))!;
  expect(transaction).toBeDefined();
  const analysis = analyseLockOrder(transaction, ownership);
  expect(analysis.auditIndex).toBeDefined(); expect(analysis.afterAudit).toEqual([]); expect(analysis.strongTableLocks).toEqual([]);
  const next = await job(), before = await counts();
  await h.admin.query(`CREATE FUNCTION app.atomic_save_audit_refusal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.subject_ref='${next}' THEN RAISE EXCEPTION 'TEST_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER atomic_save_audit_refusal BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.atomic_save_audit_refusal()`);
  try { await expect(run(next, form())).rejects.toThrow("TEST_AUDIT_FAILURE"); }
  finally { await h.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER atomic_save_audit_refusal"); }
  expect(await counts()).toEqual(before);
});
