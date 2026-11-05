// 0518: the shadow-30000 guide's demo-only helpers on real PostgreSQL, with real sessions, jobs, locks and found extras.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { availableFinalCheck, closeFinalCheckFixture, createFinalCheckFixture, seedFinalCheckJob, type FinalCheckFixture } from "./final-check-fixture.js";
import { guideFixture, hash, link, type Job } from "./shadow-demo-guide-fixture.js";
import { realReceiptFixture } from "./stored-receipt-case-fixture.js";
import { withTenant } from "../src/tenant-context.js";

let f: FinalCheckFixture, guide: ReturnType<typeof guideFixture>;
type Subject = Pick<Job, "context" | "tenantId" | "jobId">;
const attempt = async (a: Pick<Subject, "context">, sql: string, args: unknown[]) => {
 try { return { ok: (await withTenant(f.runtime, a.context, db => db.$client.query(sql, args))).rows[0] }; }
 catch (error) { return { refused: (error as Error).message }; }
};
const read = (fn: string, a: Subject, session: string) => attempt(a, `SELECT app.${fn}($1,$2,$3) result`, [a.tenantId, a.jobId, session]);
const issue = (a: Subject, customer: string, session: string, digest: string, path: string) => attempt(a, "SELECT app.demo_issue_customer_link($1,$2,$3,$4,$5,$6) result", [a.tenantId, a.jobId, customer, session, digest, path]);
const grants = async (a: Subject) => (await f.admin.query("SELECT count(*)::int n FROM app.customer_portal_grant WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0].n as number;
const holds = async (a: Subject) => (await f.admin.query("SELECT count(*)::int n FROM infrastructure.demo_source_hold_request WHERE job_id=$1", [a.jobId])).rows[0].n as number;
const forbidden = { refused: "FINAL_CHECK_FORBIDDEN" };

beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createFinalCheckFixture(); guide = guideFixture(f); }, 300000);
afterAll(async () => { await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });

describe("0518 demo-only guide helpers", () => {
 it("LATER-SAFETY-19 delivers the same demo link the page returned and redeems only its tenant-bound grant", async () => {
  const a = await guide.locked();
  const { ShadowDemoGuideApplication } = await import("../../../apps/api/src/shadow-demo-guide.application.js");
  const { ActionExecutor } = await import("../src/outbox.js");
  const issued = await new ShadowDemoGuideApplication(f.runtime, a.sessionId, "synthetic_demo").issueCustomerLink(a.jobId, { version: "shadow-guide-customer-link.v1", customerId: a.customer }, hash);
  const stored = (await f.admin.query("SELECT row_to_json(g) AS g, row_to_json(o) AS outbox, row_to_json(auth) AS auth FROM app.customer_portal_grant g JOIN app.action_outbox o ON(o.tenant_id,o.id)=(g.tenant_id,g.outbox_id) JOIN app.action_authorization auth ON(auth.tenant_id,auth.id)=(o.tenant_id,o.authorization_id) WHERE g.tenant_id=$1 AND g.job_id=$2", [a.tenantId, a.jobId])).rows[0];
  expect(stored.outbox.immutable_content).toMatch(new RegExp(`^customer-signin-reference\\.v1:${a.tenantId}/${a.jobId}/${a.customer}/[A-Za-z0-9_-]{43}$`));
  expect(stored.outbox).toMatchObject({ content_hash: hash(stored.outbox.immutable_content), adapter: "fake_email", policy_version: "customer-signin.synthetic.v1" });
  expect(stored.auth.content_hash).toBe(stored.outbox.content_hash);
  const deliver = vi.fn(async (_action: unknown, path?: string) => {
   expect(path).toBe(issued.path);
   return { kind: "succeeded" as const, providerReference: "fictional-demo-email" };
  });
  const adapter = { name: "fake_email" as const, supportsProviderDeduplication: false, deliver, reconcile: async () => "unknown" as const };
  await new ActionExecutor(f.runtime, new Map([[adapter.name, adapter]]), { emit: () => undefined }, hash).execute(a.context, stored.outbox.id);
  expect(deliver).toHaveBeenCalledTimes(1);
  const secret = deliver.mock.calls[0]![1]!.split("/").at(-1)!;
  expect(stored.g.token_digest).toBe(hash(`customer-link:${secret}`));
  expect(JSON.stringify(stored)).not.toContain("/customer/sign-in#");
  expect(JSON.stringify(stored)).not.toContain(secret);
  const redeem = async (tenantId: string) => {
   const db = await f.admin.connect();
   try {
    await db.query("BEGIN"); await db.query("SET LOCAL ROLE jobguard_identity");
    const result = await db.query("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,'redeem') result", [tenantId, a.jobId, a.customer, hash(`customer-link:${secret}`), hash(`customer-session:${randomUUID()}`)]);
    await db.query("COMMIT"); return result;
   } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
  };
  await expect(redeem(randomUUID())).rejects.toMatchObject({ code: "42501" });
  await expect(redeem(a.tenantId)).resolves.toHaveProperty("rows");
  await expect(redeem(a.tenantId)).rejects.toMatchObject({ code: "42501" });
 }, 600000);
 it("0789 never stores the demo sign-in path or secret, including legacy path callers", async () => {
  const a = await guide.locked(), secret = Buffer.from(randomUUID() + randomUUID()).toString("base64url").slice(0, 43);
  const l = link(a, a.customer, secret);
  const issued = await issue(a, a.customer, a.digest, l.digest, l.path);
  expect(issued).toHaveProperty("ok");
  const rows = (await f.admin.query("SELECT o.* FROM app.customer_portal_grant g JOIN app.action_outbox o ON(o.tenant_id,o.id)=(g.tenant_id,g.outbox_id) WHERE g.tenant_id=$1 AND g.id=$2", [a.tenantId, issued.ok!.result])).rows;
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toContain("/customer/sign-in#");
  expect(JSON.stringify(rows)).not.toContain(secret);
  const content = `customer-signin-redacted.v1:${hash(l.path)}`;
  expect(rows[0]).toMatchObject({ immutable_content: content, content_hash: hash(content) });
 }, 600000);
 it("0789 returns the requested link directly while storing an independent reference and matching authorization hash", async () => {
  const a = await guide.locked();
  const { ShadowDemoGuideApplication } = await import("../../../apps/api/src/shadow-demo-guide.application.js");
  const result = await new ShadowDemoGuideApplication(f.runtime, a.sessionId, "synthetic_demo").issueCustomerLink(a.jobId, { version: "shadow-guide-customer-link.v1", customerId: a.customer }, hash);
  expect(result).toMatchObject({ version: "shadow-guide-customer-link-issued.v1", delivery: "simulated_delivery", realExternalActions: 0 });
  expect(result.path).toMatch(new RegExp(`^/customer/sign-in#${a.tenantId}/${a.jobId}/${a.customer}/[A-Za-z0-9_-]{43}$`));
  const secret = result.path.split("/").at(-1)!;
  const rows = (await f.admin.query("SELECT o.*,a.content_hash authorization_hash,g.token_digest FROM app.customer_portal_grant g JOIN app.action_outbox o ON(o.tenant_id,o.id)=(g.tenant_id,g.outbox_id) JOIN app.action_authorization a ON(a.tenant_id,a.id)=(o.tenant_id,o.authorization_id) WHERE g.tenant_id=$1 AND g.job_id=$2", [a.tenantId, a.jobId])).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0].immutable_content).toMatch(new RegExp(`^customer-signin-reference\\.v1:${a.tenantId}/${a.jobId}/${a.customer}/[A-Za-z0-9_-]{43}$`));
  expect(rows[0]).toMatchObject({ content_hash: hash(rows[0].immutable_content), authorization_hash: hash(rows[0].immutable_content), token_digest: hash(`customer-link:${secret}`) });
  expect(JSON.stringify(rows)).not.toContain("/customer/sign-in#");
  expect(JSON.stringify(rows)).not.toContain(secret);
 }, 600000);
 it("0789 redacts historical demo rows, revokes their grants and appends the 0533 security audit events once", async () => {
  const a = await guide.locked(), l = link(a, a.customer);
  const predecessor = await readFile(new URL("../migrations/0518_shadow_demo_guide.sql", import.meta.url), "utf8");
  const migration = await readFile(new URL("../migrations/0789_demo_customer_link_reference.sql", import.meta.url), "utf8");
  const original = predecessor.slice(predecessor.indexOf("CREATE FUNCTION app.demo_issue_customer_link("), predecessor.indexOf("ALTER FUNCTION app.demo_issue_customer_link")).replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
  let grant: string;
  try {
   // Recreate the actual predecessor writer, rather than manufacturing a plaintext outbox row.
   await f.admin.query(original);
   const issued = await issue(a, a.customer, a.digest, l.digest, l.path);
   expect(issued).toHaveProperty("ok");
   grant = issued.ok!.result;
   expect((await f.admin.query("SELECT o.immutable_content FROM app.customer_portal_grant g JOIN app.action_outbox o ON(o.tenant_id,o.id)=(g.tenant_id,g.outbox_id) WHERE g.tenant_id=$1 AND g.id=$2", [a.tenantId, grant])).rows[0].immutable_content).toBe(l.path);
  } finally { await f.admin.query(migration); }
  const content = `customer-signin-redacted.v1:${hash(l.path)}`;
  const stored = (await f.admin.query("SELECT o.*,g.revoked_at FROM app.customer_portal_grant g JOIN app.action_outbox o ON(o.tenant_id,o.id)=(g.tenant_id,g.outbox_id) WHERE g.tenant_id=$1 AND g.id=$2", [a.tenantId, grant!])).rows[0];
  expect(stored).toMatchObject({ immutable_content: content, content_hash: hash(content), status: "cancelled", revoked_at: expect.any(Date) });
  expect(JSON.stringify(stored)).not.toContain(l.path);
  expect(JSON.stringify(stored)).not.toContain(l.path.split("/").at(-1)!);
  const events = async () => (await f.admin.query("SELECT event_type,subject_ref,payload FROM app.audit_event WHERE tenant_id=$1 AND ((event_type='action_outbox.redacted' AND subject_ref=$2) OR (event_type='customer_portal.redacted' AND subject_ref=$3)) ORDER BY sequence", [a.tenantId, stored.id, grant!])).rows;
  const history = await events();
  expect(history).toHaveLength(2);
  expect(history[0]).toMatchObject({ event_type: "action_outbox.redacted", subject_ref: stored.id, payload: {
   references: { outboxId: stored.id }, hashes: { originalContentHash: hash(l.path), redactedContentHash: hash(content) }, classifications: { action: "security" }
  } });
  expect(history[1].event_type).toBe("customer_portal.redacted");
  expect(JSON.stringify(history)).not.toContain(l.path);
  await f.admin.query(migration);
  expect(await events()).toEqual(history);
 }, 600000);
 it("the migration is applied once and listed", async () => {
  expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name='0518_shadow_demo_guide.sql'")).rows[0].n).toBe(1);
  expect(await readFile(new URL("./migration-proofs/legacy-migrations.json", import.meta.url), "utf8")).toContain("0518_shadow_demo_guide.sql");
 });
 it("another practice user with a real session reaches the ownership check on all four helpers and changes nothing", async () => {
  const a = await guide.locked(), b = await guide.locked(), open = await seedFinalCheckJob(f), l = link(a, a.customer);
  expect(a.digest).not.toBe(b.digest);
  // Positive controls: the owner's own session gets past the same check, so the refusals below come from ownership.
  expect(await read("demo_source_hold_state", open, open.digest)).toMatchObject({ ok: { result: { state: "not_requested" } } });
  expect(await read("demo_shadow_review_inputs", a, a.digest)).toHaveProperty("ok");
  expect(await read("demo_shadow_review_inputs", b, b.digest)).toHaveProperty("ok");
  expect(await read("demo_source_hold_state", open, b.digest)).toEqual(forbidden);
  expect(await read("demo_request_source_hold", open, b.digest)).toEqual(forbidden);
  expect(await holds(open)).toBe(0);
  expect(await read("demo_shadow_review_inputs", a, b.digest)).toEqual(forbidden);
  expect(await read("demo_shadow_review_inputs", b, a.digest)).toEqual(forbidden);
  expect(await issue(a, a.customer, b.digest, l.digest, l.path)).toEqual(forbidden);
  expect(await grants(a)).toBe(0);
  const made = hash(randomUUID());
  expect(await read("demo_source_hold_state", open, made)).toEqual(forbidden);
 }, 600000);
 it("the link is refused before lock and before a found extra is confirmed", async () => {
  const early = await seedFinalCheckJob(f), customer = await guide.customerOf(early), e = link(early, customer);
  expect(await issue(early, customer, early.digest, e.digest, e.path)).toEqual({ refused: "CUSTOMER_REFUSED" });
  const unconfirmed = await seedFinalCheckJob(f); await availableFinalCheck(f, unconfirmed);
  const other = await guide.customerOf(unconfirmed), u = link(unconfirmed, other);
  expect(await issue(unconfirmed, other, unconfirmed.digest, u.digest, u.path)).toEqual({ refused: "CUSTOMER_REFUSED" });
  expect(await grants(early) + await grants(unconfirmed)).toBe(0);
 }, 600000);
 it("the link works once for the owner, only for this job's customer and exact path, by simulated delivery", async () => {
  const a = await guide.locked(), b = await guide.locked(), l = link(a, a.customer), lb = link(b, b.customer), crossed = link(a, b.customer);
  expect(await issue(a, b.customer, a.digest, crossed.digest, crossed.path)).toEqual({ refused: "CUSTOMER_REFUSED" });
  expect(await issue(a, a.customer, a.digest, l.digest, lb.path)).toEqual({ refused: "CUSTOMER_REFUSED" });
  expect(await issue(a, a.customer, a.digest, l.digest, `${l.path}https://elsewhere.invalid`)).toEqual({ refused: "CUSTOMER_REFUSED" });
  expect(await issue(a, a.customer, a.digest, "nothex", l.path)).toEqual({ refused: "CUSTOMER_REFUSED" });
  expect(await grants(a)).toBe(0);
  expect(await issue(a, a.customer, a.digest, l.digest, l.path)).toHaveProperty("ok");
  const outbox = (await f.admin.query("SELECT o.adapter,o.recipient FROM app.customer_portal_grant g JOIN app.action_outbox o ON(o.tenant_id,o.id)=(g.tenant_id,g.outbox_id) WHERE g.tenant_id=$1 AND g.job_id=$2", [a.tenantId, a.jobId])).rows;
  expect(outbox).toEqual([{ adapter: "fake_email", recipient: expect.stringMatching(/\.invalid$/u) }]);
  const again = link(a, a.customer);
  expect(await issue(a, a.customer, a.digest, again.digest, again.path)).toEqual({ refused: "CUSTOMER_LINK_RATE_LIMITED" });
  expect(await grants(a)).toBe(1);
 }, 600000);
 it("the link is refused for a customer with a real-looking email", async () => {
  const a = await guide.locked(), l = link(a, a.customer), db = await f.admin.connect();
  try {
   await db.query("BEGIN"); await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("UPDATE app.customer_revision SET payload=jsonb_set(payload,'{email}','\"someone@example.com\"') WHERE tenant_id=$1 AND customer_id=$2", [a.tenantId, a.customer]);
   await db.query("COMMIT");
  } finally { db.release(); }
  expect(await issue(a, a.customer, a.digest, l.digest, l.path)).toEqual({ refused: "CUSTOMER_REFUSED" });
  expect(await grants(a)).toBe(0);
 }, 600000);
 it("review inputs refuse before lock, hide unconfirmed findings, and show only the owner's confirmed extra", async () => {
  const early = await seedFinalCheckJob(f);
  expect(await read("demo_shadow_review_inputs", early, early.digest)).toEqual({ refused: "FINAL_ACCOUNT_LOCK_REQUIRED" });
  const held = await seedFinalCheckJob(f); await availableFinalCheck(f, held);
  expect(await read("demo_shadow_review_inputs", held, held.digest)).toMatchObject({ ok: { result: { cases: [] } } });
  const a = await guide.locked();
  // Confirmed and priced by the fixture directly, so no recovery case exists and nothing is named.
  expect(await read("demo_shadow_review_inputs", a, a.digest)).toMatchObject({ ok: { result: { cases: [] } } });
  // A real case, on a job that also holds a finding the check did not reveal.
  const x = await realReceiptFixture(f, "F7", 3360000, true), other = await realReceiptFixture(f);
  const real = { context: x.context, tenantId: x.context.tenantId, jobId: x.jobId };
  const mine = await read("demo_shadow_review_inputs", real, x.auth.digest);
  expect(JSON.stringify(mine)).toContain(x.workId);
  const hidden = (await f.admin.query("SELECT work_id FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND id=$3", [real.tenantId, x.jobId, x.hiddenSignal])).rows[0].work_id as string;
  expect(hidden).not.toBe(x.workId);
  expect(JSON.stringify(mine)).not.toContain(hidden);
  expect(await read("demo_shadow_review_inputs", real, other.auth.digest)).toEqual(forbidden);
  expect(await attempt(a, "SELECT app.final_lock_hash('{}'::jsonb)", [])).toHaveProperty("refused");
  expect(await attempt(a, "SELECT count(*) FROM app.shadow_commercial_signal WHERE tenant_id=$1", [a.tenantId])).toHaveProperty("refused");
 }, 600000);
 it("source hold answers only asked or finished, keeps one open request, and refuses after lock", async () => {
  const a = await seedFinalCheckJob(f);
  const answers = await Promise.all(Array.from({ length: 3 }, () => read("demo_request_source_hold", a, a.digest)));
  for (const answer of answers) expect(answer).toEqual({ ok: { result: { version: "demo-source-hold.v1", state: "requested", realExternalActions: 0 } } });
  expect(await read("demo_source_hold_state", a, a.digest)).toEqual({ ok: { result: { version: "demo-source-hold.v1", state: "requested", realExternalActions: 0 } } });
  const locked = await guide.locked();
  expect(await read("demo_request_source_hold", locked, locked.digest)).toEqual({ refused: "DEMO_SOURCE_HOLD_LOCKED" });
  expect(await holds(locked)).toBe(0);
 }, 600000);
 it("only the runtime role may execute the helpers and only the worker role may read the request queue", async () => {
  for (const signature of ["app.demo_request_source_hold(uuid,uuid,text)", "app.demo_source_hold_state(uuid,uuid,text)", "app.demo_shadow_review_inputs(uuid,uuid,text)", "app.demo_issue_customer_link(uuid,uuid,uuid,text,text,text)"]) {
   const row = (await f.admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') runtime,has_function_privilege('jobguard_shadow',$1,'EXECUTE') shadow,has_function_privilege('jobguard_infrastructure',$1,'EXECUTE') infrastructure,has_function_privilege('public',$1,'EXECUTE') public", [signature])).rows[0];
   expect(row).toEqual({ runtime: true, shadow: false, infrastructure: false, public: false });
  }
  expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime','infrastructure.demo_source_hold_request','SELECT') runtime,has_table_privilege('jobguard_infrastructure','infrastructure.demo_source_hold_request','UPDATE') worker,has_table_privilege('jobguard_infrastructure','infrastructure.demo_source_hold_request','DELETE') removes")).rows[0]).toEqual({ runtime: false, worker: true, removes: false });
 });
});
