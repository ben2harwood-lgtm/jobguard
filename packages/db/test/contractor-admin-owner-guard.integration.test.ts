import { testBoundTenantContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContractorRepository, canonicalJson, sha256Hex, type AuthenticatedMembership } from "../src/index.js";
import { cluster, startSession, currentCommand, ownerTx, counts, type Cluster, type SessionFixture } from "./contractor-practice-session-fixtures.js";
import { rolledBack } from "./upgrade-proof-utils.js";

const signature = "app.contractor_admin_command(uuid,jsonb,text)";
const migration = readFileSync(new URL("../migrations/0695_contractor_admin_owner_guard.sql", import.meta.url), "utf8");
const guard = (kind: "grant.revoke" | "membership.revoke") =>
 migration.slice(migration.indexOf(` WHEN '${kind}' THEN\n  IF NOT actor_owner`)).split("  INSERT")[0].split("\n").slice(1).join("\n");
const selfGuard = "  IF member=actor AND NOT actor_owner THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;\n";

it("keeps the predecessor command intact except the three permission guards and owner lookup", () => {
 const predecessor = readFileSync(new URL("../migrations/0549_contractor_feature_guards.sql", import.meta.url), "utf8")
  .split("CREATE OR REPLACE FUNCTION app.guard_contractor_grant")[0].split("CREATE OR REPLACE FUNCTION app.contractor_admin_command")[1];
 let replacement = migration.split("CREATE OR REPLACE FUNCTION app.contractor_admin_command")[1]!.split("COMMIT;")[0]!;
 for (const check of [guard("grant.revoke"), guard("membership.revoke"), selfGuard]) {
  expect(check.length).toBeGreaterThan(20);
  expect(replacement.split(check)).toHaveLength(2);
  replacement = replacement.replace(check, "");
 }
 replacement = replacement.replace(" actor_owner boolean;", "")
  .replace(/ IF k IN\('grant.create','grant.revoke','membership.revoke'\) THEN\n[\s\S]*? END IF;\n/u, "")
  .replace(" WHEN 'grant.revoke' THEN\n", " WHEN 'grant.revoke' THEN")
  .replace(" WHEN 'membership.revoke' THEN\n", " WHEN 'membership.revoke' THEN");
 // The original single-line inserts have one space after THEN.
 replacement = replacement.replaceAll("THEN  INSERT", "THEN INSERT");
 expect(replacement).toBe(predecessor);
});

describe("contractor admin owner and grant boundaries (real PostgreSQL)", () => {
 let c: Cluster, f: SessionFixture, repo: ContractorRepository, admin: AuthenticatedMembership, member: AuthenticatedMembership;
 const original = process.env.JOBGUARD_ENV;
 const writes = () => counts(c.admin, ["app.membership", "app.role_grant", "app.role_grant_revocation", "app.contractor_membership_revocation", "app.command_receipt", "app.audit_event"]);
 const command = (fields: Record<string, unknown>) => currentCommand(c, f, fields);
 const grant = (target: AuthenticatedMembership, role: string, scopeId = f.p.tenantId, kind = "tenant") =>
  command({ kind: "grant.create", membershipId: target.membershipId, role, scope: { kind, id: scopeId }, contractId: null });
 async function invite(role: string) {
  const raw = await command({ kind: "member.invite", role, scope: { kind: "tenant", id: f.p.tenantId }, clientId: null, contractId: null, email: "fictional@guard.invalid" });
  await repo.command(f.p, raw);
  const row = (await c.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, raw.id])).rows[0]!;
  // LP-6d: the member acts through its own persisted credential, so refusals come from the owner guard, not the binding.
  return { ...f.p, membershipId: raw.id, identityUserId: row.identity_user_id, context: await testBoundTenantContext(c.admin, f.p.tenantId, raw.id as string) } as AuthenticatedMembership;
 }
 async function refused(actor: AuthenticatedMembership, raw: Record<string, unknown>) {
  const before = await writes();
  await expect(repo.command(actor, raw)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await writes()).toEqual(before);
  expect((await command({})).expectedRevision).toBe(raw.expectedRevision);
 }
 async function direct(db: PoolClient, actor: AuthenticatedMembership, raw: Record<string, unknown>) {
  await db.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]);
  // LP-6d: the direct call runs inside the actor's own bound request (its persisted fixture credential).
  await db.query("SELECT app.bind_request('real',$1,$2)", [sha256Hex(`lp6-test:${f.p.tenantId}:${actor.membershipId}`), f.p.tenantId]);
  await db.query("SET LOCAL ROLE jobguard_runtime");
  return db.query("SELECT app.contractor_admin_command($1,$2::jsonb,$3)", [actor.membershipId, JSON.stringify(raw), sha256Hex(canonicalJson(raw))]);
 }
 beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  c = await cluster(); // Fresh database applies every discovered migration, including this one.
  f = await startSession(c); repo = new ContractorRepository(c.runtime);
  admin = await invite("admin"); member = await invite("read_only");
 }, 120000);
 afterAll(async () => { await c?.close(); if (original === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = original; });

 it("admin cannot revoke an owner membership or its owner grant, and writes nothing", async () => {
  const ownerGrant = (await c.admin.query("SELECT id FROM app.role_grant WHERE tenant_id=$1 AND membership_id=$2 AND role='owner'", [f.p.tenantId, f.p.membershipId])).rows[0]!.id;
  await refused(admin, await command({ kind: "membership.revoke", membershipId: f.p.membershipId }));
  await refused(admin, await command({ kind: "grant.revoke", grantId: ownerGrant }));
 });
 it("also protects a non-owner membership holding an unrevoked owner grant, including its other grants", async () => {
  const holder = await invite("admin");
  const ordinary = await grant(holder, "admin"); await repo.command(f.p, ordinary);
  await ownerTx(c, f.p.tenantId, db => db.$client.query("INSERT INTO app.role_grant VALUES($1,$2,$3,'owner','tenant',$1,NULL)", [f.p.tenantId, randomUUID(), holder.membershipId]));
  await refused(admin, await command({ kind: "membership.revoke", membershipId: holder.membershipId }));
  await refused(admin, await command({ kind: "grant.revoke", grantId: ordinary.id }));
 });
 it.each(["finance", "commercial_manager", "admin"])("admin cannot self-grant %s", async role => {
  await refused(admin, await grant(admin, role));
 });
 it("admin can delegate its own powers; owner can grant finance and revoke admin grants and membership", async () => {
  const raw = await grant(member, "admin");
  await expect(repo.command(admin, raw)).resolves.toMatchObject({ kind: "grant.create" });
  await expect(repo.command(f.p, await grant(member, "finance"))).resolves.toMatchObject({ kind: "grant.create" });
  await expect(repo.command(f.p, await command({ kind: "grant.revoke", grantId: raw.id }))).resolves.toMatchObject({ kind: "grant.revoke" });
  const disposable = await invite("admin");
  await expect(repo.command(f.p, await command({ kind: "membership.revoke", membershipId: disposable.membershipId }))).resolves.toMatchObject({ kind: "membership.revoke" });
 });
 it.each(["membership.revoke", "grant.revoke", "self"] as const)("scratch mutation removing %s guard is killed by its refusal assertion and restored", async kind => {
  const raw = kind === "membership.revoke" ? await command({ kind, membershipId: f.p.membershipId })
   : kind === "grant.revoke" ? await command({ kind, grantId: (await c.admin.query("SELECT id FROM app.role_grant WHERE tenant_id=$1 AND membership_id=$2 AND role='owner'", [f.p.tenantId, f.p.membershipId])).rows[0]!.id })
   : await grant(admin, "admin");
  const before = await writes();
  const definition = (await c.admin.query("SELECT pg_get_functiondef($1::regprocedure) definition", [signature])).rows[0]!.definition as string;
  await rolledBack(c.admin, async db => {
   const check = kind === "self" ? selfGuard : guard(kind);
   expect(definition.split(check)).toHaveLength(2);
   await db.query(definition.replace(check, ""));
   // A successful forbidden command must fail the same rejection assertion used for the live function.
   const result = await direct(db, admin, raw); // Prove the mutant actually permits the forbidden write.
   await expect(async () => { await expect(Promise.resolve(result)).rejects.toMatchObject({ code: "42501", message: "FORBIDDEN" }); }).rejects.toThrow();
  });
  expect((await c.admin.query("SELECT pg_get_functiondef($1::regprocedure) definition", [signature])).rows[0]!.definition).toBe(definition);
  expect(await writes()).toEqual(before);
  await refused(admin, raw);
 });
});
