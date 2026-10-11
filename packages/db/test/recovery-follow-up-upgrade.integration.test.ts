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
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
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
// Each listed column is "name type" (type as format_type prints it, so atttypid and atttypmod); the type is compared too, because a retype
// that keeps every serialised value (integer to bigint, or a column that is all NULL) leaves the JSON text unchanged.
async function liveColumns() {
  const rows = (await admin.query(`SELECT n.nspname||'.'||c.relname AS name,array_agg(a.attname::text||' '||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE c.relkind='r' AND n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') GROUP BY 1`)).rows;
  return Object.fromEntries(rows.map(row => [row.name as string, row.columns as string[]]));
}
const columnName = (column: string) => column.slice(0, column.indexOf(" "));
// Every listed column whose type is not the type it had before: "table.column: old -> new" (a dropped column reads "(gone)").
function retypedColumns(before: Record<string, string[]>, after: Record<string, string[]>) {
  const changes: string[] = [];
  for (const [table, columns] of Object.entries(before)) {
    const now = new Map((after[table] ?? []).map(column => [columnName(column), column.slice(columnName(column).length + 1)] as const));
    for (const column of columns) {
      const name = columnName(column), type = column.slice(name.length + 1), nowType = now.get(name);
      if (nowType !== type) changes.push(`${table}.${name}: ${type} -> ${nowType ?? "(gone)"}`);
    }
  }
  return changes;
}
async function namedColumnRowsOf(columns: Record<string, string[]>) {
  const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;
  const snapshots: Record<string, string[]> = {};
  for (const [table, typed] of Object.entries(columns)) {
    const names = typed.map(columnName);
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
  const port = await freePort(61400, 200);
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
    // The TYPE of every listed column (name, atttypid, atttypmod) is pinned the same way and compared again after the head step.
    expect(await liveColumns()).toEqual(columnsAt0115);
    const history = await namedColumnRowsOf(columnsAt0115);
    await migrate(admin);
    expect((await admin.query("SELECT migration_name FROM public.jobguard_schema_migration")).rows.map(row => row.migration_name as string).sort()).toEqual(MIGRATION_URLS.map(nameOf));
    expect(retypedColumns(columnsAt0115, await liveColumns()), "A later migration changed the type of a column that existed at 0115 (table.column: old -> new); "
      + "the serialised values can look unchanged, but the column is not the one this proof pinned.").toEqual([]);
    expect(await namedColumnRowsOf(columnsAt0115)).toEqual(history);
  });
});
const beforeRepairPrivileges: Awaited<ReturnType<typeof privileges>> = { roles: [], memberships: [], tables: [], policies: [], routines: [] };
// The columns of every table in the five schemas as they stand after 0115, in ordinal order, each as "name type" (type as format_type prints it,
// so it carries atttypid and atttypmod). Derived ONCE from the live catalogue at that point (186 tables, 1904 columns) and written out by hand-checkable
// name, never computed from the catalogue at run time: a later migration may add columns (a nullable column changes row_to_json without changing a
// value), and the row comparison must not move with it. The first head step above pins this list to the 0115 catalogue, so it cannot drift from
// what 0115 really created, and compares every listed column's type again after the head migration step.
const columnsAt0115: Record<string, string[]> = {
  "app.acceptance_event": ["id uuid", "tenant_id uuid", "job_id uuid", "document_id uuid", "document_version integer", "document_hash character(64)", "acceptance_id uuid", "kind character varying(32)", "actor_membership_id uuid", "occurred_at timestamp with time zone", "recorded_at timestamp with time zone"],
  "app.account": ["id uuid", "tenant_id uuid", "name character varying(200)", "created_at timestamp with time zone", "updated_at timestamp with time zone"],
  "app.action_attempt": ["id uuid", "tenant_id uuid", "action_id uuid", "attempt_number integer", "outcome character varying(24)", "provider_reference character varying(300)", "error_code character varying(100)", "started_at timestamp with time zone", "finished_at timestamp with time zone"],
  "app.action_authorization": ["id uuid", "tenant_id uuid", "decision_id uuid", "resolution_id uuid", "actor_membership_id uuid", "action_type character varying(100)", "recipient character varying(320)", "content_hash character(64)", "aggregate_revision integer", "amount_pence bigint", "currency character(3)", "policy_version character varying(80)", "expires_at timestamp with time zone", "revoked_at timestamp with time zone", "authorization_kind character varying(16)", "created_at timestamp with time zone"],
  "app.action_outbox": ["id uuid", "tenant_id uuid", "authorization_id uuid", "adapter character varying(60)", "provider_effect_key character varying(300)", "action_type character varying(100)", "recipient character varying(320)", "content_hash character(64)", "immutable_content text", "aggregate_revision integer", "amount_pence bigint", "currency character(3)", "policy_version character varying(80)", "authorization_expires_at timestamp with time zone", "status character varying(24)", "next_attempt_at timestamp with time zone", "claimed_at timestamp with time zone", "completed_at timestamp with time zone", "created_at timestamp with time zone", "updated_at timestamp with time zone"],
  "app.approval_rule_version": ["tenant_id uuid", "id uuid", "client_id uuid", "contract_id uuid", "revision integer", "document jsonb"],
  "app.audit_event": ["id uuid", "tenant_id uuid", "sequence bigint", "version character varying(20)", "actor_ref character varying(200)", "event_type character varying(100)", "subject_type character varying(100)", "subject_ref character varying(200)", "occurred_at timestamp with time zone", "payload jsonb", "payload_hash character(64)", "previous_hash character(64)", "event_hash character(64)"],
  "app.cap_snapshot": ["id uuid", "tenant_id uuid", "job_id uuid", "activation_id uuid", "baseline_quote_version_id uuid", "accepted_net_value_pence bigint", "currency character(3)", "recovery_cap_pence bigint", "fee_policy_version character varying(80)", "illustrative boolean", "created_at timestamp with time zone"],
  "app.capture_source": ["id uuid", "tenant_id uuid", "source_version integer", "kind character varying(40)", "content_bytes bytea", "content_text text", "sha256 character(64)", "created_at timestamp with time zone", "acquisition_metadata jsonb", "audio_byte_length integer"],
  "app.client_contract": ["tenant_id uuid", "id uuid", "client_id uuid"],
  "app.client_contract_version": ["tenant_id uuid", "id uuid", "client_id uuid", "contract_id uuid", "revision integer", "document jsonb", "rule_version_id uuid", "created_at timestamp with time zone"],
  "app.client_organisation": ["tenant_id uuid", "id uuid", "branch_id uuid", "branch_kind text", "name text", "client_type text"],
  "app.command_receipt": ["command_id uuid", "tenant_id uuid", "command_type character varying(100)", "semantic_key character varying(300)", "request_hash character(64)", "status character varying(16)", "result jsonb", "actor_membership_id uuid", "created_at timestamp with time zone", "completed_at timestamp with time zone"],
  "app.commercial_integrity_activity_fact": ["id uuid", "tenant_id uuid", "job_id uuid", "activity_kind character varying(32)", "occurred_at timestamp with time zone", "synthetic boolean"],
  "app.commercial_integrity_value_fact": ["id uuid", "tenant_id uuid", "job_id uuid", "value_kind character varying(12)", "net_value_pence bigint", "currency character(3)", "source_ref uuid", "occurred_at timestamp with time zone", "synthetic boolean"],
  "app.commercial_track_assignment": ["tenant_id uuid", "id uuid", "revision integer", "commercial_track text", "agreement_reference text", "environment text", "actor_ref text", "created_at timestamp with time zone"],
  "app.contractor_client_customer": ["tenant_id uuid", "id uuid", "client_id uuid", "customer_id uuid", "customer_revision_id uuid", "command_id uuid", "actor_membership_id uuid", "created_at timestamp with time zone"],
  "app.contractor_member": ["tenant_id uuid", "membership_id uuid", "client_id uuid", "email text"],
  "app.contractor_membership_revocation": ["tenant_id uuid", "id uuid", "membership_id uuid"],
  "app.contractor_party_binding": ["tenant_id uuid", "id uuid", "job_id uuid", "work_order_id uuid", "client_id uuid", "contract_id uuid", "contract_version_id uuid", "customer_id uuid", "party_binding_id uuid", "command_id uuid", "actor_membership_id uuid", "created_at timestamp with time zone"],
  "app.contractor_resident_contact": ["tenant_id uuid", "id uuid", "job_id uuid", "binding_id uuid", "retention_class text", "contact jsonb", "no_resident_reason text", "created_at timestamp with time zone"],
  "app.counterparty_check": ["tenant_id uuid", "id uuid", "job_id uuid", "binding_id uuid", "customer_revision_id uuid", "command_id uuid", "kind text", "watch_revision integer", "source_id text", "source_name text", "retrieved_at timestamp with time zone", "result jsonb", "audit_event_id uuid", "created_at timestamp with time zone"],
  "app.customer": ["tenant_id uuid", "id uuid", "retention_class text"],
  "app.customer_credit_note": ["id uuid", "tenant_id uuid", "job_id uuid", "invoice_id uuid", "authorization_id uuid", "credit_number character varying(40)", "amount_pence bigint", "currency character(3)", "reason character varying(240)", "created_at timestamp with time zone", "net_pence bigint", "tax_pence bigint", "total_pence bigint", "source_invoice_hash character(64)", "preview_hash character(64)", "pdf_sha256 character(64)", "pdf_bytes bytea", "tax_policy_version character varying(80)", "approved_at timestamp with time zone"],
  "app.customer_credit_note_sequence": ["id uuid", "tenant_id uuid", "next_number bigint"],
  "app.customer_invoice": ["id uuid", "tenant_id uuid", "job_id uuid", "final_account_revision_id uuid", "authorization_id uuid", "invoice_number character varying(32)", "issued_on date", "issuer_details jsonb", "tax_policy_version character varying(80)", "currency character(3)", "net_pence bigint", "tax_pence bigint", "total_pence bigint", "source_hash character(64)", "pdf_sha256 character(64)", "pdf_bytes bytea", "synthetic boolean", "watermark character varying(80)", "created_at timestamp with time zone", "parties_snapshot jsonb"],
  "app.customer_invoice_evidence": ["id uuid", "tenant_id uuid", "job_id uuid", "invoice_id uuid", "evidence_id uuid", "object_version_id character varying(1024)", "sha256 character(64)", "scope_item_id uuid"],
  "app.customer_invoice_sequence": ["id uuid", "tenant_id uuid", "next_number bigint"],
  "app.customer_payment": ["id uuid", "tenant_id uuid", "job_id uuid", "invoice_id uuid", "authorization_id uuid", "paid_on date", "amount_pence bigint", "currency character(3)", "method character varying(24)", "reference character varying(120)", "builder_attested boolean", "provenance character varying(32)", "qualifying_recovery_proof boolean", "platform_fee_settlement boolean", "created_at timestamp with time zone"],
  "app.customer_payment_reversal": ["id uuid", "tenant_id uuid", "job_id uuid", "payment_id uuid", "authorization_id uuid", "reason character varying(240)", "created_at timestamp with time zone"],
  "app.customer_revision": ["tenant_id uuid", "id uuid", "customer_id uuid", "revision integer", "payload jsonb", "created_at timestamp with time zone"],
  "app.decision": ["id uuid", "tenant_id uuid", "subject_type character varying(100)", "subject_ref character varying(200)", "action_type character varying(100)", "created_at timestamp with time zone"],
  "app.decision_resolution": ["id uuid", "tenant_id uuid", "decision_id uuid", "resolution character varying(16)", "actor_membership_id uuid", "resolved_at timestamp with time zone"],
  "app.discrepancy_finding_revision": ["id uuid", "tenant_id uuid", "job_id uuid", "command_id uuid", "revision integer", "rule_revision text", "source_document_id uuid", "source_version_id uuid", "match_revision_id uuid", "state character varying(20)", "price_pence bigint", "quantity_pence bigint", "total_pence bigint", "supersedes_id uuid", "actor_ref text", "subject_ref uuid", "payload_hash character(64)", "audit_event_id uuid", "created_at timestamp with time zone"],
  "app.discrepancy_review_outcome": ["id uuid", "tenant_id uuid", "job_id uuid", "finding_id uuid", "command_id uuid", "revision integer", "outcome character varying(20)", "reason text", "actor_ref text", "subject_ref uuid", "payload_hash character(64)", "audit_event_id uuid", "created_at timestamp with time zone"],
  "app.evidence_invalidation": ["id uuid", "tenant_id uuid", "evidence_id uuid", "actor_membership_id uuid", "reason_code character varying(40)", "invalidated_at timestamp with time zone"],
  "app.evidence_link": ["id uuid", "tenant_id uuid", "evidence_id uuid", "job_id uuid", "scope_item_id uuid", "required_evidence_type character varying(40)", "created_at timestamp with time zone"],
  "app.evidence_object": ["id uuid", "tenant_id uuid", "upload_id uuid", "job_id uuid", "scope_item_id uuid", "kind character varying(20)", "original_evidence_id uuid", "evidence_type character varying(40)", "object_key character varying(1024)", "object_version_id character varying(1024)", "sha256 character(64)", "byte_length bigint", "content_type character varying(100)", "retention_class character varying(40)", "device_captured_at timestamp with time zone", "server_received_at timestamp with time zone", "server_verified_at timestamp with time zone"],
  "app.evidence_pack": ["id uuid", "tenant_id uuid", "job_id uuid", "case_id uuid", "created_at timestamp with time zone"],
  "app.evidence_pack_attachment_approval": ["id uuid", "tenant_id uuid", "job_id uuid", "case_id uuid", "pack_id uuid", "command_id uuid", "request_hash character(64)", "manifest_hash character(64)", "content_hash character(64)", "actor_ref character varying(200)", "created_at timestamp with time zone"],
  "app.evidence_pack_revision": ["id uuid", "tenant_id uuid", "job_id uuid", "case_id uuid", "pack_id uuid", "revision integer", "command_id uuid", "canonical_manifest text", "manifest_hash character(64)", "content_hash character(64)", "sources jsonb", "format character varying(8)", "actor_ref character varying(200)", "subject_hash character(64)", "previous_hash character(64)", "attachment_approval_valid boolean", "created_at timestamp with time zone", "artifact_text text", "request_hash character(64)", "source_omissions jsonb"],
  "app.evidence_upload": ["id uuid", "tenant_id uuid", "job_id uuid", "scope_item_id uuid", "object_key character varying(1024)", "expected_sha256 character(64)", "expected_content_type character varying(100)", "maximum_bytes bigint", "retention_class character varying(40)", "state character varying(20)", "rejection_code character varying(50)", "object_version_id character varying(1024)", "device_captured_at timestamp with time zone", "server_received_at timestamp with time zone", "server_verified_at timestamp with time zone", "expires_at timestamp with time zone", "created_at timestamp with time zone"],
  "app.extra_origin": ["tenant_id uuid", "job_id uuid", "variation_id uuid", "job_track character varying(16)", "kind character varying(32)", "command_id uuid", "raising_membership_id uuid", "raising_role character varying(40)", "server_recorded_at timestamp with time zone", "device_id character varying(200)", "device_captured_at timestamp with time zone", "evidence_hash character(64)", "provenance character varying(40)", "source_capture_kind character varying(32)", "source_capture_hash character(64)"],
  "app.fee_illustration_source": ["tenant_id uuid", "job_id uuid", "command_id uuid", "source_version character varying(32)", "accepted_net_pence bigint", "eligible_net_pence bigint", "gross_landed_pence bigint", "base_obligation_pence bigint", "base_settled_pence bigint", "prior_posting_pence bigint", "statement_issued_count integer", "ledger_entry_count integer", "source_ids uuid[]", "created_at timestamp with time zone"],
  "app.final_account_draft": ["id uuid", "tenant_id uuid", "job_id uuid", "current_revision_id uuid", "revision integer", "created_at timestamp with time zone", "updated_at timestamp with time zone"],
  "app.final_account_line": ["id uuid", "tenant_id uuid", "job_id uuid", "final_account_revision_id uuid", "line_kind character varying(12)", "source_id uuid", "scope_item_id uuid", "commercial_revision_id uuid", "approval_id uuid", "description character varying(500)", "net_pence bigint", "ordinal integer"],
  "app.final_account_proof": ["id uuid", "tenant_id uuid", "job_id uuid", "final_account_revision_id uuid", "evidence_id uuid", "object_version_id character varying(1024)", "scope_item_id uuid", "evidence_type character varying(80)", "sha256 character(64)", "mandatory boolean"],
  "app.final_account_revision": ["id uuid", "tenant_id uuid", "job_id uuid", "final_account_draft_id uuid", "revision integer", "previous_revision_id uuid", "source_hash character(64)", "baseline_quote_version_id uuid", "currency character(3)", "tax_policy_version character varying(80)", "net_pence bigint", "tax_pence bigint", "total_pence bigint", "issue_blocked boolean", "findings jsonb", "created_at timestamp with time zone"],
  "app.financial_authorization": ["id uuid", "tenant_id uuid", "membership_id uuid", "purpose character varying(32)", "amount_pence bigint", "currency character(3)", "artifact_hash character(64)", "status character varying(12)", "expires_at timestamp with time zone", "created_at timestamp with time zone"],
  "app.finding_suppression": ["id uuid", "tenant_id uuid", "finding_id uuid", "reason character varying(40)", "policy_version character varying(80)", "created_at timestamp with time zone"],
  "app.goods_receipt": ["id uuid", "tenant_id uuid", "job_id uuid", "order_draft_id uuid", "document_id uuid", "revision integer", "ordered_quantity numeric(20,6)", "delivered_quantity numeric(20,6)", "accepted_quantity numeric(20,6)", "rejected_quantity numeric(20,6)", "missing_quantity numeric(20,6)", "unit character varying(30)", "created_at timestamp with time zone"],
  "app.import_batch": ["tenant_id uuid", "id uuid", "command_id uuid", "source_sha256 character(64)", "source_name text", "source_kind text", "row_count integer", "created_count integer", "revised_count integer", "unchanged_count integer", "rejected_count integer", "actor_membership_id uuid", "created_at timestamp with time zone"],
  "app.import_row_receipt": ["tenant_id uuid", "batch_id uuid", "row_number integer", "outcome text", "error_code text", "work_order_reference text", "work_order_id uuid", "revision_id uuid"],
  "app.imported_job_baseline": ["id uuid", "tenant_id uuid", "job_id uuid", "provenance character varying(16)", "lineage_strength character varying(32)", "baseline_hash character(64)", "baseline_description character varying(2000)", "accepted_value_source character varying(32)", "accepted_net_value_pence bigint", "currency character(3)", "recovery_cap_pence bigint", "fee_policy_version character varying(80)", "import_terms_version character varying(80)", "attested_by_membership_id uuid", "attested_at timestamp with time zone", "recorded_at timestamp with time zone", "party_binding_id uuid"],
  "app.inbox_decision_revision": ["id uuid", "tenant_id uuid", "job_id uuid", "revision integer", "coalescing_key text", "lane text", "rule_id text", "rule_revision text", "finding_revision integer", "source_references jsonb", "status text", "actor_ref text", "subject_ref uuid", "payload_hash character(64)", "audit_event_id uuid", "created_at timestamp with time zone"],
  "app.inbox_finding_revision": ["id uuid", "tenant_id uuid", "job_id uuid", "revision integer", "lane text", "rule_id text", "rule_revision text", "action_type text", "recipient_ref text", "amount_pence bigint", "source_revision text", "source_reference text", "title text", "explanation text", "permitted_action text", "actor_ref text", "subject_ref uuid", "payload_hash character(64)", "audit_event_id uuid", "created_at timestamp with time zone"],
  "app.inbox_outcome_event": ["id uuid", "tenant_id uuid", "job_id uuid", "decision_id uuid", "decision_revision integer", "command_id uuid", "event_kind text", "rule_id text", "rule_revision text", "finding_revision integer", "scenario_clock_version text", "scenario_at timestamp with time zone", "actor_ref text", "subject_ref uuid", "payload_hash character(64)", "audit_event_id uuid", "created_at timestamp with time zone"],
  "app.inbox_preference_revision": ["id uuid", "tenant_id uuid", "membership_id uuid", "revision integer", "command_id uuid", "advisory_budget integer", "actor_ref text", "subject_ref uuid", "payload_hash character(64)", "audit_event_id uuid", "created_at timestamp with time zone"],
  "app.job": ["id uuid", "tenant_id uuid", "title character varying(200)", "status character varying(16)", "revision integer", "accepted_quote_version_id uuid", "baseline_quote_version_id uuid", "accepted_net_value_pence bigint", "fee_policy_version character varying(80)", "recovery_cap_pence bigint", "created_at timestamp with time zone", "updated_at timestamp with time zone", "provenance character varying(24)", "practice_session_digest character(64)", "practice_scenario text", "saved_v1_sample boolean"],
  "app.job_activation": ["id uuid", "tenant_id uuid", "job_id uuid", "accepted_document_id uuid", "accepted_document_version integer", "accepted_document_hash character(64)", "mode character varying(24)", "activation_terms_version character varying(80)", "fee_policy_version character varying(80)", "actor_membership_id uuid", "activated_at timestamp with time zone", "recorded_at timestamp with time zone", "party_binding_id uuid"],
  "app.job_activation_terms": ["id uuid", "tenant_id uuid", "job_id uuid", "activation_id uuid", "version text", "baseline_quote_version_id uuid", "baseline_document_version integer", "baseline_document_hash character(64)", "accepted_net_pence bigint", "highest_sent_net_pence bigint", "small_job boolean", "policy_version text", "commercial_track character varying(16)", "trial_plan_context text", "activated_at timestamp with time zone"],
  "app.job_assignment": ["tenant_id uuid", "id uuid", "job_id uuid", "work_order_id uuid", "revision_id uuid", "team_id uuid", "membership_id uuid", "created_at timestamp with time zone"],
  "app.job_commercial_track": ["tenant_id uuid", "job_id uuid", "job_track character varying(16)", "environment character varying(24)", "provenance character varying(40)", "source_id uuid", "bound_at timestamp with time zone"],
  "app.job_finding": ["id uuid", "tenant_id uuid", "job_id uuid", "decision_id uuid", "fingerprint character(64)", "kind character varying(40)", "classification character varying(16)", "title character varying(160)", "detail character varying(1000)", "subject_ref character varying(200)", "action_type character varying(100)", "suggestion_confidence numeric(5,4)", "snapshot_revision integer", "created_at timestamp with time zone"],
  "app.job_party_binding": ["tenant_id uuid", "id uuid", "job_id uuid", "revision integer", "customer_id uuid", "customer_revision_id uuid", "paying_party_id uuid", "paying_party_revision_id uuid", "site_id uuid", "site_revision_id uuid", "provenance text", "correction_reason text", "created_at timestamp with time zone", "command_id uuid"],
  "app.job_party_current": ["tenant_id uuid", "job_id uuid", "binding_id uuid"],
  "app.job_record_proposal": ["id uuid", "tenant_id uuid", "capture_id uuid", "job_id uuid", "source_id uuid", "source_version integer", "source_sha256 character(64)", "prompt_version character varying(80)", "schema_version character varying(80)", "model character varying(80)", "proposal jsonb", "created_at timestamp with time zone"],
  "app.journal": ["id uuid", "tenant_id uuid", "book_id uuid", "currency character(3)", "kind character varying(24)", "source_event_id character varying(200)", "provenance_kind character varying(40)", "provenance_ref character varying(200)", "artifact_hash character(64)", "authorization_id uuid", "audit_event_id uuid", "obligation_journal_id uuid", "reverses_journal_id uuid", "posted_at timestamp with time zone"],
  "app.journal_line": ["id uuid", "tenant_id uuid", "book_id uuid", "journal_id uuid", "account_id uuid", "currency character(3)", "side character varying(6)", "amount_pence bigint"],
  "app.landing_allocation": ["id uuid", "tenant_id uuid", "job_id uuid", "case_id uuid", "receipt_id uuid", "evidence_id uuid", "eligibility_approval_id uuid", "landing_approval_id uuid", "gross_pence bigint", "eligible_net_pence bigint", "currency character(3)", "policy_version character varying(80)", "created_at timestamp with time zone"],
  "app.landing_reversal": ["id uuid", "tenant_id uuid", "job_id uuid", "allocation_id uuid", "eligible_net_pence bigint", "reason character varying(120)", "created_at timestamp with time zone"],
  "app.ledger_account": ["id uuid", "tenant_id uuid", "book_id uuid", "currency character(3)", "code character varying(80)", "class character varying(32)", "mapping_status character varying(24)", "created_at timestamp with time zone"],
  "app.ledger_book": ["id uuid", "tenant_id uuid", "code character varying(80)", "currency character(3)", "chart_status character varying(24)", "created_at timestamp with time zone"],
  "app.material_pack_conversion": ["id uuid", "tenant_id uuid", "sku_id uuid", "pack_unit character varying(20)", "each_quantity_decimal character varying(40)", "effective_from date", "created_at timestamp with time zone", "practice_session_digest character(64)"],
  "app.material_rate_revision": ["id uuid", "tenant_id uuid", "merchant_id uuid", "sku_id uuid", "version integer", "price_pence bigint", "currency character(3)", "price_unit character varying(20)", "tax_basis character varying(10)", "effective_from date", "effective_to date", "source_label character varying(160)", "created_at timestamp with time zone", "practice_session_digest character(64)"],
  "app.material_requirement": ["id uuid", "tenant_id uuid", "job_id uuid", "scope_item_id uuid", "sku_id uuid", "quantity_decimal character varying(40)", "unit character varying(20)", "revision integer", "created_at timestamp with time zone"],
  "app.membership": ["id uuid", "tenant_id uuid", "account_id uuid", "identity_user_id uuid", "role character varying(40)", "created_at timestamp with time zone", "revoked_at timestamp with time zone", "expires_at timestamp with time zone"],
  "app.merchant": ["id uuid", "tenant_id uuid", "name character varying(160)", "created_at timestamp with time zone", "practice_session_digest character(64)"],
  "app.merchant_sku": ["id uuid", "tenant_id uuid", "merchant_id uuid", "sku character varying(100)", "description character varying(240)", "base_unit character varying(20)", "created_at timestamp with time zone", "practice_session_digest character(64)"],
  "app.merchant_sku_alias": ["id uuid", "tenant_id uuid", "merchant_id uuid", "sku_id uuid", "alias character varying(160)", "created_at timestamp with time zone", "practice_session_digest character(64)"],
  "app.org_unit": ["tenant_id uuid", "id uuid", "kind text", "parent_id uuid", "parent_kind text", "name text"],
  "app.planned_work_revision": ["id uuid", "tenant_id uuid", "job_id uuid", "command_id uuid", "task_key text", "revision integer", "plan_date date", "predecessor_complete boolean", "required_units integer", "landed_units integer", "access_ready boolean", "crew_ready boolean", "labour_rate_pence bigint", "uncertain_duration_hours integer", "actor_ref text", "subject_ref uuid", "payload_hash character(64)", "audit_event_id uuid", "created_at timestamp with time zone"],
  "app.practice_feed_account": ["id uuid", "tenant_id uuid", "job_id uuid", "session_digest character(64)", "actor_membership_id uuid", "environment text", "provider text", "consent_version text", "consent_scope text", "created_at timestamp with time zone"],
  "app.practice_feed_command": ["id uuid", "tenant_id uuid", "job_id uuid", "account_id uuid", "revision integer", "action text", "movement_key text", "step text", "payment_id uuid", "actor_membership_id uuid", "payload_hash character(64)", "environment text", "created_at timestamp with time zone"],
  "app.practice_feed_event": ["id uuid", "tenant_id uuid", "job_id uuid", "account_id uuid", "command_id uuid", "event_kind text", "movement_key text", "event_id text", "identity text", "representation_id text", "gross_pence bigint", "currency character(3)", "state text", "environment text", "version text", "source_hash character(64)", "created_at timestamp with time zone"],
  "app.practice_feed_job_owner": ["id uuid", "tenant_id uuid", "job_id uuid", "session_digest character(64)", "actor_membership_id uuid", "environment text", "created_at timestamp with time zone"],
  "app.practice_feed_receipt_match": ["id uuid", "tenant_id uuid", "job_id uuid", "account_id uuid", "command_id uuid", "payment_id uuid", "movement_key text", "settled_event_id text", "matched_pence bigint", "currency character(3)", "environment text", "created_at timestamp with time zone"],
  "app.proof_application_response": ["tenant_id uuid", "command_id uuid", "job_id uuid", "action text", "command_type text", "request_hash character(64)", "response jsonb", "created_at timestamp with time zone"],
  "app.property_constraint_fact": ["tenant_id uuid", "id uuid", "job_id uuid", "binding_id uuid", "site_revision_id uuid", "command_id uuid", "kind text", "source_id text", "source_name text", "retrieved_at timestamp with time zone", "result jsonb", "audit_event_id uuid", "created_at timestamp with time zone"],
  "app.proposal_line": ["id uuid", "tenant_id uuid", "job_id uuid", "scope_item_id uuid", "source_hash character(64)", "source_reference character varying(300)", "state character varying(12)", "dismissal_reason character varying(200)", "created_at timestamp with time zone", "proposal_id uuid", "ordinal integer", "proposed_data jsonb"],
  "app.proposal_review": ["id uuid", "tenant_id uuid", "job_id uuid", "proposal_id uuid", "revision integer", "state character varying(12)", "confirmed_at timestamp with time zone", "created_at timestamp with time zone", "updated_at timestamp with time zone"],
  "app.proposal_review_line": ["id uuid", "tenant_id uuid", "review_id uuid", "job_id uuid", "scope_item_id uuid", "origin character varying(10)", "description character varying(500)", "room character varying(100)", "category character varying(100)", "quantity_decimal character varying(40)", "unit character varying(40)", "unit_price_pence bigint", "disposition character varying(12)", "dismissal_reason character varying(200)", "source_excerpt character varying(1000)", "ordinal integer"],
  "app.proposal_review_line_parent": ["tenant_id uuid", "job_id uuid", "review_id uuid", "line_id uuid", "parent_scope_item_id uuid"],
  "app.proposal_review_question": ["id uuid", "tenant_id uuid", "job_id uuid", "review_id uuid", "question character varying(500)", "blocking boolean", "disposition character varying(20)", "answer character varying(500)"],
  "app.provider_event_inbox": ["id uuid", "tenant_id uuid", "adapter character varying(60)", "provider_event_id character varying(300)", "provider_effect_key character varying(300)", "event_kind character varying(100)", "occurred_at timestamp with time zone", "payload_hash character(64)", "signature_verified boolean", "processing_status character varying(20)", "received_at timestamp with time zone", "processed_at timestamp with time zone"],
  "app.purchase_order_draft": ["id uuid", "tenant_id uuid", "job_id uuid", "requirement_id uuid", "created_at timestamp with time zone"],
  "app.purchase_order_placement": ["id uuid", "tenant_id uuid", "job_id uuid", "draft_id uuid", "revision_id uuid", "authorization_id uuid", "outbox_action_id uuid", "command_id uuid", "status character varying(40)", "created_at timestamp with time zone"],
  "app.purchase_order_revision": ["id uuid", "tenant_id uuid", "job_id uuid", "draft_id uuid", "revision integer", "quantity_decimal character varying(40)", "unit_price_pence bigint", "order_net_pence bigint", "agreed_net_pence bigint", "recipient character varying(320)", "required_date date", "authority_hash character(64)", "created_at timestamp with time zone"],
  "app.quote_acceptance": ["id uuid", "tenant_id uuid", "job_id uuid", "document_id uuid", "document_version integer", "document_hash character(64)", "accepted_total_pence bigint", "currency character(3)", "acceptance_kind character varying(32)", "actor_membership_id uuid", "stated_customer_name character varying(160)", "stated_method character varying(20)", "accepted_at timestamp with time zone", "evidence_id uuid", "recorded_at timestamp with time zone"],
  "app.quote_delivery_event": ["id uuid", "tenant_id uuid", "quote_send_id uuid", "fact character varying(24)", "provider_event_id character varying(300)", "occurred_at timestamp with time zone", "created_at timestamp with time zone"],
  "app.quote_document_version": ["id uuid", "tenant_id uuid", "job_id uuid", "quote_revision_id uuid", "document_version integer", "reference character varying(80)", "content_hash character(64)", "object_key character varying(500)", "object_version_id character varying(300)", "pdf_byte_length integer", "issuer jsonb", "customer jsonb", "snapshot jsonb", "issued_at timestamp with time zone", "created_at timestamp with time zone", "parties_snapshot jsonb"],
  "app.quote_draft": ["id uuid", "tenant_id uuid", "job_id uuid", "current_revision_id uuid", "revision integer", "created_at timestamp with time zone", "updated_at timestamp with time zone"],
  "app.quote_line": ["id uuid", "tenant_id uuid", "job_id uuid", "quote_revision_id uuid", "scope_item_id uuid", "scope_revision_id uuid", "origin character varying(10)", "description character varying(500)", "included boolean", "exclusion_reason character varying(200)", "quantity_decimal character varying(40)", "unit character varying(40)", "unit_rate_pence bigint", "discount_decimal character varying(20)", "tax_treatment character varying(40)", "rate_provenance character varying(24)", "category character varying(100)", "region character varying(100)", "ordinal integer", "created_at timestamp with time zone"],
  "app.quote_revision": ["id uuid", "tenant_id uuid", "job_id uuid", "quote_draft_id uuid", "revision integer", "previous_revision_id uuid", "currency character(3)", "tax_policy_version character varying(80)", "subtotal_pence bigint", "discount_pence bigint", "net_pence bigint", "tax_pence bigint", "total_pence bigint", "issuable boolean", "blockers jsonb", "created_at timestamp with time zone"],
  "app.quote_send": ["id uuid", "tenant_id uuid", "job_id uuid", "document_id uuid", "content_hash character(64)", "authorization_id uuid", "outbox_action_id uuid", "recipients jsonb", "issued_at timestamp with time zone"],
  "app.quote_version": ["id uuid", "tenant_id uuid", "job_id uuid", "version integer", "content_hash character(64)", "net_value_pence bigint", "status character varying(12)", "created_at timestamp with time zone"],
  "app.rate_book_observation": ["id uuid", "tenant_id uuid", "job_id uuid", "scope_item_id uuid", "source_scope_revision_id uuid", "unit character varying(40)", "rate_principal_pence bigint", "currency character(3)", "tax_basis character varying(40)", "category character varying(100)", "region character varying(100)", "effective_at timestamp with time zone", "provenance character varying(24)", "created_at timestamp with time zone"],
  "app.readiness_decision": ["id uuid", "tenant_id uuid", "job_id uuid", "command_id uuid", "snapshot_id uuid", "revision integer", "decision_kind text", "rule_revision text", "source_facts_hash character(64)", "adapter_reading_hash character(64)", "due_at timestamp with time zone", "actor_ref text", "subject_ref uuid", "payload_hash character(64)", "audit_event_id uuid", "created_at timestamp with time zone"],
  "app.readiness_snapshot": ["id uuid", "tenant_id uuid", "job_id uuid", "command_id uuid", "planned_work_revision_id uuid", "revision integer", "rule_revision text", "source_facts_hash character(64)", "adapter_revision text", "adapter_reading_hash character(64)", "scenario_now timestamp with time zone", "weather_observed_at timestamp with time zone", "weather_state character varying(10)", "ready boolean", "reasons jsonb", "exposure_pence bigint", "recovery_fee_pence bigint", "actor_ref text", "subject_ref uuid", "payload_hash character(64)", "audit_event_id uuid", "created_at timestamp with time zone"],
  "app.recovery_approval": ["id uuid", "tenant_id uuid", "job_id uuid", "case_id uuid", "kind character varying(24)", "expected_case_revision integer", "status character varying(12)", "policy_version character varying(80)", "expires_at timestamp with time zone", "command_id uuid", "created_at timestamp with time zone"],
  "app.recovery_case": ["id uuid", "tenant_id uuid", "job_id uuid", "claim_pence bigint", "currency character(3)", "state character varying(24)", "revision integer", "synthetic boolean", "created_at timestamp with time zone", "case_type character varying(40)", "counterparty character varying(120)", "book character varying(30)", "source_type character varying(30)", "source_refs jsonb", "environment character varying(30)"],
  "app.recovery_case_event": ["id uuid", "tenant_id uuid", "job_id uuid", "case_id uuid", "sequence integer", "event_type character varying(30)", "from_state character varying(30)", "to_state character varying(30)", "amount_pence bigint", "reviewer_ref character varying(200)", "command_id uuid", "payload_hash character(64)", "previous_hash character(64)", "created_at timestamp with time zone"],
  "app.recovery_claim_revision": ["id uuid", "tenant_id uuid", "job_id uuid", "case_id uuid", "revision integer", "claimed_net_pence bigint", "currency character(3)", "reviewer_ref character varying(200)", "subject_hash character(64)", "previous_hash character(64)", "created_at timestamp with time zone"],
  "app.recovery_demo_selection": ["tenant_id uuid", "job_id uuid", "command_id uuid", "scenario character varying(32)", "case_id uuid", "receipt_id uuid", "evidence_id uuid", "eligibility_approval_id uuid", "landing_approval_id uuid", "selected_at timestamp with time zone"],
  "app.recovery_eligibility_revision": ["id uuid", "tenant_id uuid", "job_id uuid", "case_id uuid", "revision integer", "case_revision integer", "evidence_revision integer", "policy_version character varying(40)", "policy_revision integer", "scenario character varying(50)", "classification character varying(30)", "eligible_net_pence bigint", "currency character(3)", "reason character varying(200)", "citations jsonb", "status character varying(20)", "reviewer_ref character varying(200)", "command_id uuid", "subject_hash character(64)", "previous_hash character(64)", "created_at timestamp with time zone"],
  "app.recovery_fee_derivation": ["id uuid", "tenant_id uuid", "job_id uuid", "source_allocation_id uuid", "source_reversal_id uuid", "policy_version character varying(80)", "cumulative_landed_pence bigint", "cap_pence bigint", "capped_fee_pence bigint", "credit_used_pence bigint", "liability_pence bigint", "posting_delta_pence bigint", "created_at timestamp with time zone"],
  "app.recovery_fee_journal": ["id uuid", "tenant_id uuid", "job_id uuid", "derivation_id uuid", "kind character varying(24)", "amount_pence bigint", "currency character(3)", "debit_code character varying(80)", "credit_code character varying(80)", "reverses_journal_id uuid", "created_at timestamp with time zone"],
  "app.recovery_follow_up": ["id uuid", "tenant_id uuid", "job_id uuid", "case_id uuid", "run_id uuid", "source_message_id uuid", "source_message_sequence integer", "case_revision integer", "case_event_sequence integer", "created_tick integer", "due_tick integer", "due_after_ticks integer", "fixture_version character varying(60)", "command_id uuid", "request_hash character(64)", "actor_membership_id uuid", "environment character varying(30)", "created_at timestamp with time zone"],
  "app.recovery_follow_up_advance": ["tenant_id uuid", "command_id uuid", "run_id uuid", "follow_up_id uuid", "request_hash character(64)", "tick_before integer", "tick_after integer", "actor_membership_id uuid", "environment character varying(30)", "created_at timestamp with time zone"],
  "app.recovery_follow_up_due": ["tenant_id uuid", "job_id uuid", "case_id uuid", "follow_up_id uuid", "period integer", "decision_id uuid", "due_tick integer", "clock_tick integer", "audit_event_id uuid", "environment character varying(30)", "created_at timestamp with time zone"],
  "app.recovery_follow_up_event": ["id uuid", "tenant_id uuid", "job_id uuid", "case_id uuid", "follow_up_id uuid", "revision integer", "kind character varying(30)", "command_id uuid", "request_hash character(64)", "actor_membership_id uuid", "environment character varying(30)", "created_at timestamp with time zone"],
  "app.recovery_follow_up_owner": ["tenant_id uuid", "follow_up_id uuid", "run_id uuid", "owner_kind character varying(40)", "environment character varying(30)", "created_at timestamp with time zone"],
  "app.recovery_follow_up_reminder": ["tenant_id uuid", "job_id uuid", "case_id uuid", "follow_up_id uuid", "period integer", "attempt integer", "message_id uuid", "environment character varying(30)", "created_at timestamp with time zone"],
  "app.recovery_message": ["id uuid", "tenant_id uuid", "job_id uuid", "case_id uuid", "case_sequence integer", "pack_id uuid", "pack_revision integer", "manifest_hash character(64)", "attachment_hash character(64)", "attachment_approval_id uuid", "command_id uuid", "request_hash character(64)", "case_type character varying(40)", "case_revision integer", "amount_pence bigint", "currency character(3)", "sender character varying(320)", "recipient character varying(320)", "body text", "policy_version character varying(80)", "content_hash character(64)", "immutable_content text", "actor_membership_id uuid", "environment character varying(30)", "created_at timestamp with time zone"],
  "app.recovery_message_approval": ["tenant_id uuid", "job_id uuid", "case_id uuid", "message_id uuid", "authorization_id uuid", "outbox_action_id uuid", "environment character varying(30)", "created_at timestamp with time zone"],
  "app.recovery_message_event": ["id uuid", "tenant_id uuid", "job_id uuid", "case_id uuid", "message_id uuid", "revision integer", "kind character varying(30)", "command_id uuid", "request_hash character(64)", "actor_membership_id uuid", "environment character varying(30)", "created_at timestamp with time zone"],
  "app.recovery_message_sink": ["id uuid", "tenant_id uuid", "job_id uuid", "case_id uuid", "message_id uuid", "outbox_action_id uuid", "recipient character varying(320)", "body text", "content_hash character(64)", "attachment_hash character(64)", "provider_reference character varying(200)", "environment character varying(30)", "real_external_actions integer", "created_at timestamp with time zone"],
  "app.recovery_review": ["id uuid", "tenant_id uuid", "job_id uuid", "derivation_id uuid", "reason character varying(40)", "status character varying(12)", "created_at timestamp with time zone"],
  "app.role_grant": ["tenant_id uuid", "id uuid", "membership_id uuid", "role text", "scope_kind text", "scope_id uuid", "contract_id uuid"],
  "app.role_grant_revocation": ["tenant_id uuid", "id uuid", "grant_id uuid"],
  "app.sandbox_adapter_receipt": ["id uuid", "tenant_id uuid", "run_id uuid", "work_id uuid", "attempt_number integer", "adapter character varying(40)", "input_hash character(64)", "output_hash character(64)", "fake_clock_tick integer", "environment character varying(30)", "external_action_count integer", "created_at timestamp with time zone"],
  "app.sandbox_run": ["id uuid", "tenant_id uuid", "job_id uuid", "session_id uuid", "scenario character varying(40)", "environment character varying(30)", "status character varying(24)", "initial_clock_tick integer", "created_at timestamp with time zone"],
  "app.sandbox_run_event": ["id uuid", "tenant_id uuid", "run_id uuid", "event_index integer", "kind character varying(30)", "fake_clock_tick integer", "command_id uuid", "payload_hash character(64)", "created_at timestamp with time zone"],
  "app.sandbox_work": ["id uuid", "tenant_id uuid", "run_id uuid", "step integer", "adapter character varying(40)", "input_hash character(64)", "amount_pence bigint", "currency character(3)", "environment character varying(30)", "approved boolean"],
  "app.schedule_of_rates": ["tenant_id uuid", "id uuid", "reference text", "actor_membership_id uuid", "created_at timestamp with time zone"],
  "app.scope_identity": ["id uuid", "tenant_id uuid", "job_id uuid", "state character varying(16)", "created_at timestamp with time zone"],
  "app.scope_lineage": ["tenant_id uuid", "job_id uuid", "parent_scope_item_id uuid", "child_scope_item_id uuid", "kind character varying(16)", "created_at timestamp with time zone"],
  "app.scope_progress": ["tenant_id uuid", "job_id uuid", "scope_item_id uuid", "stage character varying(16)", "revision integer", "updated_at timestamp with time zone"],
  "app.scope_revision": ["id uuid", "tenant_id uuid", "job_id uuid", "scope_item_id uuid", "revision integer", "description character varying(500)", "quantity_decimal character varying(40)", "unit character varying(40)", "unit_price_pence bigint", "total_pence bigint", "created_at timestamp with time zone"],
  "app.simulated_settlement_event": ["id uuid", "tenant_id uuid", "job_id uuid", "obligation_id uuid", "provider_event_id character varying(200)", "amount_pence bigint", "currency character(3)", "label character varying(32)", "simulated_at timestamp with time zone", "recorded_at timestamp with time zone"],
  "app.site": ["tenant_id uuid", "id uuid", "retention_class text"],
  "app.site_revision": ["tenant_id uuid", "id uuid", "site_id uuid", "revision integer", "payload jsonb", "match_key jsonb", "created_at timestamp with time zone"],
  "app.site_visit": ["tenant_id uuid", "id uuid", "job_id uuid", "work_order_id uuid", "membership_id uuid", "started_at timestamp with time zone", "completed_at timestamp with time zone"],
  "app.sor_item": ["tenant_id uuid", "version_id uuid", "code text", "description text", "unit text", "rate_pence bigint", "standard_minutes integer"],
  "app.sor_version": ["tenant_id uuid", "id uuid", "schedule_id uuid", "reference text", "effective_from date", "item_count integer", "content_hash character(64)", "command_id uuid", "request_hash character(64)", "actor_membership_id uuid", "created_at timestamp with time zone"],
  "app.stage_completion": ["id uuid", "tenant_id uuid", "job_id uuid", "scope_item_id uuid", "stage character varying(40)", "evidence_link_id uuid", "command_id uuid", "completed_at timestamp with time zone"],
  "app.stage_review_event": ["id uuid", "tenant_id uuid", "stage_completion_id uuid", "evidence_invalidation_id uuid", "event_type character varying(30)", "created_at timestamp with time zone"],
  "app.supplier_bill_supersession": ["id uuid", "tenant_id uuid", "job_id uuid", "command_id uuid", "revision integer", "original_fact_revision_id uuid", "replacement_fact_revision_id uuid", "confirmed_reduction_pence bigint", "actor_ref text", "subject_ref uuid", "payload_hash character(64)", "audit_event_id uuid", "created_at timestamp with time zone"],
  "app.supplier_document": ["id uuid", "tenant_id uuid", "job_id uuid", "supplier_context character varying(120)", "document_type character varying(20)", "document_number character varying(120)", "content_hash character(64)", "status character varying(30)", "hold_reason text", "recognized_debt_pence bigint", "created_at timestamp with time zone"],
  "app.supplier_document_intake": ["id uuid", "tenant_id uuid", "job_id uuid", "document_id uuid", "fixture_id character varying(80)", "channel character varying(20)", "alias character varying(200)", "result character varying(20)", "reason text", "created_at timestamp with time zone"],
  "app.supplier_document_version": ["id uuid", "tenant_id uuid", "job_id uuid", "document_id uuid", "version integer", "media_type character varying(100)", "byte_length integer", "content_hash character(64)", "page_count integer", "parent_version_id uuid", "page_from integer", "page_to integer", "created_at timestamp with time zone"],
  "app.supplier_fact_proposal": ["id uuid", "tenant_id uuid", "job_id uuid", "document_id uuid", "document_version_id uuid", "revision integer", "parser_version text", "source_hash character(64)", "document_type character varying(20)", "quantity_decimal numeric(20,6)", "unit_price_pence bigint", "net_pence bigint", "source_page integer", "span_start integer", "span_end integer", "source_region text", "issues jsonb", "created_at timestamp with time zone"],
  "app.supplier_fact_revision": ["id uuid", "tenant_id uuid", "job_id uuid", "document_id uuid", "proposal_id uuid", "command_id uuid", "revision integer", "actor_ref text", "document_type character varying(20)", "quantity_decimal numeric(20,6)", "unit_price_pence bigint", "net_pence bigint", "origin character varying(30)", "disposition character varying(30)", "payload_hash character(64)", "created_at timestamp with time zone"],
  "app.supplier_match_allocation": ["id uuid", "tenant_id uuid", "job_id uuid", "match_revision_id uuid", "receipt_version_id uuid", "quantity_decimal numeric(20,6)", "unit character varying(30)", "created_at timestamp with time zone"],
  "app.supplier_match_proposal": ["id uuid", "tenant_id uuid", "job_id uuid", "digest character(64)", "state character varying(20)", "ambiguity_reason character varying(40)", "order_revision_id uuid", "receipt_version_ids uuid[]", "bill_revision_id uuid", "actor_ref text", "subject_ref uuid", "payload_hash character(64)", "audit_event_id uuid", "created_at timestamp with time zone"],
  "app.supplier_match_revision": ["id uuid", "tenant_id uuid", "job_id uuid", "proposal_id uuid", "command_id uuid", "revision integer", "order_revision_id uuid", "receipt_version_ids uuid[]", "bill_revision_id uuid", "actor_ref text", "subject_ref uuid", "payload_hash character(64)", "audit_event_id uuid", "invalidates_unresolved_findings boolean", "created_at timestamp with time zone"],
  "app.synthetic_evidence_original": ["tenant_id uuid", "upload_id uuid", "job_id uuid", "scope_item_id uuid", "object_key character varying(1024)", "object_version_id character varying(1024)", "environment character varying(24)", "content_type character varying(100)", "bytes bytea", "created_at timestamp with time zone"],
  "app.synthetic_obligation": ["id uuid", "tenant_id uuid", "job_id uuid", "activation_id uuid", "principal_pence bigint", "currency character(3)", "state character varying(16)", "label character varying(32)", "created_at timestamp with time zone"],
  "app.synthetic_recovery_receipt": ["id uuid", "tenant_id uuid", "job_id uuid", "source_identity character varying(200)", "reconciliation_identity character varying(200)", "status character varying(16)", "gross_pence bigint", "currency character(3)", "synthetic boolean", "settled_at timestamp with time zone", "created_at timestamp with time zone"],
  "app.team": ["tenant_id uuid", "id uuid", "branch_id uuid", "branch_kind text", "name text"],
  "app.team_membership": ["tenant_id uuid", "id uuid", "membership_id uuid", "team_id uuid", "revision integer", "active boolean"],
  "app.variation": ["id uuid", "tenant_id uuid", "job_id uuid", "scope_item_id uuid", "existing_scope_item_id uuid", "lineage_parent_scope_item_id uuid", "capture_kind character varying(32)", "capture_text character varying(5000)", "description character varying(500)", "ai_rate_pence bigint", "ai_source_ref character varying(300)", "ai_source_hash character(64)", "ai_rate_version character varying(80)", "state character varying(12)", "current_revision_id uuid", "created_at timestamp with time zone", "job_track character varying(16)", "origin character varying(32)"],
  "app.variation_approval": ["id uuid", "tenant_id uuid", "job_id uuid", "variation_id uuid", "revision_id uuid", "revision integer", "content_hash character(64)", "signed_delta_pence bigint", "method character varying(24)", "actor_membership_id uuid", "evidence_id uuid", "approved_at timestamp with time zone", "created_at timestamp with time zone"],
  "app.variation_rate_observation": ["id uuid", "tenant_id uuid", "job_id uuid", "variation_id uuid", "revision_id uuid", "unit character varying(40)", "unit_rate_pence bigint", "provenance_kind character varying(32)", "source_ref character varying(300)", "source_hash character(64)", "rate_version character varying(80)", "observed_at timestamp with time zone"],
  "app.variation_rejection": ["id uuid", "tenant_id uuid", "job_id uuid", "variation_id uuid", "revision_id uuid", "actor_membership_id uuid", "reason_code character varying(40)", "rejected_at timestamp with time zone"],
  "app.variation_revision": ["id uuid", "tenant_id uuid", "job_id uuid", "variation_id uuid", "scope_item_id uuid", "revision integer", "previous_revision_id uuid", "description character varying(500)", "quantity_decimal character varying(40)", "unit character varying(40)", "unit_rate_pence bigint", "signed_delta_pence bigint", "content_hash character(64)", "confirmed_by_membership_id uuid", "rate_provenance_kind character varying(32)", "rate_source_ref character varying(300)", "rate_source_hash character(64)", "rate_version character varying(80)", "created_at timestamp with time zone"],
  "app.watchdog_command_identity": ["tenant_id uuid", "command_id uuid", "job_id uuid", "command_type text", "request_hash character(64)", "created_at timestamp with time zone", "claimed_xact xid8"],
  "app.watchdog_command_result": ["tenant_id uuid", "command_id uuid", "result jsonb", "created_at timestamp with time zone"],
  "app.work_order": ["tenant_id uuid", "id uuid", "job_id uuid", "client_id uuid", "contract_id uuid", "contract_version_id uuid", "reference text", "created_at timestamp with time zone"],
  "app.work_order_current": ["tenant_id uuid", "work_order_id uuid", "revision_id uuid"],
  "app.work_order_line": ["tenant_id uuid", "id uuid", "work_order_id uuid", "revision_id uuid", "job_id uuid", "position integer", "scope_item_id uuid", "client_line_reference text", "sor_version_id uuid", "sor_code text", "unit text", "rate_pence bigint", "quantity text", "net_pence bigint", "origin text"],
  "app.work_order_revision": ["tenant_id uuid", "id uuid", "work_order_id uuid", "revision integer", "status text", "issued_on date", "due_on date", "priority text", "content_hash character(64)", "diff jsonb", "batch_id uuid", "row_number integer", "sor_version_id uuid", "adjustment_numerator bigint", "adjustment_denominator bigint", "net_total_pence bigint", "created_at timestamp with time zone"],
  "audit_control.audit_head": ["tenant_id uuid", "sequence bigint", "event_hash character(64)"],
  "audit_control.checkpoint": ["tenant_id uuid", "sequence bigint", "event_hash character(64)", "recorded_at timestamp with time zone"],
  "control_plane.contractor_practice_session": ["session_id uuid", "tenant_id uuid", "membership_id uuid", "identity_user_id uuid"],
  "control_plane.practice_session": ["token_digest character(64)", "environment text", "created_at timestamp with time zone", "expires_at timestamp with time zone", "revoked_at timestamp with time zone"],
  "control_plane.tenant": ["id uuid", "created_at timestamp with time zone"],
  "identity.challenge": ["environment character varying(30)", "id uuid", "email character varying(320)", "purpose character varying(16)", "invitation_id uuid", "digest character(64)", "requested_at timestamp with time zone", "expires_at timestamp with time zone", "attempts integer", "consumed_at timestamp with time zone", "verified boolean", "delivery_state character varying(24)"],
  "identity.identity_user": ["id uuid", "created_at timestamp with time zone"],
  "identity.invitation": ["environment character varying(30)", "id uuid", "email character varying(320)", "tenant_id uuid", "account_id uuid", "role character varying(40)", "expires_at timestamp with time zone", "accepted_at timestamp with time zone", "issuer_user_id uuid"],
  "identity.membership_locator": ["user_id uuid", "tenant_id uuid", "membership_id uuid"],
  "identity.request_window": ["ip_digest character(64)", "requested_at timestamp with time zone"],
  "identity.security_event": ["id uuid", "event_type character varying(40)", "subject_id uuid", "created_at timestamp with time zone"],
  "identity.session": ["id uuid", "user_id uuid", "environment character varying(30)", "token_digest character(64)", "csrf_token character varying(64)", "expires_at timestamp with time zone", "revoked_at timestamp with time zone"],
  "identity.user_email": ["email character varying(320)", "user_id uuid"],
  "infrastructure.outbox_signal": ["action_id uuid", "tenant_id uuid", "created_at timestamp with time zone", "enqueued_at timestamp with time zone"],
};
