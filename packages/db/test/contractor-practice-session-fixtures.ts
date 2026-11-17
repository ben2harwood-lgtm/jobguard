import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import { expect } from "vitest";
import { cluster, ownerTx, type Cluster } from "./extra-fixtures.js";
import { MIGRATION_URLS, ContractorRepository, ContractorPartyRepository, WorkOrderRepository, contractorSessionContext, issuePracticeSession, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, type VerifiedTenantContext } from "../src/index.js";
export { cluster, ownerTx };
export type { Cluster };
export const migrationName = "0138_practice_session_hardening.sql";
export const digestOf = (session: string) => createHash("sha256").update(session.toLowerCase()).digest("hex");
export async function seedHomeOwner(c: Cluster) {
 await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [DEMO_TENANT_ID]);
 await c.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING", [DEMO_IDENTITY_USER_ID]);
 await c.admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional builder') ON CONFLICT DO NOTHING", [DEMO_TENANT_ID, DEMO_ACCOUNT_ID]);
 await c.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING", [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
}
/** Reuses the merged cluster's pre-0122 setup, then applies only predecessors of the named migration. */
export async function startBeforeMigration(name = migrationName) {
 if (name < "0122_extra_origin_persistence.sql") throw new Error("This starter requires a migration at or after 0122");
 const c = await cluster(true);
 for (const url of MIGRATION_URLS.filter(url => url.pathname.split("/").at(-1)! < name)) {
  const entry = url.pathname.split("/").at(-1)!;
  if ((await c.admin.query("SELECT 1 FROM public.jobguard_schema_migration WHERE migration_name=$1", [entry])).rowCount) continue;
  await c.admin.query(await readFile(url, "utf8"));
  await c.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [entry]);
 }
 await seedHomeOwner(c); return c;
}
export async function applyMigration(c: Cluster, name = migrationName) {
 const url = MIGRATION_URLS.find(url => url.pathname.split("/").at(-1) === name);
 if (!url) throw new Error("Named migration missing");
 await c.admin.query(await readFile(url, "utf8"));
 await c.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
}
export async function startSession(c: Cluster, home = false) {
 const session = home ? await issuePracticeSession(c.runtime) : randomUUID();
 const p = await new ContractorRepository(c.runtime).startPractice(session);
 const context: VerifiedTenantContext = await contractorSessionContext(c.runtime, session);
 return { session, p, context, home };
}
export const startSessionWithHomeRecord = (c: Cluster) => startSession(c, true);
export type SessionFixture = Awaited<ReturnType<typeof startSession>>;
export async function endHomeRecord(c: Cluster, session: string, kind: "expired" | "revoked") {
 await c.admin.query(`UPDATE control_plane.practice_session SET ${kind === "expired" ? "expires_at=clock_timestamp()-interval '1 second'" : "revoked_at=clock_timestamp()"} WHERE token_digest=$1`, [digestOf(session)]);
}
export async function makeSessionExpired(c: Cluster, session: string, age = "7 days 1 second") {
 const client = await c.admin.connect();
 try { await client.query("BEGIN"); await client.query("ALTER TABLE control_plane.contractor_practice_session DISABLE TRIGGER USER");
  await client.query("WITH time AS MATERIALIZED (SELECT clock_timestamp()-$2::interval r) UPDATE control_plane.contractor_practice_session SET created_at=time.r,expires_at=time.r+interval '7 days' FROM time WHERE session_digest=$1", [digestOf(session), age]);
  await client.query("ALTER TABLE control_plane.contractor_practice_session ENABLE TRIGGER USER"); await client.query("COMMIT");
 } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export const nothingWrittenTables = ["control_plane.contractor_practice_session", "control_plane.practice_session", "control_plane.tenant", "identity.identity_user", "app.account", "app.membership", "app.contractor_member", "app.org_unit", "app.team", "app.role_grant", "app.role_grant_revocation", "app.commercial_track_assignment", "app.command_receipt", "app.audit_event"];
export async function counts(db: Pool | PoolClient, tables = nothingWrittenTables) {
 return Object.fromEntries(await Promise.all(tables.map(async table => [table, (await db.query(`SELECT count(*)::text n FROM ${table}`)).rows[0]!.n])));
}
export const sessionText = async (c: Cluster, session: string) => (await c.admin.query("SELECT row_to_json(x)::text bytes FROM control_plane.contractor_practice_session x WHERE session_digest=$1", [digestOf(session)])).rows[0]?.bytes;
export const homeText = async (c: Cluster, session: string) => (await c.admin.query("SELECT row_to_json(x)::text bytes FROM control_plane.practice_session x WHERE token_digest=$1", [digestOf(session)])).rows[0]?.bytes;
export const reading = async (db: Pool | PoolClient) => (await db.query("SELECT clock_timestamp()::text reading")).rows[0]!.reading as string;
export const errorShape = (error: unknown) => {
 if (!(error instanceof Error)) throw new Error("Expected a typed error");
 return { class: error.constructor.name, message: error.message, own: Object.fromEntries(Object.entries(error)) };
};
export async function refused(work: Promise<unknown>) {
 let error: unknown; try { await work; } catch (caught) { error = caught; }
 expect(error).toMatchObject({ code: "UNAUTHENTICATED" }); return errorShape(error);
}
export const resolvers = (c: Cluster) => [
 (session: string) => new ContractorRepository(c.runtime).resolveSession(session),
 (session: string) => new ContractorPartyRepository(c.runtime).resolveSession(session),
 (session: string) => new WorkOrderRepository(c.runtime).resolveSession(session),
 (session: string) => contractorSessionContext(c.runtime, session),
];
export async function currentCommand(c: Cluster, f: SessionFixture, fields: Record<string, unknown>) {
 const view = await new ContractorRepository(c.runtime).query(f.p, { version: "contractor-query.v1", tenantId: f.p.tenantId, resource: "organisation" });
 return { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: view.revision, ...fields };
}
export async function companyRows(c: Cluster, tenant: string) {
 const tables = ["app.membership", "app.contractor_member", "app.role_grant", "app.role_grant_revocation", "app.team_membership", "app.org_unit", "app.team"];
 return Object.fromEntries(await Promise.all(tables.map(async table => [table, (await c.admin.query(`SELECT row_to_json(x)::text bytes FROM ${table} x WHERE tenant_id=$1 ORDER BY row_to_json(x)::text COLLATE "C"`, [tenant])).rows])));
}
