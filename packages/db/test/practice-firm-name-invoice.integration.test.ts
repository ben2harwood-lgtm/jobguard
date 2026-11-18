import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startBeforeMigration, type Cluster } from "./contractor-practice-session-fixtures.js";
import { asFixtureTenant, prepareInvoicePrerequisites, seedAccount, LOCK_OWNER } from "./sv5pre-fixtures.js";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";
import { startBlankPracticeCompany } from "../src/blank-practice-company.js";
import { authenticatePracticeSession, issuePracticeSession, practiceMaterialPool } from "../src/practice-session.js";
import { FirmProfileRepository } from "../src/firm-profile-repository.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { withTenant, verifiedTenantContextForQueuedJob, type VerifiedTenantContext } from "../src/tenant-context.js";

const own = "0950_practice_firm_name_invoice.sql";
const profile = { version: "firm-profile.v1", tradingName: "Fictional Moonbrick Works", addressLines: [], contactEmail: "", contactPhone: "" };
const start = { version: "blank-practice-company.v1", action: "start" };
const fallback = "Fictional Builder Ltd";
const predecessors = ["0723_lp6c_money_binding.sql", "0731_combined_invoice_signed_vat.sql"];
const writers = ["issue_practice_customer_invoice", "issue_lock_bound_customer_invoice"] as const;
type Writer = typeof writers[number];
const body = (sql: string, writer: Writer) => sql.split(`CREATE OR REPLACE FUNCTION app.${writer}(`)[1]!.split("AS $$")[1]!.split("$$;")[0]!;

it("preserves the complete latest writers outside saved issuer resolution and its two snapshot uses", async () => {
 const sql = await readFile(new URL(`../migrations/${own}`, import.meta.url), "utf8");
 for (const [i, writer] of writers.entries()) {
  const before = body(await readFile(new URL(`../migrations/${predecessors[i]}`, import.meta.url), "utf8"), writer);
  const after = body(sql, writer);
  expect(after.indexOf("app.job_saved_firm_name")).toBeGreaterThan(after.lastIndexOf("RETURN (lp5_claim->'result')"));
  expect(after.indexOf("app.job_saved_firm_name")).toBeLessThan(after.indexOf("artifact:="));
  const restored = after.replace("DECLARE issuer_name text:='Fictional Builder Ltd'; ", "DECLARE ")
   .replace(/ -- Resolve only after authorization, ownership, gates and replay returns\.\n IF p_tenant='11111111-1111-4111-8111-111111111111'::uuid\n  AND current_database\(\)='jobguard_synthetic_demo' THEN\n  issuer_name:=coalesce\(app.job_saved_firm_name\(p_job\),'Fictional Builder Ltd'\);\n END IF;\n/u, "")
   .replace("'Issuer: '||issuer_name||' ['", "'Issuer: Fictional Builder Ltd ['")
   .replace("'legalName',issuer_name", "'legalName','Fictional Builder Ltd'");
  expect(restored).toBe(before);
 }
});

describe("only the owning blank firm’s saved name enters both new invoice writers", () => {
 let c: Cluster;
 beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await startBeforeMigration(own); }, 300_000);
 afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
 const firm = async (legacy = false) => {
  const token = legacy ? await issuePracticeSession(c.runtime) : await startBlankPracticeCompany(c.runtime, start);
  return { token, auth: await authenticatePracticeSession(c.runtime, token) };
 };
 type Firm = Awaited<ReturnType<typeof firm>>;
 type Account = { tenantId: string; jobId: string; revisionId: string; context: VerifiedTenantContext; actor: string; digest?: string };
 async function account(f: Firm, ready = true): Promise<Account> {
  const { auth } = f, tenant = auth.context.tenantId, job = randomUUID(), scope = randomUUID(), baseline = randomUUID(), draft = randomUUID(), revision = randomUUID();
  await withTenant(c.runtime, auth.context, db => db.$client.query("SELECT app.create_practice_sandbox_job($1,$2,$3,$4)", [tenant, job, auth.membershipId, auth.digest]));
  // Synthetic immutable commercial premises only; real lock/terms/Final Check
  // gates below are exercised through their existing runtime repository paths.
  await asFixtureTenant(c.admin, tenant, async db => {
   await db.query("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2", [tenant, job]);
   await seedSyntheticPartyFixture(db, tenant, job);
   await db.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')", [tenant, scope, job]);
   await db.query("INSERT INTO app.quote_version(tenant_id,id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,500,'accepted')", [tenant, baseline, job, "a".repeat(64)]);
   await db.query("INSERT INTO app.final_account_draft(tenant_id,id,job_id) VALUES($1,$2,$3)", [tenant, draft, job]);
   await db.query("INSERT INTO app.final_account_revision(tenant_id,id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings) VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',500,100,600,false,'[]')", [tenant, revision, job, draft, "a".repeat(64), baseline]);
   for (const [ordinal, net] of [[1, 1000], [2, -500]]) {
    const source = randomUUID();
    await db.query("INSERT INTO app.final_account_line(tenant_id,id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal) VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional signed work',$7,$8)", [tenant, randomUUID(), job, revision, source, scope, net, ordinal]);
   }
   await db.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=1 WHERE tenant_id=$2 AND id=$3", [revision, tenant, draft]);
  });
  if (ready) await prepareInvoicePrerequisites(c.admin, practiceMaterialPool(c.runtime, auth.digest), tenant, job, auth.membershipId, revision);
  return { tenantId: tenant, jobId: job, revisionId: revision, context: auth.context, actor: auth.membershipId, digest: auth.digest };
 }
 const issue = async (writer: Writer, a: Account, commandId = randomUUID(), context = a.context, scopeDigest: string | null = a.digest ?? null) => {
  const pool = scopeDigest ? practiceMaterialPool(c.runtime, scopeDigest) : c.runtime;
  const input = { jobId: a.jobId, finalAccountRevisionId: a.revisionId, actorMembershipId: a.actor, commandId, recipient: "practice-customer@example.invalid", issuedOn: "2026-11-17" };
  if (writer === writers[0]) return (await new PracticeInvoiceRepository(pool).issue(context, input)).id;
  return (await new FinalAccountLockRepository(pool).issueInvoice(context, { ...input, invoiceKind: "final", expectedSourceHash: "a".repeat(64) })).invoiceId;
 };
 async function refuseWithoutName(work: Promise<unknown>) {
  let error: unknown;
  try { await work; } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).not.toContain(profile.tradingName);
  expect((error as Error).message).not.toContain("Fictional Moonbrick Renamed");
 }
 async function snapshot() {
  const result: Record<string, unknown> = {};
  for (const table of ["firm_profile", "customer_invoice", "customer_invoice_sequence", "customer_invoice_evidence", "final_account_invoice_binding", "final_account_invoiced_line", "decision", "decision_resolution", "action_authorization", "action_outbox", "command_receipt", "audit_event", "journal", "journal_line"]) {
   result[table] = (await c.admin.query(`SELECT row_to_json(r)::text bytes FROM app.${table} r ORDER BY row_to_json(r)::text COLLATE "C"`)).rows;
  }
  result.routineAuthority = (await c.admin.query("SELECT p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname=ANY($1::text[]) ORDER BY p.oid", [[...writers]])).rows;
  return result;
 }
 async function assertDocument(a: Account, id: string, name: string) {
  const row = (await c.admin.query("SELECT * FROM app.customer_invoice WHERE tenant_id=$1 AND id=$2", [a.tenantId, id])).rows[0]!;
  expect(row.issuer_details.legalName).toBe(name);
  expect(row.pdf_bytes.toString("utf8")).toContain(`Issuer: ${name} [`);
  expect(createHash("sha256").update(row.pdf_bytes).digest("hex")).toBe(row.pdf_sha256);
  expect([row.net_pence, row.tax_pence, row.total_pence, row.source_hash]).toEqual(["500", "100", "600", "a".repeat(64)]);
  const lines = (await c.admin.query("SELECT l.net_pence,l.tax_pence,l.gross_pence,l.revision_id,l.scope_item_id,l.source_id,l.commercial_revision_id FROM app.final_account_invoiced_line l JOIN app.final_account_line s ON(s.tenant_id,s.id)=(l.tenant_id,l.final_account_line_id) WHERE l.tenant_id=$1 AND l.invoice_id=$2 ORDER BY s.ordinal", [a.tenantId, id])).rows;
  expect(lines.map(l => [l.net_pence, l.tax_pence, l.gross_pence])).toEqual([["1000", "200", "1200"], ["-500", "-100", "-600"]]);
  for (const l of lines) { expect(l.revision_id).toBe(a.revisionId); expect(l.commercial_revision_id).toBe(l.source_id); }
  expect((await c.admin.query("SELECT content_hash,immutable_content,adapter FROM app.action_outbox WHERE tenant_id=$1 AND authorization_id=$2", [a.tenantId, row.authorization_id])).rows).toEqual([{ content_hash: row.pdf_sha256, immutable_content: row.pdf_bytes.toString("utf8"), adapter: "fake_invoice_delivery" }]);
  return row;
 }
 it("upgrades populated documents, isolates owners, and keeps issued bytes on rename and replay", async () => {
  const a = await firm(), b = await firm(), sample = await firm(true), repo = new FirmProfileRepository(c.runtime);
  await repo.save(a.auth.context, profile);
  // Two real predecessor issues, with saved profile already populated.
  for (const writer of writers) {
   const old = await account(a); await assertDocument(old, await issue(writer, old), fallback);
  }
  const sql = await readFile(new URL(`../migrations/${own}`, import.meta.url), "utf8"), before = await snapshot();
  if (process.env.JOBGUARD_PRACTICE_FIRM_INVOICE_BASE !== "1") await c.admin.query(sql);
  expect(await snapshot()).toEqual(before);
  for (const writer of writers) {
   await repo.save(a.auth.context, profile);
   const named = await account(a), command = randomUUID();
   const id = await issue(writer, named, command);
   const original = await assertDocument(named, id, profile.tradingName);
   await repo.save(a.auth.context, { ...profile, tradingName: "Fictional Moonbrick Renamed" });
   const saved = await snapshot();
   expect(await issue(writer, named, command)).toBe(id);
   expect(await snapshot()).toEqual(saved);
   expect((await c.admin.query("SELECT * FROM app.customer_invoice WHERE id=$1", [id])).rows[0]).toEqual(original);
   const next = await account(a); await assertDocument(next, await issue(writer, next), "Fictional Moonbrick Renamed");
   for (const f of [b, sample]) {
    const unnamed = await account(f); await assertDocument(unnamed, await issue(writer, unnamed), fallback);
   }
   const unready = await account(a, false), noGateEffects = await snapshot();
   await expect(issue(writer, unready)).rejects.toThrow(/FINAL_ACCOUNT_LOCK_REQUIRED/);
   expect(await snapshot()).toEqual(noGateEffects);
   const locks = new FinalAccountLockRepository(practiceMaterialPool(c.runtime, unready.digest!));
   const scopes = (await c.admin.query("SELECT DISTINCT scope_item_id FROM app.final_account_line WHERE tenant_id=$1 AND job_id=$2", [unready.tenantId, unready.jobId])).rows;
   for (const scope of scopes) await locks.disposition(unready.context, { jobId: unready.jobId, actorMembershipId: unready.actor, commandId: randomUUID(), scopeItemId: scope.scope_item_id, disposition: "done" });
   await locks.lock(unready.context, { jobId: unready.jobId, actorMembershipId: unready.actor, commandId: randomUUID(), finalAccountRevisionId: unready.revisionId, expectedRevision: 1, declarationVersion: "final_account_declaration.v1" });
   const noCheckEffects = await snapshot();
   await expect(issue(writer, unready)).rejects.toThrow(/FINAL_CHECK_NOT_COMPLETE/);
   expect(await snapshot()).toEqual(noCheckEffects);
   const target = await account(a), nothing = await snapshot();
   await refuseWithoutName(issue(writer, target, randomUUID(), b.auth.context));
   await refuseWithoutName(issue(writer, target, randomUUID(), target.context, b.auth.digest));
   await expect(issue(writer, target, randomUUID(), target.context, null)).rejects.toThrow();
   await expect(issue(writer, target, randomUUID(), verifiedTenantContextForQueuedJob(target.tenantId))).rejects.toThrow();
   await expect(c.runtime.query(`SELECT app.${writer}(${writer === writers[0] ? "$1,$2,$3,$4,$5,$6,$7::date" : "$1,$2,$3,$4,$5,'final',$6,$7::date,$8"})`, [target.tenantId, target.jobId, target.revisionId, target.actor, randomUUID(), "practice-customer@example.invalid", "2026-11-17", ...(writer === writers[0] ? [] : ["a".repeat(64)])])).rejects.toThrow();
   expect(await snapshot()).toEqual(nothing);
   expect(await withTenant(c.runtime, b.auth.context, async db => (await db.$client.query("SELECT * FROM app.firm_profile WHERE company_key=$1", [`practice:${a.auth.digest}`])).rows)).toEqual([]);
   await expect(withTenant(c.runtime, b.auth.context, db => db.$client.query("SELECT app.job_saved_firm_name($1)", [target.jobId]))).rejects.toThrow(/FORBIDDEN/);
   for (const kind of ["expiry", "revocation", "reset"] as const) {
    const f = await firm(); await repo.save(f.auth.context, profile); const expired = await account(f);
    if (kind === "reset") await startBlankPracticeCompany(c.runtime, { ...start, action: "reset" }, f.token);
    else await c.admin.query(`UPDATE control_plane.practice_session SET ${kind === "expiry" ? "expires_at=clock_timestamp()-interval '1 second'" : "revoked_at=clock_timestamp()"} WHERE token_digest=$1`, [f.auth.digest]);
    const prior = await snapshot(); await expect(issue(writer, expired)).rejects.toThrow(); expect(await snapshot()).toEqual(prior);
   }
  }
  // A different real tenant cannot print the blank firm's name; its own
  // unsupported path preserves the old issuer even with a profile present.
  const other = await seedAccount(c.admin, randomUUID(), 500);
  await c.admin.query("INSERT INTO app.firm_profile(tenant_id,company_key,trading_name) VALUES($1::uuid,$1::text,'Fictional Other Tenant')", [other.tenantId]);
  const foreignJob = (await account(a)).jobId;
  await expect(withTenant(c.runtime, other.context, db => db.$client.query("SELECT app.job_saved_firm_name($1)", [foreignJob]))).rejects.toThrow(/FORBIDDEN/);
  for (const writer of writers) {
   const seeded = await seedAccount(c.admin, a.auth.context.tenantId as ReturnType<typeof randomUUID>, 500);
   await prepareInvoicePrerequisites(c.admin, c.runtime, seeded.tenantId, seeded.jobId, LOCK_OWNER, seeded.revisionId);
   const seededId = await issue(writer, { ...seeded, actor: LOCK_OWNER });
   expect((await c.admin.query("SELECT issuer_details FROM app.customer_invoice WHERE id=$1", [seededId])).rows[0].issuer_details.legalName).toBe(fallback);
   const fixture = await seedAccount(c.admin, randomUUID(), 500);
   await c.admin.query("INSERT INTO app.firm_profile(tenant_id,company_key,trading_name) VALUES($1::uuid,$1::text,'Fictional Unsupported Tenant')", [fixture.tenantId]);
   await prepareInvoicePrerequisites(c.admin, c.runtime, fixture.tenantId, fixture.jobId, LOCK_OWNER, fixture.revisionId);
   const id = await issue(writer, { ...fixture, actor: LOCK_OWNER });
   const row = (await c.admin.query("SELECT issuer_details,pdf_bytes FROM app.customer_invoice WHERE id=$1", [id])).rows[0];
   expect(row.issuer_details.legalName).toBe(fallback);
   expect(row.pdf_bytes.toString("utf8")).not.toContain(profile.tradingName);
   const target = await account(a), prior = await snapshot();
   await expect(issue(writer, target, randomUUID(), fixture.context)).rejects.toThrow();
   expect(await snapshot()).toEqual(prior);
  }
  const saved = await snapshot(); await c.admin.query(sql); expect(await snapshot()).toEqual(saved);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.action_outbox WHERE adapter NOT LIKE 'fake%'")).rows[0].n).toBe(0);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.journal")).rows[0].n).toBe(0);
 }, 300_000);
});
