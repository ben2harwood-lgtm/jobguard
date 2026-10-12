import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ContractorRepository, authenticatePracticeSession, contractorSessionContext, migrate, MIGRATION_URLS } from "../src/index.js";
import * as proof from "./upgrade-proof-utils.js";
import { startBeforeMigration, applyMigration, migrationName, startSession, endHomeRecord, counts, refused, companyRows, type Cluster, type SessionFixture } from "./contractor-practice-session-fixtures.js";
// An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare;
// then apply everything after N and require success twice. Compare named pre-existing columns and rows by identity.
// Later nullable columns, routine replacements and inserted rows pass; microsecond changes and retypes fail.
let c: Cluster;
const original = process.env.JOBGUARD_ENV;
const tables = ["control_plane.tenant", "control_plane.practice_session", "identity.identity_user", "app.account", "app.membership", "app.contractor_member", "app.role_grant", "app.role_grant_revocation", "app.team_membership", "app.commercial_track_assignment", "app.command_receipt", "app.audit_event"];
const replacements = ["app.contractor_session(uuid)", "app.start_contractor_practice(uuid)", "app.contractor_admin_command(uuid,jsonb,text)"];
const ownerLine = "  IF payload->>'role'='owner' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;\n";
type Captured = { raw: string; digest: string; bytes: string; class: "A" | "B" | "C" | "D" };
let sessions: Captured[], columns: Awaited<ReturnType<typeof proof.proofColumns>>, other: Awaited<ReturnType<typeof proof.proofBefore>>;
let fixtures: SessionFixture[], ownerCommand: Record<string, unknown>, functionsBefore: Record<string, { definition: string; attributes: string }>, homeBefore: unknown, beforeCalls: unknown[], low: string, high: string;
const call = async (session: string) => (await c.runtime.query("SELECT row_to_json(x)::text bytes FROM app.contractor_session($1) x", [session])).rows;
async function functions() {
 const result = await c.admin.query(`SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,
  (SELECT row_to_json(x)::text FROM (SELECT p.prosecdef,p.proconfig,p.provolatile,p.proargtypes::text,p.prorettype::text,p.proretset,pg_get_function_result(p.oid) result,pg_get_userbyid(p.proowner) owner,p.proacl::text acl) x) attributes FROM pg_proc p WHERE p.pronamespace='app'::regnamespace ORDER BY 1`);
 return Object.fromEntries(result.rows.map(row => [row.signature as string, { definition: row.definition as string, attributes: row.attributes as string }]));
}
async function homeCatalogue() {
 return {
  columns: await proof.proofColumns(c.admin, "control_plane.practice_session"),
  constraints: (await c.admin.query("SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='control_plane.practice_session'::regclass ORDER BY conname")).rows,
  triggers: (await c.admin.query("SELECT tgname,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgrelid='control_plane.practice_session'::regclass AND NOT tgisinternal ORDER BY tgname")).rows,
  table: (await c.admin.query("SELECT pg_get_userbyid(relowner) owner,relacl::text acl FROM pg_class WHERE oid='control_plane.practice_session'::regclass")).rows,
 };
}
async function sessionDifferences(db: Pool | PoolClient, exactConversion = true) {
 const diffs: string[] = []; const now = new Map((await proof.proofColumns(db, "control_plane.contractor_practice_session")).map(x => [x.name, x.type]));
 for (const column of columns) if (now.get(column.name) !== column.type) diffs.push(`type:${column.name}`);
 for (const before of sessions) {
  const result = await db.query(`SELECT x.session_id::text row_number,(SELECT row_to_json(t)::text FROM (SELECT x.tenant_id,x.membership_id,x.identity_user_id) t) bytes,
   x.revoked_at IS NULL unrevoked,x.expires_at=x.created_at ended,x.created_at BETWEEN $2::timestamptz AND $3::timestamptz bounded,
   CASE WHEN p.token_digest IS NULL THEN false ELSE x.expires_at=p.expires_at AND x.expires_at>x.created_at AND x.expires_at<=x.created_at+interval '7 days' END home_cap,x.created_at::text start,
   row_to_json(x)::text full_text FROM control_plane.contractor_practice_session x LEFT JOIN control_plane.practice_session p ON p.token_digest=x.session_digest WHERE x.session_digest=$1`, [before.digest, low, high]);
  if (result.rowCount !== 1) { diffs.push("row-count"); continue; } const row = result.rows[0];
  if (row.bytes !== before.bytes) diffs.push("columns-changed");
  if (sessions.some(x => x.raw === row.row_number)) diffs.push("raw-row-number");
  if (sessions.some(x => row.full_text.includes(x.raw))) diffs.push("stored-session-value");
  if (exactConversion && (!row.unrevoked || !row.bounded || (before.class === "A" ? !row.home_cap : !row.ended))) diffs.push(`conversion:${before.class}`);
 }
 if (exactConversion) {
  const times = (await db.query("SELECT count(DISTINCT created_at)::int n FROM control_plane.contractor_practice_session WHERE session_digest=ANY($1::bpchar[])", [sessions.map(x => x.digest)])).rows[0].n;
  if (times !== 1) diffs.push("conversion-times");
 }
 return diffs;
}
async function compare(db: Pool | PoolClient) {
 expect(await proof.proofDifferences(db, other)).toEqual({ rows: [], types: [] }); expect(await sessionDifferences(db)).toEqual([]);
}
async function rawCommand(f: SessionFixture, fields: Record<string, unknown>) {
 const revision = (await new ContractorRepository(c.runtime).query(f.p, { version: "contractor-query.v1", tenantId: f.p.tenantId, resource: "organisation" })).revision;
 return { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: revision, ...fields };
}
beforeAll(async () => {
 process.env.JOBGUARD_ENV = "synthetic_demo"; c = await startBeforeMigration();
 // The bridge exists before N; its merged lookup still resolves B and C here.
 fixtures = [await startSession(c, true), await startSession(c, true), await startSession(c, true), await startSession(c, true), await startSession(c, false)];
 await endHomeRecord(c, fixtures[2]!.session, "expired"); await endHomeRecord(c, fixtures[3]!.session, "revoked");
 const f = fixtures[0]!, repo = new ContractorRepository(c.runtime), view = await repo.query(f.p, { version: "contractor-query.v1", tenantId: f.p.tenantId, resource: "organisation" });
 const member = await rawCommand(f, { kind: "member.invite", role: "operative", scope: { kind: "team", id: view.teams[0]!.id }, clientId: null, contractId: null, email: "member@fictional.invalid" }); await repo.command(f.p, member);
 const grant = await rawCommand(f, { kind: "grant.create", role: "read_only", membershipId: member.id, scope: { kind: "tenant", id: f.p.tenantId }, contractId: null }); await repo.command(f.p, grant);
 ownerCommand = await rawCommand(f, { kind: "grant.create", role: "owner", membershipId: member.id, scope: { kind: "tenant", id: f.p.tenantId }, contractId: null }); await repo.command(f.p, ownerCommand);
 await repo.command(f.p, await rawCommand(f, { kind: "grant.revoke", grantId: grant.id }));
 beforeCalls = await Promise.all(fixtures.map(async f => ({ principal: await repo.resolveSession(f.session), sql: await call(f.session) })));
 for (const f of fixtures.slice(2, 4)) { await expect(authenticatePracticeSession(c.runtime, f.session)).rejects.toThrow("UNAUTHENTICATED"); expect(await repo.resolveSession(f.session)).toEqual(f.p); }
 other = await proof.proofBefore(c.admin, tables); for (const table of tables) expect(Object.keys(other[table]!.rows).length).toBeGreaterThan(0);
 columns = await proof.proofColumns(c.admin, "control_plane.contractor_practice_session");
 sessions = (await c.admin.query(`SELECT x.session_id::text raw,encode(sha256(convert_to(x.session_id::text,'UTF8')),'hex') digest,
  (SELECT row_to_json(t)::text FROM (SELECT x.tenant_id,x.membership_id,x.identity_user_id) t) bytes,
  CASE WHEN p.token_digest IS NULL THEN 'D' WHEN p.revoked_at IS NOT NULL THEN 'C' WHEN p.expires_at<=clock_timestamp() THEN 'B' ELSE 'A' END class
  FROM control_plane.contractor_practice_session x LEFT JOIN control_plane.practice_session p ON p.token_digest=encode(sha256(convert_to(x.session_id::text,'UTF8')),'hex')`)).rows as Captured[];
 expect(sessions.length).toBeGreaterThanOrEqual(5); expect(sessions.filter(x => x.class === "A")).toHaveLength(2); for (const kind of ["B", "C", "D"]) expect(sessions.some(x => x.class === kind)).toBe(true);
 const migrationSql = await readFile(MIGRATION_URLS.find(url => url.pathname.endsWith(migrationName))!, "utf8");
 await expect(proof.rolledBack(c.admin, async client => { await client.query("CREATE TABLE public.practice_rekey_control(session_id uuid REFERENCES control_plane.contractor_practice_session(session_id))"); return client.query(migrationSql); })).rejects.toMatchObject({ message: "PRACTICE_SESSION_REKEY_UNSAFE" });
 expect(await proof.proofColumns(c.admin, "control_plane.contractor_practice_session")).toEqual(columns);
 functionsBefore = await functions(); homeBefore = await homeCatalogue(); low = (await c.admin.query("SELECT clock_timestamp()::text t")).rows[0].t;
 await applyMigration(c); high = (await c.admin.query("SELECT clock_timestamp()::text t")).rows[0].t;
}, 60000);
afterAll(async () => { await c?.close(); if (original === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = original; });
it("[PH22] replacement attributes at N alone are unchanged", async () => {
 const now = await functions(); for (const signature of replacements) expect(now[signature]!.attributes).toBe(functionsBefore[signature]!.attributes);
});
it("[PH23] populated conversion preserves live home sessions and ends B, C and D without touching other rows", async () => {
 await compare(c.admin);
 expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE event_type='contractor.practice_session.revoked'")).rows[0].n).toBe(0);
 for (let i = 0; i < fixtures.length; i++) {
  const f = fixtures[i]!, repo = new ContractorRepository(c.runtime), beforeCompany = await companyRows(c, f.p.tenantId);
  if (i < 2) { expect({ principal: await repo.resolveSession(f.session), sql: await call(f.session) }).toEqual(beforeCalls[i]); await expect(authenticatePracticeSession(c.runtime, f.session)).resolves.toBeDefined(); }
  else { await refused(repo.resolveSession(f.session)); expect(await call(f.session)).toEqual([]); const before = await counts(c.admin); await refused(repo.startPractice(f.session)); expect(await counts(c.admin)).toEqual(before); }
  expect(await companyRows(c, f.p.tenantId)).toEqual(beforeCompany);
 }
 const f = fixtures[0]!, repo = new ContractorRepository(c.runtime), before = await counts(c.admin), recorded = (await c.admin.query("SELECT result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, ownerCommand.commandId])).rows[0].result;
 expect(await repo.command(f.p, ownerCommand)).toEqual(recorded); expect(await counts(c.admin)).toEqual(before);
 const newer = await rawCommand(f, { kind: "grant.create", role: "owner", membershipId: ownerCommand.membershipId, scope: ownerCommand.scope, contractId: null }); await expect(repo.command(f.p, newer)).rejects.toMatchObject({ code: "FORBIDDEN" });
 expect((await c.admin.query("SELECT g.id FROM app.role_grant g WHERE g.tenant_id=$1 AND g.id=$2 AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE r.tenant_id=g.tenant_id AND r.grant_id=g.id)", [f.p.tenantId, ownerCommand.id])).rowCount).toBe(1);
});
it("[PH24] only three old function texts differ at N alone and home is unchanged", async () => {
 const now = await functions(); expect(Object.keys(functionsBefore).filter(signature => now[signature]!.definition !== functionsBefore[signature]!.definition).sort()).toEqual([...replacements].sort());
 expect(Object.keys(now).length - Object.keys(functionsBefore).length).toBe(6);
 const signature = "app.contractor_admin_command(uuid,jsonb,text)", old = functionsBefore[signature]!.definition, current = now[signature]!.definition;
 expect(current.replace(" WHEN 'grant.create' THEN\n" + ownerLine, " WHEN 'grant.create' THEN\n")).toBe(old);
 const source = await readFile(MIGRATION_URLS.find(url => url.pathname.endsWith(migrationName))!, "utf8");
 expect(source.match(/control_plane\.practice_session\b/gu)).toHaveLength(1);
 const newLookup = now["app.contractor_session(uuid)"]!.definition; expect(newLookup).toContain("SELECT l.tenant_id,l.membership_id,l.identity_user_id FROM app.contractor_practice_session_live(s) l");
 for (const signature of ["app.issue_practice_session(text)", "app.authenticate_practice_session(text,uuid)"]) expect(now[signature]).toEqual(functionsBefore[signature]);
 expect(await homeCatalogue()).toEqual(homeBefore);
});
it.each(["membership", "raw-row-number", "D-cap", "B-cap", "A-home-cap"])("[PH23] rolled-back session comparison refuses %s", async control => {
 await proof.rolledBack(c.admin, async client => {
  const selected = sessions.find(x => x.class === (control === "D-cap" ? "D" : control === "B-cap" ? "B" : "A"))!;
  await client.query("ALTER TABLE control_plane.contractor_practice_session DISABLE TRIGGER USER");
  if (control === "membership") await client.query("UPDATE control_plane.contractor_practice_session SET membership_id=$2 WHERE session_digest=$1", [selected.digest, ownerCommand.membershipId]);
  else if (control === "raw-row-number") await client.query("UPDATE control_plane.contractor_practice_session SET session_id=$2 WHERE session_digest=$1", [selected.digest, selected.raw]);
  else await client.query(`UPDATE control_plane.contractor_practice_session SET expires_at=${control === "A-home-cap" ? "expires_at+interval '1 microsecond'" : "created_at+interval '1 microsecond'"} WHERE session_digest=$1`, [selected.digest]);
  await client.query("ALTER TABLE control_plane.contractor_practice_session ENABLE TRIGGER USER"); expect((await sessionDifferences(client)).length).toBeGreaterThan(0);
 }); await compare(c.admin);
});
it("[PH23] microsecond and pre-existing type changes fail the same helper comparison", async () => {
 await proof.rolledBack(c.admin, async client => { await client.query("UPDATE control_plane.tenant SET created_at=created_at+interval '1 microsecond' WHERE id=$1", [fixtures[0]!.p.tenantId]); expect((await proof.proofDifferences(client, other)).rows.length).toBeGreaterThan(0); });
 await proof.rolledBack(c.admin, async client => { await client.query("ALTER TABLE control_plane.tenant ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC'"); expect((await proof.proofDifferences(client, other)).types.length).toBeGreaterThan(0); });
});
it("[PH23] later nullable columns, changed function and inserted rows pass", async () => {
 await proof.rolledBack(c.admin, async client => {
  await client.query("ALTER TABLE control_plane.contractor_practice_session ADD COLUMN later_nullable text"); await client.query("ALTER TABLE control_plane.tenant ADD COLUMN later_nullable text");
  await proof.scratchReplaceFunction(client, "app.contractor_session(uuid)"); await client.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [randomUUID()]);
  const f = fixtures[0]!; await client.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 day')", [randomUUID(), f.p.tenantId, f.p.membershipId, f.p.identityUserId, "c".repeat(64)]);
  await compare(client);
 });
});
it("[PH23] successors and repeated migrate preserve named existing rows and full types", async () => {
 const names = MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!); expect(names).toEqual([...names].sort()); expect(names).toContain(migrationName);
 // No function text is pinned at head: PRACTICE-WORKER-SWITCH replaces the lookup later.
 await migrate(c.admin); await migrate(c.admin); await compare(c.admin);
});
