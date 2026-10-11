import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EvidencePackRepository, MIGRATION_URLS, RecoveryMessageRepository, migrate, verifyAuditChain,
  type RecoveryMessageActor, type RecoveryMessageState, type VerifiedTenantContext,
} from "../src/index.js";
import { closeTestPools, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

// Real populated 0111 -> 0112 -> 0115 upgrade, not a fresh-install substitute or ORM mock.
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
let repo: RecoveryMessageRepository;
const nameOf = (url: URL) => fileURLToPath(url).split("/").at(-1)!;
const repairName = "0115_recovery_follow_up_repair.sql";
type LegacyCase = { context: VerifiedTenantContext; caseId: string; actor: RecoveryMessageActor; view: NonNullable<RecoveryMessageState["latest"]> };
const legacy: Partial<Record<"previewed" | "queued" | "unknown" | "delivered" | "revoked", LegacyCase>> = {};
const approve = (view: LegacyCase["view"]) => ({ version: "recovery-message-command.v1", action: "approve", commandId: randomUUID(),
  messageId: view.id, expectedRevision: view.revision, recipient: view.message.recipient, body: view.message.body,
  amountPence: view.message.amountPence, packId: view.message.packId, contentHash: view.message.contentHash });
const command = (action: "advance" | "revoke" | "reconcile", view: LegacyCase["view"], outcome: "success" | "response_lost" = "success") => ({
  version: "recovery-message-command.v1", action, commandId: randomUUID(), messageId: view.id, expectedRevision: view.revision,
  ...(action === "advance" ? { outcome } : {}),
});
async function preview(item: LegacyCase) {
  const ready = await repo.read(item.context, item.caseId);
  return repo.preview(item.context, item.caseId, { version: "recovery-message-preview.v1", commandId: randomUUID(),
    expectedCaseRevision: ready.readiness.caseRevision, packId: ready.readiness.packId! }, item.actor);
}

async function verifyChains() {
  const verified = new Set<string>();
  for (const item of Object.values(legacy)) {
    if (verified.has(item.context.tenantId)) continue;
    verified.add(item.context.tenantId);
    const rows = (await admin.query(`SELECT id,tenant_id AS "tenantId",sequence::int,version,actor_ref AS "actorRef",
      event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,
      trim(payload_hash) AS "payloadHash",trim(previous_hash) AS "previousHash",trim(event_hash) AS "eventHash"
      FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [item.context.tenantId])).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(() => verifyAuditChain(rows)).not.toThrow();
  }
}

// Capture every column of every pre-existing business/identity/control/infrastructure/audit table, including immutable content,
// bytea artifacts, approvals, attempts, outbox state and the restricted audit head. Text is compared exactly, not selected-field hashes.
async function tableNames() {
  return (await admin.query(`SELECT quote_ident(n.nspname)||'.'||quote_ident(c.relname) AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r'
    AND n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') ORDER BY 1`)).rows.map(row => row.name as string);
}
async function rowsOf(names: string[]) {
  const snapshots: Record<string, string[]> = Object.fromEntries(names.map(name => [name, []]));
  const sql = names.map(name => `SELECT '${name.replaceAll("'", "''")}' AS table_name,row_to_json(t)::text AS bytes,
    xmin::text AS xmin_value,ctid::text AS ctid_value FROM ${name} t`).join(" UNION ALL ");
  const rows = (await admin.query(`SELECT * FROM (${sql}) snapshot ORDER BY table_name,bytes COLLATE "C"`)).rows;
  for (const row of rows) snapshots[row.table_name]!.push(JSON.stringify([row.bytes, row.xmin_value, row.ctid_value]));
  return snapshots;
}
// Rows by value of the columns that existed at 0115, named explicitly in columnsAt0115 (end of file) and never "whatever the table has now":
// a later migration that only adds a nullable column adds no key here, while one that changes, drops or renames an existing value still fails.
async function liveColumns() {
  const rows = (await admin.query(`SELECT n.nspname||'.'||c.relname AS name,array_agg(a.attname::text ORDER BY a.attnum) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE c.relkind='r' AND n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') GROUP BY 1`)).rows;
  return Object.fromEntries(rows.map(row => [row.name as string, row.columns as string[]]));
}
async function namedColumnRowsOf(columns: Record<string, string[]>) {
  const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;
  const snapshots: Record<string, string[]> = {};
  for (const [table, names] of Object.entries(columns)) {
    const [schema, relation] = table.split(".") as [string, string];
    snapshots[table] = (await admin.query(`SELECT row_to_json(t)::text AS bytes FROM (SELECT ${names.map(ident).join(",")} FROM ${ident(schema)}.${ident(relation)}) t
      ORDER BY row_to_json(t)::text COLLATE "C"`)).rows.map(row => row.bytes as string);
  }
  return snapshots;
}
async function privileges() {
  return {
    roles: (await admin.query(`SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls
      FROM pg_roles WHERE rolname LIKE 'jobguard_%' OR rolname='follow_up_upgrade_login' ORDER BY rolname`)).rows,
    memberships: (await admin.query(`SELECT pg_get_userbyid(roleid) AS role,pg_get_userbyid(member) AS member,admin_option
      FROM pg_auth_members ORDER BY role,member`)).rows,
    tables: (await admin.query(`SELECT n.nspname,c.relname,pg_get_userbyid(c.relowner) AS owner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','v','S')
      AND n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') ORDER BY n.nspname,c.relname`)).rows,
    policies: (await admin.query(`SELECT * FROM pg_policies WHERE schemaname IN ('app','identity','control_plane','infrastructure','audit_control') ORDER BY schemaname,tablename,policyname`)).rows,
    routines: (await admin.query(`SELECT p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,p.proacl::text,p.prosecdef
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') ORDER BY signature`)).rows,
  };
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jg-follow-up-upgrade-"));
  const port = 61400 + Math.floor(Math.random() * 200);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"] });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" });
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS) {
    const name = nameOf(url);
    if (name > "0111_persisted_identity.sql") break;
    const sql = await readFile(fileURLToPath(url), "utf8");
    await admin.query(name === "0095_job_parties.sql" ? sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);") : sql);
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
  }
  await installLegacySyntheticPartyFixtures(admin);
  await admin.query("CREATE ROLE follow_up_upgrade_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO follow_up_upgrade_login");
  runtime = new Pool({ host: "127.0.0.1", port, user: "follow_up_upgrade_login", password: "synthetic", database: "postgres" });
  repo = new RecoveryMessageRepository(runtime);
  const packs = new EvidencePackRepository(runtime);
  const fixture = await seedEvidencePackFixture(admin);
  for (const kind of ["previewed", "queued", "unknown", "delivered", "revoked"] as const) {
    const context = testTenantContext(fixture.tenantId), caseId = kind === "previewed" ? fixture.customerCaseId : randomUUID();
    if (kind !== "previewed") {
      await admin.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs) VALUES($1,$2,$3,32000,'GBP','identified',0,true,'withheld_customer_payment','Fictional counterparty','builder_customer','customer_invoice',$4)",
        [caseId, fixture.tenantId, fixture.jobId, JSON.stringify([fixture.invoiceId])]);
      await admin.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash) VALUES($1,$2,$3,$4,1,32000,'GBP','fixture-owner',$5)",
        [randomUUID(), fixture.tenantId, fixture.jobId, caseId, createHash("sha256").update(caseId).digest("hex")]);
    }
    const actor = { membershipId: fixture.memberId, actorRef: `membership:${fixture.memberId}` };
    await admin.query("INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash) VALUES($1,$2,$3,$4,1,'opened',NULL,'identified','fixture-owner',$5,$6)",
      [randomUUID(), fixture.tenantId, fixture.jobId, caseId, randomUUID(), createHash("sha256").update(`open:${caseId}`).digest("hex")]);
    const pack = await packs.generate(context, caseId, { commandId: randomUUID() }, actor.actorRef);
    await packs.approveAttachment(context, caseId, pack.id, { commandId: randomUUID(), expectedManifestHash: pack.manifestHash, expectedContentHash: pack.contentHash }, actor.actorRef);
    const ready = await repo.read(context, caseId);
    let state = await repo.preview(context, caseId, { version: "recovery-message-preview.v1", commandId: randomUUID(), expectedCaseRevision: ready.readiness.caseRevision, packId: pack.id }, actor);
    if (kind !== "previewed") state = await repo.command(context, caseId, approve(state.latest!), actor);
    if (kind === "unknown" || kind === "delivered") state = await repo.command(context, caseId, command("advance", state.latest!, kind === "unknown" ? "response_lost" : "success"), actor);
    if (kind === "revoked") state = await repo.command(context, caseId, command("revoke", state.latest!), actor);
    legacy[kind] = { context, caseId, actor, view: state.latest! };
  }
});
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

describe("M4-6-S-R1 populated upgrade proof", () => {
  it("registers 0111, 0112 and the repair by name in increasing order", () => {
    const names = MIGRATION_URLS.map(nameOf);
    for (const name of ["0111_persisted_identity.sql", "0112_recovery_follow_up.sql", repairName]) expect(names).toContain(name);
    expect(names.indexOf("0111_persisted_identity.sql")).toBeLessThan(names.indexOf("0112_recovery_follow_up.sql"));
    expect(names.indexOf("0112_recovery_follow_up.sql")).toBeLessThan(names.indexOf(repairName));
    expect(names).toEqual([...names].sort());
  });

  it("applies 0112 and 0115 as migration owner over approvals, queued/unknown/delivered actions and audits without changing one existing row or privilege", async () => {
    const installed = (await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name);
    expect(installed).toContain("0111_persisted_identity.sql");
    expect(installed).not.toContain("0112_recovery_follow_up.sql");
    const expectedStatuses = { previewed: "previewed", queued: "queued", unknown: "outcome_unknown", delivered: "simulated_delivery", revoked: "revoked" };
    for (const [kind, item] of Object.entries(legacy)) expect(item.view.status).toBe(expectedStatuses[kind as keyof typeof expectedStatuses]);
    const names = await tableNames(), before = await rowsOf(names), beforePrivileges = await privileges();
    const migrationRows = (await admin.query("SELECT row_to_json(t)::text AS bytes FROM public.jobguard_schema_migration t ORDER BY migration_name")).rows;
    await verifyChains();
    for (const name of ["0112_recovery_follow_up.sql", repairName]) {
      const url = MIGRATION_URLS.find(item => nameOf(item) === name)!;
      const client = await admin.connect();
      try {
        await client.query("SET ROLE jobguard_migration");
        await client.query(await readFile(fileURLToPath(url), "utf8"));
      } finally { await client.query("RESET ROLE"); client.release(); }
      await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
      expect(await rowsOf(names)).toEqual(before);
      expect((await admin.query("SELECT row_to_json(t)::text AS bytes FROM public.jobguard_schema_migration t WHERE migration_name=ANY($1::text[]) ORDER BY migration_name", [installed])).rows).toEqual(migrationRows);
      const afterPrivileges = await privileges();
      // 0112 adds its six tables and invoker helpers; every existing object's privileges and policies stay exact.
      for (const key of ["roles", "memberships"] as const) expect(afterPrivileges[key]).toEqual(beforePrivileges[key]);
      for (const key of ["tables", "policies", "routines"] as const) {
        expect(afterPrivileges[key].filter(row => beforePrivileges[key].some(old => JSON.stringify(old) === JSON.stringify(row)))).toEqual(beforePrivileges[key]);
      }
      await verifyChains();
      if (name === "0112_recovery_follow_up.sql") {
        // 0115 must introduce no objects, grants, owner/definer changes or policies, unlike the additive 0112.
        const at0112 = await privileges();
        // Keep the exact 0112 catalogue for comparison after the repair.
        Object.assign(beforeRepairPrivileges, at0112);
      } else expect(afterPrivileges).toEqual(beforeRepairPrivileges);
    }
  });

  it("preserves preview/approve/revoke/deliver/reconcile and their refusals on upgraded messages without resending", async () => {
    const first = legacy.previewed!;
    const replacement = await preview(first);
    expect(replacement.latest!.sequence).toBe(2);
    await expect(repo.command(first.context, first.caseId, approve(first.view), first.actor)).rejects.toMatchObject({ code: "RECOVERY_MESSAGE_CHANGED" });
    const approved = await repo.command(first.context, first.caseId, approve(replacement.latest!), first.actor);
    expect(approved.latest!.status).toBe("queued");
    const revoked = await repo.command(first.context, first.caseId, command("revoke", approved.latest!), first.actor);
    expect(revoked.latest!.status).toBe("revoked");
    await expect(repo.command(first.context, first.caseId, command("advance", revoked.latest!), first.actor)).rejects.toMatchObject({ code: "RECOVERY_MESSAGE_REVOKED" });
    const reviewed = await preview(first);
    const exact = await repo.command(first.context, first.caseId, approve(reviewed.latest!), first.actor);
    const delivered = await repo.command(first.context, first.caseId, command("advance", exact.latest!), first.actor);
    expect(delivered.latest!.status).toBe("simulated_delivery");

    const queued = legacy.queued!;
    await expect(preview(queued)).rejects.toMatchObject({ code: "RECOVERY_MESSAGE_EXISTING_EFFECT" });
    const queuedRevoked = await repo.command(queued.context, queued.caseId, command("revoke", queued.view), queued.actor);
    expect(queuedRevoked.latest!.status).toBe("revoked");
    const priorRevoked = legacy.revoked!;
    const fresh = await preview(priorRevoked);
    expect(fresh.latest!.status).toBe("previewed");

    const unknown = legacy.unknown!;
    const sinkBefore = Number((await admin.query("SELECT count(*) n FROM app.recovery_message_sink WHERE tenant_id=$1 AND case_id=$2", [unknown.context.tenantId, unknown.caseId])).rows[0].n);
    const attemptsBefore = Number((await admin.query("SELECT count(*) n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2", [unknown.context.tenantId, unknown.view.approval!.outboxActionId])).rows[0].n);
    expect(sinkBefore).toBe(1);
    await expect(repo.command(unknown.context, unknown.caseId, command("advance", unknown.view), unknown.actor)).rejects.toMatchObject({ code: "RECOVERY_MESSAGE_RECONCILE_REQUIRED" });
    const reconciled = await repo.command(unknown.context, unknown.caseId, command("reconcile", unknown.view), unknown.actor);
    expect(reconciled.latest!.status).toBe("simulated_delivery");
    expect(Number((await admin.query("SELECT count(*) n FROM app.recovery_message_sink WHERE tenant_id=$1 AND case_id=$2", [unknown.context.tenantId, unknown.caseId])).rows[0].n)).toBe(sinkBefore);
    expect(Number((await admin.query("SELECT count(*) n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2", [unknown.context.tenantId, unknown.view.approval!.outboxActionId])).rows[0].n)).toBe(attemptsBefore);
    const priorDelivered = legacy.delivered!;
    await expect(repo.command(priorDelivered.context, priorDelivered.caseId, command("advance", priorDelivered.view), priorDelivered.actor)).rejects.toMatchObject({ code: "RECOVERY_MESSAGE_ALREADY_DELIVERED" });
    await expect(preview(priorDelivered)).rejects.toMatchObject({ code: "RECOVERY_MESSAGE_EXISTING_EFFECT" });
    await verifyChains();
    // The runner remains idempotent after the manual upgrade and takes the database on to the head of the registry, so every later migration
    // runs over this populated database. Rows are compared by the VALUES of the columns that existed at 0115 (named in columnsAt0115): a later
    // migration that only adds a nullable column no longer fails this proof, one that changes any existing value, drops or renames a column,
    // or adds or removes a pre-existing row still does. The list is first pinned to the real 0115 catalogue, so it cannot drift.
    // Row versions (xmin/ctid) are checked in the 0112/0115 step above, where no later migration runs; here a later backfill may legitimately rewrite a row.
    expect(await liveColumns()).toEqual(columnsAt0115);
    const history = await namedColumnRowsOf(columnsAt0115);
    await migrate(admin);
    expect((await admin.query("SELECT migration_name FROM public.jobguard_schema_migration")).rows.map(row => row.migration_name as string).sort()).toEqual(MIGRATION_URLS.map(nameOf));
    expect(await namedColumnRowsOf(columnsAt0115)).toEqual(history);
  });
});
const beforeRepairPrivileges: Awaited<ReturnType<typeof privileges>> = { roles: [], memberships: [], tables: [], policies: [], routines: [] };
// The columns of every table in the five schemas as they stand after 0115, in ordinal order. Derived ONCE from the live catalogue at that
// point (186 tables, 1904 columns) and written out by hand-checkable name, never computed from the catalogue at run time: a later migration
// may add columns (a nullable column changes row_to_json without changing a value), and the row comparison must not move with it. The first
// head step below pins this list to the 0115 catalogue, so the list cannot drift from what 0115 really created.
const columnsAt0115: Record<string, string[]> = {
  "app.acceptance_event": ["id", "tenant_id", "job_id", "document_id", "document_version", "document_hash", "acceptance_id", "kind", "actor_membership_id", "occurred_at", "recorded_at"],
  "app.account": ["id", "tenant_id", "name", "created_at", "updated_at"],
  "app.action_attempt": ["id", "tenant_id", "action_id", "attempt_number", "outcome", "provider_reference", "error_code", "started_at", "finished_at"],
  "app.action_authorization": ["id", "tenant_id", "decision_id", "resolution_id", "actor_membership_id", "action_type", "recipient", "content_hash", "aggregate_revision", "amount_pence", "currency", "policy_version", "expires_at", "revoked_at", "authorization_kind", "created_at"],
  "app.action_outbox": ["id", "tenant_id", "authorization_id", "adapter", "provider_effect_key", "action_type", "recipient", "content_hash", "immutable_content", "aggregate_revision", "amount_pence", "currency", "policy_version", "authorization_expires_at", "status", "next_attempt_at", "claimed_at", "completed_at", "created_at", "updated_at"],
  "app.approval_rule_version": ["tenant_id", "id", "client_id", "contract_id", "revision", "document"],
  "app.audit_event": ["id", "tenant_id", "sequence", "version", "actor_ref", "event_type", "subject_type", "subject_ref", "occurred_at", "payload", "payload_hash", "previous_hash", "event_hash"],
  "app.cap_snapshot": ["id", "tenant_id", "job_id", "activation_id", "baseline_quote_version_id", "accepted_net_value_pence", "currency", "recovery_cap_pence", "fee_policy_version", "illustrative", "created_at"],
  "app.capture_source": ["id", "tenant_id", "source_version", "kind", "content_bytes", "content_text", "sha256", "created_at", "acquisition_metadata", "audio_byte_length"],
  "app.client_contract": ["tenant_id", "id", "client_id"],
  "app.client_contract_version": ["tenant_id", "id", "client_id", "contract_id", "revision", "document", "rule_version_id", "created_at"],
  "app.client_organisation": ["tenant_id", "id", "branch_id", "branch_kind", "name", "client_type"],
  "app.command_receipt": ["command_id", "tenant_id", "command_type", "semantic_key", "request_hash", "status", "result", "actor_membership_id", "created_at", "completed_at"],
  "app.commercial_integrity_activity_fact": ["id", "tenant_id", "job_id", "activity_kind", "occurred_at", "synthetic"],
  "app.commercial_integrity_value_fact": ["id", "tenant_id", "job_id", "value_kind", "net_value_pence", "currency", "source_ref", "occurred_at", "synthetic"],
  "app.commercial_track_assignment": ["tenant_id", "id", "revision", "commercial_track", "agreement_reference", "environment", "actor_ref", "created_at"],
  "app.contractor_client_customer": ["tenant_id", "id", "client_id", "customer_id", "customer_revision_id", "command_id", "actor_membership_id", "created_at"],
  "app.contractor_member": ["tenant_id", "membership_id", "client_id", "email"],
  "app.contractor_membership_revocation": ["tenant_id", "id", "membership_id"],
  "app.contractor_party_binding": ["tenant_id", "id", "job_id", "work_order_id", "client_id", "contract_id", "contract_version_id", "customer_id", "party_binding_id", "command_id", "actor_membership_id", "created_at"],
  "app.contractor_resident_contact": ["tenant_id", "id", "job_id", "binding_id", "retention_class", "contact", "no_resident_reason", "created_at"],
  "app.counterparty_check": ["tenant_id", "id", "job_id", "binding_id", "customer_revision_id", "command_id", "kind", "watch_revision", "source_id", "source_name", "retrieved_at", "result", "audit_event_id", "created_at"],
  "app.customer": ["tenant_id", "id", "retention_class"],
  "app.customer_credit_note": ["id", "tenant_id", "job_id", "invoice_id", "authorization_id", "credit_number", "amount_pence", "currency", "reason", "created_at", "net_pence", "tax_pence", "total_pence", "source_invoice_hash", "preview_hash", "pdf_sha256", "pdf_bytes", "tax_policy_version", "approved_at"],
  "app.customer_credit_note_sequence": ["id", "tenant_id", "next_number"],
  "app.customer_invoice": ["id", "tenant_id", "job_id", "final_account_revision_id", "authorization_id", "invoice_number", "issued_on", "issuer_details", "tax_policy_version", "currency", "net_pence", "tax_pence", "total_pence", "source_hash", "pdf_sha256", "pdf_bytes", "synthetic", "watermark", "created_at", "parties_snapshot"],
  "app.customer_invoice_evidence": ["id", "tenant_id", "job_id", "invoice_id", "evidence_id", "object_version_id", "sha256", "scope_item_id"],
  "app.customer_invoice_sequence": ["id", "tenant_id", "next_number"],
  "app.customer_payment": ["id", "tenant_id", "job_id", "invoice_id", "authorization_id", "paid_on", "amount_pence", "currency", "method", "reference", "builder_attested", "provenance", "qualifying_recovery_proof", "platform_fee_settlement", "created_at"],
  "app.customer_payment_reversal": ["id", "tenant_id", "job_id", "payment_id", "authorization_id", "reason", "created_at"],
  "app.customer_revision": ["tenant_id", "id", "customer_id", "revision", "payload", "created_at"],
  "app.decision": ["id", "tenant_id", "subject_type", "subject_ref", "action_type", "created_at"],
  "app.decision_resolution": ["id", "tenant_id", "decision_id", "resolution", "actor_membership_id", "resolved_at"],
  "app.discrepancy_finding_revision": ["id", "tenant_id", "job_id", "command_id", "revision", "rule_revision", "source_document_id", "source_version_id", "match_revision_id", "state", "price_pence", "quantity_pence", "total_pence", "supersedes_id", "actor_ref", "subject_ref", "payload_hash", "audit_event_id", "created_at"],
  "app.discrepancy_review_outcome": ["id", "tenant_id", "job_id", "finding_id", "command_id", "revision", "outcome", "reason", "actor_ref", "subject_ref", "payload_hash", "audit_event_id", "created_at"],
  "app.evidence_invalidation": ["id", "tenant_id", "evidence_id", "actor_membership_id", "reason_code", "invalidated_at"],
  "app.evidence_link": ["id", "tenant_id", "evidence_id", "job_id", "scope_item_id", "required_evidence_type", "created_at"],
  "app.evidence_object": ["id", "tenant_id", "upload_id", "job_id", "scope_item_id", "kind", "original_evidence_id", "evidence_type", "object_key", "object_version_id", "sha256", "byte_length", "content_type", "retention_class", "device_captured_at", "server_received_at", "server_verified_at"],
  "app.evidence_pack": ["id", "tenant_id", "job_id", "case_id", "created_at"],
  "app.evidence_pack_attachment_approval": ["id", "tenant_id", "job_id", "case_id", "pack_id", "command_id", "request_hash", "manifest_hash", "content_hash", "actor_ref", "created_at"],
  "app.evidence_pack_revision": ["id", "tenant_id", "job_id", "case_id", "pack_id", "revision", "command_id", "canonical_manifest", "manifest_hash", "content_hash", "sources", "format", "actor_ref", "subject_hash", "previous_hash", "attachment_approval_valid", "created_at", "artifact_text", "request_hash", "source_omissions"],
  "app.evidence_upload": ["id", "tenant_id", "job_id", "scope_item_id", "object_key", "expected_sha256", "expected_content_type", "maximum_bytes", "retention_class", "state", "rejection_code", "object_version_id", "device_captured_at", "server_received_at", "server_verified_at", "expires_at", "created_at"],
  "app.extra_origin": ["tenant_id", "job_id", "variation_id", "job_track", "kind", "command_id", "raising_membership_id", "raising_role", "server_recorded_at", "device_id", "device_captured_at", "evidence_hash", "provenance", "source_capture_kind", "source_capture_hash"],
  "app.fee_illustration_source": ["tenant_id", "job_id", "command_id", "source_version", "accepted_net_pence", "eligible_net_pence", "gross_landed_pence", "base_obligation_pence", "base_settled_pence", "prior_posting_pence", "statement_issued_count", "ledger_entry_count", "source_ids", "created_at"],
  "app.final_account_draft": ["id", "tenant_id", "job_id", "current_revision_id", "revision", "created_at", "updated_at"],
  "app.final_account_line": ["id", "tenant_id", "job_id", "final_account_revision_id", "line_kind", "source_id", "scope_item_id", "commercial_revision_id", "approval_id", "description", "net_pence", "ordinal"],
  "app.final_account_proof": ["id", "tenant_id", "job_id", "final_account_revision_id", "evidence_id", "object_version_id", "scope_item_id", "evidence_type", "sha256", "mandatory"],
  "app.final_account_revision": ["id", "tenant_id", "job_id", "final_account_draft_id", "revision", "previous_revision_id", "source_hash", "baseline_quote_version_id", "currency", "tax_policy_version", "net_pence", "tax_pence", "total_pence", "issue_blocked", "findings", "created_at"],
  "app.financial_authorization": ["id", "tenant_id", "membership_id", "purpose", "amount_pence", "currency", "artifact_hash", "status", "expires_at", "created_at"],
  "app.finding_suppression": ["id", "tenant_id", "finding_id", "reason", "policy_version", "created_at"],
  "app.goods_receipt": ["id", "tenant_id", "job_id", "order_draft_id", "document_id", "revision", "ordered_quantity", "delivered_quantity", "accepted_quantity", "rejected_quantity", "missing_quantity", "unit", "created_at"],
  "app.import_batch": ["tenant_id", "id", "command_id", "source_sha256", "source_name", "source_kind", "row_count", "created_count", "revised_count", "unchanged_count", "rejected_count", "actor_membership_id", "created_at"],
  "app.import_row_receipt": ["tenant_id", "batch_id", "row_number", "outcome", "error_code", "work_order_reference", "work_order_id", "revision_id"],
  "app.imported_job_baseline": ["id", "tenant_id", "job_id", "provenance", "lineage_strength", "baseline_hash", "baseline_description", "accepted_value_source", "accepted_net_value_pence", "currency", "recovery_cap_pence", "fee_policy_version", "import_terms_version", "attested_by_membership_id", "attested_at", "recorded_at", "party_binding_id"],
  "app.inbox_decision_revision": ["id", "tenant_id", "job_id", "revision", "coalescing_key", "lane", "rule_id", "rule_revision", "finding_revision", "source_references", "status", "actor_ref", "subject_ref", "payload_hash", "audit_event_id", "created_at"],
  "app.inbox_finding_revision": ["id", "tenant_id", "job_id", "revision", "lane", "rule_id", "rule_revision", "action_type", "recipient_ref", "amount_pence", "source_revision", "source_reference", "title", "explanation", "permitted_action", "actor_ref", "subject_ref", "payload_hash", "audit_event_id", "created_at"],
  "app.inbox_outcome_event": ["id", "tenant_id", "job_id", "decision_id", "decision_revision", "command_id", "event_kind", "rule_id", "rule_revision", "finding_revision", "scenario_clock_version", "scenario_at", "actor_ref", "subject_ref", "payload_hash", "audit_event_id", "created_at"],
  "app.inbox_preference_revision": ["id", "tenant_id", "membership_id", "revision", "command_id", "advisory_budget", "actor_ref", "subject_ref", "payload_hash", "audit_event_id", "created_at"],
  "app.job": ["id", "tenant_id", "title", "status", "revision", "accepted_quote_version_id", "baseline_quote_version_id", "accepted_net_value_pence", "fee_policy_version", "recovery_cap_pence", "created_at", "updated_at", "provenance", "practice_session_digest", "practice_scenario", "saved_v1_sample"],
  "app.job_activation": ["id", "tenant_id", "job_id", "accepted_document_id", "accepted_document_version", "accepted_document_hash", "mode", "activation_terms_version", "fee_policy_version", "actor_membership_id", "activated_at", "recorded_at", "party_binding_id"],
  "app.job_activation_terms": ["id", "tenant_id", "job_id", "activation_id", "version", "baseline_quote_version_id", "baseline_document_version", "baseline_document_hash", "accepted_net_pence", "highest_sent_net_pence", "small_job", "policy_version", "commercial_track", "trial_plan_context", "activated_at"],
  "app.job_assignment": ["tenant_id", "id", "job_id", "work_order_id", "revision_id", "team_id", "membership_id", "created_at"],
  "app.job_commercial_track": ["tenant_id", "job_id", "job_track", "environment", "provenance", "source_id", "bound_at"],
  "app.job_finding": ["id", "tenant_id", "job_id", "decision_id", "fingerprint", "kind", "classification", "title", "detail", "subject_ref", "action_type", "suggestion_confidence", "snapshot_revision", "created_at"],
  "app.job_party_binding": ["tenant_id", "id", "job_id", "revision", "customer_id", "customer_revision_id", "paying_party_id", "paying_party_revision_id", "site_id", "site_revision_id", "provenance", "correction_reason", "created_at", "command_id"],
  "app.job_party_current": ["tenant_id", "job_id", "binding_id"],
  "app.job_record_proposal": ["id", "tenant_id", "capture_id", "job_id", "source_id", "source_version", "source_sha256", "prompt_version", "schema_version", "model", "proposal", "created_at"],
  "app.journal": ["id", "tenant_id", "book_id", "currency", "kind", "source_event_id", "provenance_kind", "provenance_ref", "artifact_hash", "authorization_id", "audit_event_id", "obligation_journal_id", "reverses_journal_id", "posted_at"],
  "app.journal_line": ["id", "tenant_id", "book_id", "journal_id", "account_id", "currency", "side", "amount_pence"],
  "app.landing_allocation": ["id", "tenant_id", "job_id", "case_id", "receipt_id", "evidence_id", "eligibility_approval_id", "landing_approval_id", "gross_pence", "eligible_net_pence", "currency", "policy_version", "created_at"],
  "app.landing_reversal": ["id", "tenant_id", "job_id", "allocation_id", "eligible_net_pence", "reason", "created_at"],
  "app.ledger_account": ["id", "tenant_id", "book_id", "currency", "code", "class", "mapping_status", "created_at"],
  "app.ledger_book": ["id", "tenant_id", "code", "currency", "chart_status", "created_at"],
  "app.material_pack_conversion": ["id", "tenant_id", "sku_id", "pack_unit", "each_quantity_decimal", "effective_from", "created_at", "practice_session_digest"],
  "app.material_rate_revision": ["id", "tenant_id", "merchant_id", "sku_id", "version", "price_pence", "currency", "price_unit", "tax_basis", "effective_from", "effective_to", "source_label", "created_at", "practice_session_digest"],
  "app.material_requirement": ["id", "tenant_id", "job_id", "scope_item_id", "sku_id", "quantity_decimal", "unit", "revision", "created_at"],
  "app.membership": ["id", "tenant_id", "account_id", "identity_user_id", "role", "created_at", "revoked_at", "expires_at"],
  "app.merchant": ["id", "tenant_id", "name", "created_at", "practice_session_digest"],
  "app.merchant_sku": ["id", "tenant_id", "merchant_id", "sku", "description", "base_unit", "created_at", "practice_session_digest"],
  "app.merchant_sku_alias": ["id", "tenant_id", "merchant_id", "sku_id", "alias", "created_at", "practice_session_digest"],
  "app.org_unit": ["tenant_id", "id", "kind", "parent_id", "parent_kind", "name"],
  "app.planned_work_revision": ["id", "tenant_id", "job_id", "command_id", "task_key", "revision", "plan_date", "predecessor_complete", "required_units", "landed_units", "access_ready", "crew_ready", "labour_rate_pence", "uncertain_duration_hours", "actor_ref", "subject_ref", "payload_hash", "audit_event_id", "created_at"],
  "app.practice_feed_account": ["id", "tenant_id", "job_id", "session_digest", "actor_membership_id", "environment", "provider", "consent_version", "consent_scope", "created_at"],
  "app.practice_feed_command": ["id", "tenant_id", "job_id", "account_id", "revision", "action", "movement_key", "step", "payment_id", "actor_membership_id", "payload_hash", "environment", "created_at"],
  "app.practice_feed_event": ["id", "tenant_id", "job_id", "account_id", "command_id", "event_kind", "movement_key", "event_id", "identity", "representation_id", "gross_pence", "currency", "state", "environment", "version", "source_hash", "created_at"],
  "app.practice_feed_job_owner": ["id", "tenant_id", "job_id", "session_digest", "actor_membership_id", "environment", "created_at"],
  "app.practice_feed_receipt_match": ["id", "tenant_id", "job_id", "account_id", "command_id", "payment_id", "movement_key", "settled_event_id", "matched_pence", "currency", "environment", "created_at"],
  "app.proof_application_response": ["tenant_id", "command_id", "job_id", "action", "command_type", "request_hash", "response", "created_at"],
  "app.property_constraint_fact": ["tenant_id", "id", "job_id", "binding_id", "site_revision_id", "command_id", "kind", "source_id", "source_name", "retrieved_at", "result", "audit_event_id", "created_at"],
  "app.proposal_line": ["id", "tenant_id", "job_id", "scope_item_id", "source_hash", "source_reference", "state", "dismissal_reason", "created_at", "proposal_id", "ordinal", "proposed_data"],
  "app.proposal_review": ["id", "tenant_id", "job_id", "proposal_id", "revision", "state", "confirmed_at", "created_at", "updated_at"],
  "app.proposal_review_line": ["id", "tenant_id", "review_id", "job_id", "scope_item_id", "origin", "description", "room", "category", "quantity_decimal", "unit", "unit_price_pence", "disposition", "dismissal_reason", "source_excerpt", "ordinal"],
  "app.proposal_review_line_parent": ["tenant_id", "job_id", "review_id", "line_id", "parent_scope_item_id"],
  "app.proposal_review_question": ["id", "tenant_id", "job_id", "review_id", "question", "blocking", "disposition", "answer"],
  "app.provider_event_inbox": ["id", "tenant_id", "adapter", "provider_event_id", "provider_effect_key", "event_kind", "occurred_at", "payload_hash", "signature_verified", "processing_status", "received_at", "processed_at"],
  "app.purchase_order_draft": ["id", "tenant_id", "job_id", "requirement_id", "created_at"],
  "app.purchase_order_placement": ["id", "tenant_id", "job_id", "draft_id", "revision_id", "authorization_id", "outbox_action_id", "command_id", "status", "created_at"],
  "app.purchase_order_revision": ["id", "tenant_id", "job_id", "draft_id", "revision", "quantity_decimal", "unit_price_pence", "order_net_pence", "agreed_net_pence", "recipient", "required_date", "authority_hash", "created_at"],
  "app.quote_acceptance": ["id", "tenant_id", "job_id", "document_id", "document_version", "document_hash", "accepted_total_pence", "currency", "acceptance_kind", "actor_membership_id", "stated_customer_name", "stated_method", "accepted_at", "evidence_id", "recorded_at"],
  "app.quote_delivery_event": ["id", "tenant_id", "quote_send_id", "fact", "provider_event_id", "occurred_at", "created_at"],
  "app.quote_document_version": ["id", "tenant_id", "job_id", "quote_revision_id", "document_version", "reference", "content_hash", "object_key", "object_version_id", "pdf_byte_length", "issuer", "customer", "snapshot", "issued_at", "created_at", "parties_snapshot"],
  "app.quote_draft": ["id", "tenant_id", "job_id", "current_revision_id", "revision", "created_at", "updated_at"],
  "app.quote_line": ["id", "tenant_id", "job_id", "quote_revision_id", "scope_item_id", "scope_revision_id", "origin", "description", "included", "exclusion_reason", "quantity_decimal", "unit", "unit_rate_pence", "discount_decimal", "tax_treatment", "rate_provenance", "category", "region", "ordinal", "created_at"],
  "app.quote_revision": ["id", "tenant_id", "job_id", "quote_draft_id", "revision", "previous_revision_id", "currency", "tax_policy_version", "subtotal_pence", "discount_pence", "net_pence", "tax_pence", "total_pence", "issuable", "blockers", "created_at"],
  "app.quote_send": ["id", "tenant_id", "job_id", "document_id", "content_hash", "authorization_id", "outbox_action_id", "recipients", "issued_at"],
  "app.quote_version": ["id", "tenant_id", "job_id", "version", "content_hash", "net_value_pence", "status", "created_at"],
  "app.rate_book_observation": ["id", "tenant_id", "job_id", "scope_item_id", "source_scope_revision_id", "unit", "rate_principal_pence", "currency", "tax_basis", "category", "region", "effective_at", "provenance", "created_at"],
  "app.readiness_decision": ["id", "tenant_id", "job_id", "command_id", "snapshot_id", "revision", "decision_kind", "rule_revision", "source_facts_hash", "adapter_reading_hash", "due_at", "actor_ref", "subject_ref", "payload_hash", "audit_event_id", "created_at"],
  "app.readiness_snapshot": ["id", "tenant_id", "job_id", "command_id", "planned_work_revision_id", "revision", "rule_revision", "source_facts_hash", "adapter_revision", "adapter_reading_hash", "scenario_now", "weather_observed_at", "weather_state", "ready", "reasons", "exposure_pence", "recovery_fee_pence", "actor_ref", "subject_ref", "payload_hash", "audit_event_id", "created_at"],
  "app.recovery_approval": ["id", "tenant_id", "job_id", "case_id", "kind", "expected_case_revision", "status", "policy_version", "expires_at", "command_id", "created_at"],
  "app.recovery_case": ["id", "tenant_id", "job_id", "claim_pence", "currency", "state", "revision", "synthetic", "created_at", "case_type", "counterparty", "book", "source_type", "source_refs", "environment"],
  "app.recovery_case_event": ["id", "tenant_id", "job_id", "case_id", "sequence", "event_type", "from_state", "to_state", "amount_pence", "reviewer_ref", "command_id", "payload_hash", "previous_hash", "created_at"],
  "app.recovery_claim_revision": ["id", "tenant_id", "job_id", "case_id", "revision", "claimed_net_pence", "currency", "reviewer_ref", "subject_hash", "previous_hash", "created_at"],
  "app.recovery_demo_selection": ["tenant_id", "job_id", "command_id", "scenario", "case_id", "receipt_id", "evidence_id", "eligibility_approval_id", "landing_approval_id", "selected_at"],
  "app.recovery_eligibility_revision": ["id", "tenant_id", "job_id", "case_id", "revision", "case_revision", "evidence_revision", "policy_version", "policy_revision", "scenario", "classification", "eligible_net_pence", "currency", "reason", "citations", "status", "reviewer_ref", "command_id", "subject_hash", "previous_hash", "created_at"],
  "app.recovery_fee_derivation": ["id", "tenant_id", "job_id", "source_allocation_id", "source_reversal_id", "policy_version", "cumulative_landed_pence", "cap_pence", "capped_fee_pence", "credit_used_pence", "liability_pence", "posting_delta_pence", "created_at"],
  "app.recovery_fee_journal": ["id", "tenant_id", "job_id", "derivation_id", "kind", "amount_pence", "currency", "debit_code", "credit_code", "reverses_journal_id", "created_at"],
  "app.recovery_follow_up": ["id", "tenant_id", "job_id", "case_id", "run_id", "source_message_id", "source_message_sequence", "case_revision", "case_event_sequence", "created_tick", "due_tick", "due_after_ticks", "fixture_version", "command_id", "request_hash", "actor_membership_id", "environment", "created_at"],
  "app.recovery_follow_up_advance": ["tenant_id", "command_id", "run_id", "follow_up_id", "request_hash", "tick_before", "tick_after", "actor_membership_id", "environment", "created_at"],
  "app.recovery_follow_up_due": ["tenant_id", "job_id", "case_id", "follow_up_id", "period", "decision_id", "due_tick", "clock_tick", "audit_event_id", "environment", "created_at"],
  "app.recovery_follow_up_event": ["id", "tenant_id", "job_id", "case_id", "follow_up_id", "revision", "kind", "command_id", "request_hash", "actor_membership_id", "environment", "created_at"],
  "app.recovery_follow_up_owner": ["tenant_id", "follow_up_id", "run_id", "owner_kind", "environment", "created_at"],
  "app.recovery_follow_up_reminder": ["tenant_id", "job_id", "case_id", "follow_up_id", "period", "attempt", "message_id", "environment", "created_at"],
  "app.recovery_message": ["id", "tenant_id", "job_id", "case_id", "case_sequence", "pack_id", "pack_revision", "manifest_hash", "attachment_hash", "attachment_approval_id", "command_id", "request_hash", "case_type", "case_revision", "amount_pence", "currency", "sender", "recipient", "body", "policy_version", "content_hash", "immutable_content", "actor_membership_id", "environment", "created_at"],
  "app.recovery_message_approval": ["tenant_id", "job_id", "case_id", "message_id", "authorization_id", "outbox_action_id", "environment", "created_at"],
  "app.recovery_message_event": ["id", "tenant_id", "job_id", "case_id", "message_id", "revision", "kind", "command_id", "request_hash", "actor_membership_id", "environment", "created_at"],
  "app.recovery_message_sink": ["id", "tenant_id", "job_id", "case_id", "message_id", "outbox_action_id", "recipient", "body", "content_hash", "attachment_hash", "provider_reference", "environment", "real_external_actions", "created_at"],
  "app.recovery_review": ["id", "tenant_id", "job_id", "derivation_id", "reason", "status", "created_at"],
  "app.role_grant": ["tenant_id", "id", "membership_id", "role", "scope_kind", "scope_id", "contract_id"],
  "app.role_grant_revocation": ["tenant_id", "id", "grant_id"],
  "app.sandbox_adapter_receipt": ["id", "tenant_id", "run_id", "work_id", "attempt_number", "adapter", "input_hash", "output_hash", "fake_clock_tick", "environment", "external_action_count", "created_at"],
  "app.sandbox_run": ["id", "tenant_id", "job_id", "session_id", "scenario", "environment", "status", "initial_clock_tick", "created_at"],
  "app.sandbox_run_event": ["id", "tenant_id", "run_id", "event_index", "kind", "fake_clock_tick", "command_id", "payload_hash", "created_at"],
  "app.sandbox_work": ["id", "tenant_id", "run_id", "step", "adapter", "input_hash", "amount_pence", "currency", "environment", "approved"],
  "app.schedule_of_rates": ["tenant_id", "id", "reference", "actor_membership_id", "created_at"],
  "app.scope_identity": ["id", "tenant_id", "job_id", "state", "created_at"],
  "app.scope_lineage": ["tenant_id", "job_id", "parent_scope_item_id", "child_scope_item_id", "kind", "created_at"],
  "app.scope_progress": ["tenant_id", "job_id", "scope_item_id", "stage", "revision", "updated_at"],
  "app.scope_revision": ["id", "tenant_id", "job_id", "scope_item_id", "revision", "description", "quantity_decimal", "unit", "unit_price_pence", "total_pence", "created_at"],
  "app.simulated_settlement_event": ["id", "tenant_id", "job_id", "obligation_id", "provider_event_id", "amount_pence", "currency", "label", "simulated_at", "recorded_at"],
  "app.site": ["tenant_id", "id", "retention_class"],
  "app.site_revision": ["tenant_id", "id", "site_id", "revision", "payload", "match_key", "created_at"],
  "app.site_visit": ["tenant_id", "id", "job_id", "work_order_id", "membership_id", "started_at", "completed_at"],
  "app.sor_item": ["tenant_id", "version_id", "code", "description", "unit", "rate_pence", "standard_minutes"],
  "app.sor_version": ["tenant_id", "id", "schedule_id", "reference", "effective_from", "item_count", "content_hash", "command_id", "request_hash", "actor_membership_id", "created_at"],
  "app.stage_completion": ["id", "tenant_id", "job_id", "scope_item_id", "stage", "evidence_link_id", "command_id", "completed_at"],
  "app.stage_review_event": ["id", "tenant_id", "stage_completion_id", "evidence_invalidation_id", "event_type", "created_at"],
  "app.supplier_bill_supersession": ["id", "tenant_id", "job_id", "command_id", "revision", "original_fact_revision_id", "replacement_fact_revision_id", "confirmed_reduction_pence", "actor_ref", "subject_ref", "payload_hash", "audit_event_id", "created_at"],
  "app.supplier_document": ["id", "tenant_id", "job_id", "supplier_context", "document_type", "document_number", "content_hash", "status", "hold_reason", "recognized_debt_pence", "created_at"],
  "app.supplier_document_intake": ["id", "tenant_id", "job_id", "document_id", "fixture_id", "channel", "alias", "result", "reason", "created_at"],
  "app.supplier_document_version": ["id", "tenant_id", "job_id", "document_id", "version", "media_type", "byte_length", "content_hash", "page_count", "parent_version_id", "page_from", "page_to", "created_at"],
  "app.supplier_fact_proposal": ["id", "tenant_id", "job_id", "document_id", "document_version_id", "revision", "parser_version", "source_hash", "document_type", "quantity_decimal", "unit_price_pence", "net_pence", "source_page", "span_start", "span_end", "source_region", "issues", "created_at"],
  "app.supplier_fact_revision": ["id", "tenant_id", "job_id", "document_id", "proposal_id", "command_id", "revision", "actor_ref", "document_type", "quantity_decimal", "unit_price_pence", "net_pence", "origin", "disposition", "payload_hash", "created_at"],
  "app.supplier_match_allocation": ["id", "tenant_id", "job_id", "match_revision_id", "receipt_version_id", "quantity_decimal", "unit", "created_at"],
  "app.supplier_match_proposal": ["id", "tenant_id", "job_id", "digest", "state", "ambiguity_reason", "order_revision_id", "receipt_version_ids", "bill_revision_id", "actor_ref", "subject_ref", "payload_hash", "audit_event_id", "created_at"],
  "app.supplier_match_revision": ["id", "tenant_id", "job_id", "proposal_id", "command_id", "revision", "order_revision_id", "receipt_version_ids", "bill_revision_id", "actor_ref", "subject_ref", "payload_hash", "audit_event_id", "invalidates_unresolved_findings", "created_at"],
  "app.synthetic_evidence_original": ["tenant_id", "upload_id", "job_id", "scope_item_id", "object_key", "object_version_id", "environment", "content_type", "bytes", "created_at"],
  "app.synthetic_obligation": ["id", "tenant_id", "job_id", "activation_id", "principal_pence", "currency", "state", "label", "created_at"],
  "app.synthetic_recovery_receipt": ["id", "tenant_id", "job_id", "source_identity", "reconciliation_identity", "status", "gross_pence", "currency", "synthetic", "settled_at", "created_at"],
  "app.team": ["tenant_id", "id", "branch_id", "branch_kind", "name"],
  "app.team_membership": ["tenant_id", "id", "membership_id", "team_id", "revision", "active"],
  "app.variation": ["id", "tenant_id", "job_id", "scope_item_id", "existing_scope_item_id", "lineage_parent_scope_item_id", "capture_kind", "capture_text", "description", "ai_rate_pence", "ai_source_ref", "ai_source_hash", "ai_rate_version", "state", "current_revision_id", "created_at", "job_track", "origin"],
  "app.variation_approval": ["id", "tenant_id", "job_id", "variation_id", "revision_id", "revision", "content_hash", "signed_delta_pence", "method", "actor_membership_id", "evidence_id", "approved_at", "created_at"],
  "app.variation_rate_observation": ["id", "tenant_id", "job_id", "variation_id", "revision_id", "unit", "unit_rate_pence", "provenance_kind", "source_ref", "source_hash", "rate_version", "observed_at"],
  "app.variation_rejection": ["id", "tenant_id", "job_id", "variation_id", "revision_id", "actor_membership_id", "reason_code", "rejected_at"],
  "app.variation_revision": ["id", "tenant_id", "job_id", "variation_id", "scope_item_id", "revision", "previous_revision_id", "description", "quantity_decimal", "unit", "unit_rate_pence", "signed_delta_pence", "content_hash", "confirmed_by_membership_id", "rate_provenance_kind", "rate_source_ref", "rate_source_hash", "rate_version", "created_at"],
  "app.watchdog_command_identity": ["tenant_id", "command_id", "job_id", "command_type", "request_hash", "created_at", "claimed_xact"],
  "app.watchdog_command_result": ["tenant_id", "command_id", "result", "created_at"],
  "app.work_order": ["tenant_id", "id", "job_id", "client_id", "contract_id", "contract_version_id", "reference", "created_at"],
  "app.work_order_current": ["tenant_id", "work_order_id", "revision_id"],
  "app.work_order_line": ["tenant_id", "id", "work_order_id", "revision_id", "job_id", "position", "scope_item_id", "client_line_reference", "sor_version_id", "sor_code", "unit", "rate_pence", "quantity", "net_pence", "origin"],
  "app.work_order_revision": ["tenant_id", "id", "work_order_id", "revision", "status", "issued_on", "due_on", "priority", "content_hash", "diff", "batch_id", "row_number", "sor_version_id", "adjustment_numerator", "adjustment_denominator", "net_total_pence", "created_at"],
  "audit_control.audit_head": ["tenant_id", "sequence", "event_hash"],
  "audit_control.checkpoint": ["tenant_id", "sequence", "event_hash", "recorded_at"],
  "control_plane.contractor_practice_session": ["session_id", "tenant_id", "membership_id", "identity_user_id"],
  "control_plane.practice_session": ["token_digest", "environment", "created_at", "expires_at", "revoked_at"],
  "control_plane.tenant": ["id", "created_at"],
  "identity.challenge": ["environment", "id", "email", "purpose", "invitation_id", "digest", "requested_at", "expires_at", "attempts", "consumed_at", "verified", "delivery_state"],
  "identity.identity_user": ["id", "created_at"],
  "identity.invitation": ["environment", "id", "email", "tenant_id", "account_id", "role", "expires_at", "accepted_at", "issuer_user_id"],
  "identity.membership_locator": ["user_id", "tenant_id", "membership_id"],
  "identity.request_window": ["ip_digest", "requested_at"],
  "identity.security_event": ["id", "event_type", "subject_id", "created_at"],
  "identity.session": ["id", "user_id", "environment", "token_digest", "csrf_token", "expires_at", "revoked_at"],
  "identity.user_email": ["email", "user_id"],
  "infrastructure.outbox_signal": ["action_id", "tenant_id", "created_at", "enqueued_at"],
};
