import { RecordBuilderAcceptanceMutation, RecordQuoteDispositionMutation } from "./lp3-legacy-fixtures.js";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MIGRATION_URLS, QuoteRepository, QuoteDocumentRepository, IssueQuoteMutation,
  UserCommandDispatcher,
  withTenant, type ConsequentialCommand,
} from "../src/index.js";
import { clusterBefore } from "./site-extra-pricing-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const own = "0153_quote_supersession_guard.sql";
let c: Awaited<ReturnType<typeof clusterBefore>>;
const expiresAt = new Date("2099-01-01T00:00:00Z");
async function issued() {
  const tenant = randomUUID(), member = randomUUID(), account = randomUUID(), user = randomUUID();
  const job = randomUUID(), scope = randomUUID(), revisionId = randomUUID(), draft = randomUUID();
  await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await c.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await c.admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional MIGFIX builder')", [tenant, account]);
  await c.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [tenant, member, account, user]);
  const context = testTenantContext(tenant);
  await withTenant(c.runtime, context, async db => {
    await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional quote','quoting')", [tenant, job]);
    await db.$client.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')", [tenant, scope, job]);
    await db.$client.query("INSERT INTO app.scope_revision(tenant_id,id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fit cabinet','1','each',10000,10000)", [tenant, revisionId, job, scope]);
  });
  const priced = await new QuoteRepository(c.runtime).saveDraft(context, {
    jobId: job, draftId: draft, expectedRevision: 0, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1",
    blockingQuestions: [], effectiveAt: new Date("2026-10-01T10:00:00Z"),
    lines: [{ id: randomUUID(), scopeItemId: scope, scopeRevisionId: revisionId, description: "Fit cabinet", origin: "captured",
      included: true, exclusionReason: null, quantity: "1", unit: "each", unitRatePence: 10000,
      discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: "Joinery", region: "London" }],
  });
  const document = randomUUID();
  const artifact = await new QuoteDocumentRepository(c.runtime).create(context, {
    jobId: job, documentId: document, quoteRevisionId: priced.id, objectVersionId: "fictional-immutable-v1",
    document: { schemaVersion: "quote-document.v1", documentVersion: 1, reference: "Q-MIGFIX-4", quoteRevisionId: priced.id,
      currency: "GBP", issuer: { name: "Fictional builder", address: ["1 Fictional Street"], email: "builder@example.invalid" },
      customer: { name: "Fictional customer", address: ["2 Fictional Street"], email: "customer@example.invalid" },
      lines: [{ scopeItemId: scope, description: "Fit cabinet", quantity: "1", unit: "each", netPence: 10000 }],
      exclusions: [], qualifications: ["Synthetic only"], subtotalPence: 10000, discountPence: 0, netPence: 10000, taxPence: 2000, totalPence: 12000 },
  });
  const hash = artifact.content_hash, dispatcher = new UserCommandDispatcher(c.admin);
  await dispatcher.dispatch(context, {
    version: "command.v1", commandId: randomUUID(), commandType: "quote.issue", semanticKey: `issue:${document}`,
    actorMembershipId: member, subjectType: "quote_document", subjectRef: document, authorizationId: randomUUID(),
    action: { actionType: "quote.send", recipient: JSON.stringify(["customer@example.invalid"]), contentHash: hash,
      aggregateRevision: 1, amountPence: null, currency: null, policyVersion: "free-quote-send.v1", expiresAt },
  }, new IssueQuoteMutation({ tenantId: tenant, jobId: job, documentId: document, outboxActionId: randomUUID(),
    recipients: ["customer@example.invalid"], immutableContent: new TextDecoder().decode(artifact.pdf) }));
  return { tenant, member, job, document, hash, context, dispatcher };
}
type Fixture = Awaited<ReturnType<typeof issued>>;
function acceptance(f: Fixture, expected = 0, method: "verbal" | "email" | "message" | "signed-paper" = "email") {
  const command: ConsequentialCommand = { version: "command.v1", commandId: randomUUID(), commandType: "quote.acceptance.attest",
    semanticKey: `accept:${f.document}`, actorMembershipId: f.member, subjectType: "quote_document", subjectRef: f.document,
    action: { actionType: "quote.acceptance.attest", recipient: "Fictional customer", contentHash: f.hash, aggregateRevision: 1,
      amountPence: 12000, currency: "GBP", policyVersion: "builder-attestation.v1", expiresAt } };
  const input = { version: "quote-acceptance.v1", acceptanceId: randomUUID(), jobId: f.job, documentId: f.document,
    documentVersion: 1, documentHash: f.hash, expectedJobRevision: expected, acceptedTotalPence: 12000,
    acceptedAt: new Date("2026-10-01T12:00:00Z"), statedCustomerName: "Fictional customer", statedMethod: method, evidenceId: null };
  return { command, input, mutation: new RecordBuilderAcceptanceMutation(f.tenant, input) };
}
function disposition(f: Fixture, expected = 0, kind: "superseded" | "acceptance_cancelled" | "declined" = "superseded") {
  const command: ConsequentialCommand = { version: "command.v1", commandId: randomUUID(), commandType: `quote.${kind}`,
    semanticKey: `${kind}:${f.document}`, actorMembershipId: f.member, subjectType: "quote_document", subjectRef: f.document,
    action: { actionType: `quote.${kind}`, recipient: null, contentHash: f.hash, aggregateRevision: 1,
      amountPence: null, currency: null, policyVersion: "quote-disposition.v1", expiresAt } };
  const input = { version: "quote-disposition.v1", eventId: randomUUID(), jobId: f.job, documentId: f.document,
    documentVersion: 1, documentHash: f.hash, expectedJobRevision: expected, kind, occurredAt: new Date("2026-10-01T13:00:00Z") };
  return { command, input, mutation: new RecordQuoteDispositionMutation(f.tenant, input) };
}
async function state(f: Fixture) {
  return (await c.admin.query(`SELECT status,revision,accepted_quote_version_id,
    (SELECT count(*)::int FROM app.quote_acceptance WHERE tenant_id=$1 AND job_id=$2) AS acceptances,
    (SELECT count(*)::int FROM app.acceptance_event WHERE tenant_id=$1 AND job_id=$2 AND kind='accepted') AS accepted_events,
    (SELECT count(*)::int FROM app.acceptance_event WHERE tenant_id=$1 AND job_id=$2 AND kind='superseded') AS superseded_events
    FROM app.job WHERE tenant_id=$1 AND id=$2`, [f.tenant, f.job])).rows[0]!;
}
async function execute(f: Fixture, action: ReturnType<typeof acceptance> | ReturnType<typeof disposition>) {
  return f.dispatcher.dispatch(f.context, action.command, action.mutation);
}

import { proofBefore, proofColumns, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";
const tables = ["app.job", "app.quote_draft", "app.quote_revision", "app.quote_line", "app.quote_document_version", "app.quote_send",
  "app.quote_version", "app.quote_acceptance", "app.acceptance_event", "app.command_receipt", "app.decision", "app.decision_resolution", "app.action_authorization", "app.action_outbox", "app.audit_event"];
let accepted: Fixture, superseded: Fixture;
let proof: Awaited<ReturnType<typeof proofBefore>>;
async function catalogue() {
  return {
    tables: (await c.admin.query(`SELECT c.oid::regclass::text name,pg_get_userbyid(c.relowner) owner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c WHERE c.relnamespace::regnamespace::text IN ('app','identity','control_plane','audit_control','infrastructure') AND c.relkind IN ('r','v','S') ORDER BY name`)).rows,
    policies: (await c.admin.query("SELECT * FROM pg_policies WHERE schemaname IN ('app','identity','control_plane','audit_control','infrastructure') ORDER BY schemaname,tablename,policyname")).rows,
    constraints: (await c.admin.query(`SELECT conrelid::regclass::text name,conname,pg_get_constraintdef(oid) definition FROM pg_constraint
      WHERE connamespace::regnamespace::text IN ('app','identity','control_plane','audit_control','infrastructure') ORDER BY name,conname`)).rows,
    triggers: (await c.admin.query(`SELECT tgrelid::regclass::text name,tgname,pg_get_triggerdef(oid) definition FROM pg_trigger
      WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace::regnamespace::text IN ('app','identity','control_plane','audit_control','infrastructure')) ORDER BY name,tgname`)).rows,
    roles: (await c.admin.query("SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname LIKE 'jobguard_%' ORDER BY rolname")).rows,
    routines: (await c.admin.query(`SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,p.proacl::text,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition
      FROM pg_proc p WHERE p.pronamespace::regnamespace::text IN ('app','identity','control_plane','audit_control','infrastructure') AND p.prokind IN ('f','p') ORDER BY signature`)).rows,
  };
}
beforeAll(async () => {
  c = await clusterBefore(own); accepted = await issued(); superseded = await issued();
  await execute(accepted, acceptance(accepted)); await execute(superseded, disposition(superseded));
  proof = await proofBefore(c.admin, tables);
}, 120_000);
afterAll(async () => { await c?.close(); });

describe("MIGFIX-4 populated 0153 upgrade proof", () => {
  it("[MIGFIX-4.upgrade] applies 0153 alone as migration owner, repeats it, preserves existing rows/types/identities and catalogue privileges", async () => {
    const names = MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!);
    expect(names).toContain(own); expect(names).toEqual([...names].sort()); expect(new Set(names).size).toBe(names.length);
    for (const table of tables) expect(Object.keys(proof[table]!.rows).length, `${table} has pre-existing rows`).toBeGreaterThan(0);
    expect((await c.admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r => r.migration_name)).toEqual(names.filter(name => name < own));
    const before = await catalogue();
    const sql = await readFile(MIGRATION_URLS.find(url => url.pathname.endsWith(own))!, "utf8");
    const db = await c.admin.connect();
    try {
      await db.query("SET ROLE jobguard_migration");
      await db.query(sql); await db.query(sql);
    } finally { await db.query("RESET ROLE"); db.release(); }
    await c.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [own]);
    expect(await proofDifferences(c.admin, proof)).toEqual({ rows: [], types: [] });
    const after = await catalogue();
    for (const key of ["tables", "policies", "constraints", "triggers", "roles"] as const) expect(after[key]).toEqual(before[key]);
    const changed = before.routines.filter(r => after.routines.find(s => s.signature === r.signature)?.definition !== r.definition);
    expect(changed.map(r => r.signature.split("(")[0]).sort()).toEqual(["app.record_builder_attested_acceptance", "app.record_quote_disposition"]);
    expect(after.routines.map(({ definition: _definition, ...r }) => r)).toEqual(before.routines.map(({ definition: _definition, ...r }) => r));
    for (const table of tables) expect((await proofColumns(c.admin, table)).map(r => r.name)).toEqual(proof[table]!.names);
    for (const table of ["quote_acceptance", "acceptance_event"]) {
      expect((await c.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'SELECT') readable,has_table_privilege('jobguard_runtime',$1,'INSERT,UPDATE,DELETE,TRUNCATE') writable", [`app.${table}`])).rows[0]).toEqual({ readable: true, writable: false });
    }
  });
  it("[MIGFIX-4.upgrade] applies every later migration successfully twice and compares only named pre-existing columns and identities", async () => {
    await c.migrate(); await c.migrate();
    expect(await proofDifferences(c.admin, proof)).toEqual({ rows: [], types: [] });
    expect((await c.admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r => r.migration_name)).toEqual(c.names);
  });
  it("[MIGFIX-4.upgrade] one-microsecond stored time change fails the same canonical comparison (rolled back)", async () => {
    await rolledBack(c.admin, async db => {
      await db.query("SET LOCAL session_replication_role=replica");
      await db.query("UPDATE app.quote_acceptance SET accepted_at=accepted_at+interval '1 microsecond' WHERE tenant_id=$1", [accepted.tenant]);
      expect((await proofDifferences(db, proof)).rows.some(row => row.startsWith("app.quote_acceptance") && row.endsWith("changed"))).toBe(true);
    });
    expect(await proofDifferences(c.admin, proof)).toEqual({ rows: [], types: [] });
  });
  it("[MIGFIX-4.upgrade] a retype fails even when serialised values match (rolled back)", async () => {
    await rolledBack(c.admin, async db => {
      await db.query("ALTER TABLE app.quote_draft ALTER COLUMN revision TYPE bigint");
      const differences = await proofDifferences(db, proof);
      expect(differences.rows).toEqual([]); expect(differences.types).toContain("app.quote_draft: revision integer -> bigint");
    });
  });
  it("[MIGFIX-4.upgrade] a later nullable column and replaced function pass (rolled back)", async () => {
    await rolledBack(c.admin, async db => {
      await db.query("ALTER TABLE app.quote_draft ADD COLUMN upgrade_control text");
      expect(await scratchReplaceFunction(db, "app.record_quote_disposition(uuid,uuid,uuid,uuid,integer,character,integer,uuid,character varying,timestamp with time zone)")).toBe(true);
      expect(await proofDifferences(db, proof)).toEqual({ rows: [], types: [] });
    });
  });
  it("[MIGFIX-4.upgrade] a later inserted row is ignored while every original row must remain (rolled back)", async () => {
    await rolledBack(c.admin, async db => {
      await db.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional later insert','quoting')", [accepted.tenant, randomUUID()]);
      expect(await proofDifferences(db, proof)).toEqual({ rows: [], types: [] });
    });
  });
  it("[MIGFIX-4.2] old supersession facts refuse acceptance after upgrade without rewriting them", async () => {
    const revision = (await state(superseded)).revision as number;
    await expect(execute(superseded, acceptance(superseded, revision))).rejects.toMatchObject({ code: "22023", message: "superseded exact quote" });
    expect(await proofDifferences(c.admin, proof)).toEqual({ rows: [], types: [] });
  });
});
