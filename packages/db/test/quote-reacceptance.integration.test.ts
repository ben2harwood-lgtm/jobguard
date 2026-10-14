import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, DEMO_TENANT_ID as T, DEMO_MEMBERSHIP_ID as M, QuoteAcceptanceRepository, PracticeActivationRepository, prepareActivationFixtureV3 } from "../src/index.js";
import { freePort, closeTestPools } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { rolledBack } from "./upgrade-proof-utils.js";

// QUOTE-REACCEPT (audit finding 5; founder decisions 21-23, 14 Oct 2026). Synthetic data only, real PostgreSQL, runtime login, demo owner.
const context = testTenantContext(T), original = process.env.JOBGUARD_ENV;
let pg: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string, acceptance: QuoteAcceptanceRepository;
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  dir = await mkdtemp(join(tmpdir(), "quote-reaccept-pg-"));
  const port = await freePort(57500, 200);
  pg = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await pg.initialise(); await pg.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic" });
  await migrate(admin);
  await admin.query(`INSERT INTO control_plane.tenant(id)VALUES('${T}');INSERT INTO identity.identity_user(id)VALUES('d1550000-0000-4000-8000-000000000001');INSERT INTO app.account(id,tenant_id,name)VALUES('d1550000-0000-4000-8000-000000000002','${T}','Synthetic');INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES('${M}','${T}','d1550000-0000-4000-8000-000000000002','d1550000-0000-4000-8000-000000000001','owner');CREATE ROLE rq_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS;GRANT jobguard_runtime TO rq_login;`);
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "rq_login", password: "synthetic", max: 6 });
  acceptance = new QuoteAcceptanceRepository(runtime);
}, 90_000);
afterAll(async () => {
  await closeTestPools(runtime, admin); await pg?.stop(); await rm(dir, { recursive: true, force: true });
  if (original === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = original;
});

/** A job the merged fixture accepts through the real repository: returns the accepted exact document. */
async function accepted(name: string) {
  const job = await prepareActivationFixtureV3(admin, context, name, 100000, runtime);
  const view = await acceptance.view(context, job), a = view.activeAcceptance!;
  return { job, documentId: a.documentId, documentVersion: a.documentVersion, documentHash: a.documentHash };
}
type Doc = Awaited<ReturnType<typeof accepted>>;
const cancel = (d: Doc, at = "2026-10-02T09:00:00.000Z") => acceptance.disposition(context, d.job, { commandId: randomUUID(), documentId: d.documentId, documentHash: d.documentHash, documentVersion: d.documentVersion, kind: "acceptance_cancelled", occurredAt: at });
const accept = (d: Doc, fields: { name?: string; method?: "verbal" | "email" | "message" | "signed-paper"; at?: string; commandId?: string } = {}) => acceptance.accept(context, d.job, { commandId: fields.commandId ?? randomUUID(), documentId: d.documentId, documentHash: d.documentHash, documentVersion: d.documentVersion, statedCustomerName: fields.name ?? "Practice Customer", statedMethod: fields.method ?? "email", acceptedAt: fields.at ?? "2026-10-02T10:00:00.000Z" });
const acceptances = async (job: string) => (await admin.query(`SELECT a.*,s.acceptance_sequence,s.replaces_acceptance_id FROM app.quote_acceptance a LEFT JOIN app.quote_acceptance_sequence s ON(s.tenant_id,s.acceptance_id)=(a.tenant_id,a.id) WHERE a.tenant_id=$1 AND a.job_id=$2 ORDER BY coalesce(s.acceptance_sequence,1)`, [T, job])).rows;
const kinds = (view: { events: { kind: string }[] }) => view.events.map(e => e.kind);

describe("quote re-acceptance after cancellation", () => {
  it("reaccepts unchanged terms after explicit cancellation", async () => {
    const d = await accepted("reaccept-audit");
    const first = (await admin.query("SELECT id FROM app.quote_acceptance WHERE tenant_id=$1 AND job_id=$2", [T, d.job])).rows[0]!;
    const cancelled = await cancel(d);
    expect(cancelled).toMatchObject({ jobStatus: "quoting", activeAcceptance: null });
    const again = await accept(d);
    expect(again.jobStatus).toBe("accepted");
    expect(again.activeAcceptance).toMatchObject({ documentId: d.documentId, documentVersion: d.documentVersion, documentHash: d.documentHash });
    expect(again.activeAcceptance!.id).not.toBe(first.id);
    expect(kinds(again)).toEqual(["accepted", "acceptance_cancelled", "accepted"]);
    const rows = await acceptances(d.job);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.id).toBe(first.id);
    expect((await admin.query("SELECT accepted_quote_version_id FROM app.job WHERE tenant_id=$1 AND id=$2", [T, d.job])).rows[0].accepted_quote_version_id).toBe(d.documentId);
  });

  it("records fresh customer details, copies nothing, and leaves the first record untouched", async () => {
    const d = await accepted("reaccept-fresh");
    const before = (await admin.query("SELECT row_to_json(a)::text bytes FROM app.quote_acceptance a WHERE tenant_id=$1 AND job_id=$2", [T, d.job])).rows[0].bytes;
    await cancel(d);
    const view = await accept(d, { name: "Second Customer Name", method: "signed-paper", at: "2026-10-03T11:30:00.000Z" });
    expect(view.activeAcceptance).toMatchObject({ statedCustomerName: "Second Customer Name", method: "signed-paper", acceptedAt: "2026-10-03T11:30:00.000Z" });
    const [one, two] = await acceptances(d.job);
    expect(one).toMatchObject({ stated_customer_name: "Practice Customer", stated_method: "email", acceptance_sequence: 1, replaces_acceptance_id: null });
    expect(two).toMatchObject({ stated_customer_name: "Second Customer Name", stated_method: "signed-paper", acceptance_sequence: 2, replaces_acceptance_id: one.id });
    expect((await admin.query("SELECT row_to_json(a)::text bytes FROM app.quote_acceptance a WHERE tenant_id=$1 AND id=$2", [T, one.id])).rows[0].bytes).toBe(before);
    const ids = (await admin.query("SELECT acceptance_id FROM app.acceptance_event WHERE tenant_id=$1 AND job_id=$2 AND kind IN('accepted','acceptance_cancelled') ORDER BY recorded_at,id", [T, d.job])).rows.map(r => r.acceptance_id);
    expect(ids).toEqual([one.id, one.id, two.id]);
    await expect(admin.query("UPDATE app.quote_acceptance_sequence SET acceptance_sequence=9 WHERE tenant_id=$1", [T])).rejects.toBeTruthy();
    await expect(admin.query("DELETE FROM app.quote_acceptance_sequence WHERE tenant_id=$1", [T])).rejects.toBeTruthy();
    await expect(withRuntime("INSERT INTO app.quote_acceptance_sequence(tenant_id,job_id,document_id,acceptance_id,acceptance_sequence,replaces_acceptance_id) VALUES($1,$2,$3,$4,3,$5)", [T, d.job, d.documentId, randomUUID(), one.id])).rejects.toMatchObject({ code: "42501" });
  });

  it("allows a second cancellation and third acceptance, each under its own key, and refuses a duplicate while accepted", async () => {
    const d = await accepted("reaccept-three");
    await cancel(d); await accept(d, { name: "Second" });
    await expect(accept(d, { name: "Third while live" })).rejects.toMatchObject({ code: "22023" });
    const cancelled = await cancel(d, "2026-10-04T09:00:00.000Z");
    expect(kinds(cancelled)).toEqual(["accepted", "acceptance_cancelled", "accepted", "acceptance_cancelled"]);
    const third = await accept(d, { name: "Third", at: "2026-10-04T10:00:00.000Z" });
    expect(third.jobStatus).toBe("accepted");
    const rows = await acceptances(d.job);
    expect(rows.map(r => r.stated_customer_name)).toEqual(["Practice Customer", "Second", "Third"]);
    expect(rows.map(r => r.acceptance_sequence)).toEqual([1, 2, 3]);
    expect(third.activeAcceptance!.statedCustomerName).toBe("Third");
    expect((await admin.query("SELECT array_agg(a.stated_customer_name ORDER BY a.recorded_at) n FROM app.acceptance_event e JOIN app.quote_acceptance a ON(a.tenant_id,a.id)=(e.tenant_id,e.acceptance_id) WHERE e.tenant_id=$1 AND e.job_id=$2 AND e.kind='acceptance_cancelled'", [T, d.job])).rows[0].n).toEqual(["Practice Customer", "Second"]);
  });

  it("two simultaneous re-acceptances: exactly one wins", async () => {
    const d = await accepted("reaccept-race");
    await cancel(d);
    const results = await Promise.allSettled([accept(d, { name: "Racer A" }), accept(d, { name: "Racer B" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(["40001", "22023", "COMMAND_CONFLICT"]).toContain(lost.reason.code ?? lost.reason.message);
    const rows = await acceptances(d.job);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.acceptance_sequence)).toEqual([1, 2]);
    expect((await admin.query("SELECT count(*)::int n FROM app.acceptance_event WHERE tenant_id=$1 AND job_id=$2 AND kind='accepted'", [T, d.job])).rows[0].n).toBe(2);
    expect((await admin.query("SELECT status,revision FROM app.job WHERE tenant_id=$1 AND id=$2", [T, d.job])).rows[0]).toMatchObject({ status: "accepted" });
  });

  it("replaying an acceptance command after a later re-acceptance changes nothing; a changed replay conflicts", async () => {
    const d = await accepted("reaccept-replay");
    const id = randomUUID();
    await cancel(d); await accept(d, { commandId: id, name: "Replay One" });
    const count = async () => (await admin.query("SELECT (SELECT count(*)::int FROM app.quote_acceptance WHERE job_id=$1) a,(SELECT count(*)::int FROM app.command_receipt WHERE tenant_id=$2) r", [d.job, T])).rows[0];
    const before = await count();
    await expect(accept(d, { commandId: id, name: "Replay One" })).resolves.toMatchObject({ jobStatus: "accepted" });
    expect(await count()).toEqual(before);
    await expect(accept(d, { commandId: id, name: "Changed Name" })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    expect(await count()).toEqual(before);
  });

  it("accept, cancel, accept, then switch live uses the re-accepted document; cancel and re-accept are refused once live", async () => {
    const d = await accepted("reaccept-live");
    await cancel(d); await accept(d, { name: "Live Customer" });
    const activation = new PracticeActivationRepository(runtime);
    await activation.start(context, d.job, { commandId: randomUUID(), scenario: "no_charge" });
    const live = await activation.view(context, d.job);
    expect(live.jobStatus).toBe("live");
    expect(live.activation).toMatchObject({ acceptedDocumentId: d.documentId, acceptedDocumentHash: d.documentHash });
    const view = await acceptance.view(context, d.job);
    expect(view.activeAcceptance).toMatchObject({ statedCustomerName: "Live Customer" });
    const rows = await acceptances(d.job);
    expect(rows).toHaveLength(2);
    expect(rows[1]!.acceptance_sequence).toBe(2);
    await expect(cancel(d, "2026-10-05T09:00:00.000Z")).rejects.toMatchObject({ code: "22023" });
    await expect(accept(d)).rejects.toBeTruthy();
    expect(await acceptances(d.job)).toHaveLength(2);
  });

  it("refuses re-acceptance once any customer invoice, credit note or payment exists on the job", async () => {
    const authorization = randomUUID(), invoice = randomUUID();
    for (const kind of ["invoice", "credit_note", "payment"] as const) {
      const d = await accepted(`reaccept-billed-${kind}`);
      await cancel(d);
      const before = await acceptances(d.job);
      await rolledBack(admin, async db => {
        await db.query("SELECT set_config('app.tenant_id',$1,true)", [T]);
        await db.query("SET LOCAL session_replication_role=replica");
        await db.query("INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark) VALUES($1,$2,$3,$4,$5,$6,'2026-10-01','{}','candidate_m1_standard_v1','GBP',100,20,120,$7,$7,'\\x00',true,'SYNTHETIC - NOT A REAL INVOICE')", [invoice, T, kind === "invoice" ? d.job : randomUUID(), randomUUID(), authorization, `RQ-${kind}`, "a".repeat(64)]);
        if (kind === "invoice") { /* the invoice row itself is the billing fact */ }
        else if (kind === "credit_note") await db.query("INSERT INTO app.customer_credit_note(id,tenant_id,job_id,invoice_id,authorization_id,credit_number,amount_pence,currency,reason,net_pence,tax_pence,total_pence) VALUES($1,$2,$3,$4,$5,'RQ-CN-1',120,'GBP','synthetic',-100,-20,-120)", [randomUUID(), T, d.job, invoice, authorization]);
        else await db.query("INSERT INTO app.customer_payment(id,tenant_id,job_id,invoice_id,authorization_id,paid_on,amount_pence,currency,method,reference,builder_attested,provenance) VALUES($1,$2,$3,$4,$5,'2026-10-02',120,'GBP','cash','RQ-PAY-1',true,'manual_builder_attestation')", [randomUUID(), T, d.job, invoice, authorization]);
        const total = (await db.query("SELECT (snapshot->>'totalPence')::bigint t FROM app.quote_document_version WHERE tenant_id=$1 AND id=$2", [T, d.documentId])).rows[0].t;
        const revision = (await db.query("SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2", [T, d.job])).rows[0].revision;
        await expect(db.query("SELECT * FROM app.record_builder_attested_acceptance($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Fictional customer','email',clock_timestamp(),NULL)", [T, randomUUID(), randomUUID(), d.job, d.documentId, d.documentVersion, d.documentHash, total, revision, M])).rejects.toMatchObject({ code: "22023", message: expect.stringContaining("customer billing exists") });
      });
      expect(await acceptances(d.job)).toEqual(before);
    }
    // control: no billing, same state, accepts.
    const clean = await accepted("reaccept-billed-control"); await cancel(clean);
    expect((await accept(clean)).jobStatus).toBe("accepted");
  });

  it("the routine and catalog hold: same signature, owner and ACL; side table is RLS-forced, owned by the migration role, read-only to runtime", async () => {
    const fns = (await admin.query(`SELECT p.proname,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN('record_builder_attested_acceptance','record_quote_disposition') ORDER BY 1`)).rows;
    expect(fns).toHaveLength(2);
    for (const f of fns) { expect(f.owner).toBe("jobguard_migration"); expect(f.prosecdef).toBe(true); expect(f.proconfig).toEqual(["search_path=pg_catalog, app"]); expect(f.acl).toMatch(/jobguard_runtime=X/); expect(f.acl).not.toMatch(/^\{=X/); }
    const t = (await admin.query(`SELECT pg_get_userbyid(relowner) owner,relrowsecurity,relforcerowsecurity,relacl::text acl FROM pg_class WHERE oid='app.quote_acceptance_sequence'::regclass`)).rows[0];
    expect(t).toMatchObject({ owner: "jobguard_migration", relrowsecurity: true, relforcerowsecurity: true });
    expect(t.acl).toMatch(/jobguard_runtime=r\//);
    const priv = (await admin.query(`SELECT string_agg(privilege_type,',' ORDER BY privilege_type) p FROM information_schema.role_table_grants WHERE table_schema='app' AND table_name='quote_acceptance_sequence' AND grantee='jobguard_runtime'`)).rows[0].p;
    expect(priv).toBe("SELECT");
    expect((await admin.query(`SELECT 1 FROM pg_constraint WHERE conrelid='app.quote_acceptance'::regclass AND contype='u' AND conkey=(SELECT array_agg(attnum ORDER BY attnum) FROM pg_attribute WHERE attrelid='app.quote_acceptance'::regclass AND attname IN('tenant_id','job_id','document_id'))`)).rowCount).toBe(0);
    expect((await admin.query(`SELECT array_agg(attname::text ORDER BY attnum) c FROM pg_attribute WHERE attrelid='app.quote_acceptance'::regclass AND attnum>0 AND NOT attisdropped`)).rows[0].c).toEqual(["id", "tenant_id", "job_id", "document_id", "document_version", "document_hash", "accepted_total_pence", "currency", "acceptance_kind", "actor_membership_id", "stated_customer_name", "stated_method", "accepted_at", "evidence_id", "recorded_at"]);
  });
});

async function withRuntime(sql: string, values: unknown[]) {
  const client = await runtime.connect();
  try { await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [T]); return await client.query(sql, values); }
  finally { await client.query("ROLLBACK"); client.release(); }
}
