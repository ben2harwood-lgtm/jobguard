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
    // The runner remains idempotent after the manual upgrade (and may apply other independently reserved migrations if present).
    const history = await rowsOf(await tableNames());
    await migrate(admin);
    expect(await rowsOf(Object.keys(history))).toEqual(history);
  });
});
const beforeRepairPrivileges: Awaited<ReturnType<typeof privileges>> = { roles: [], memberships: [], tables: [], policies: [], routines: [] };
