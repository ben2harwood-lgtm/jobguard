import { readFileSync } from "node:fs";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContractorRepository, canonicalJson, sha256Hex } from "../src/index.js";
import { cluster, startSession, currentCommand, counts, type Cluster, type SessionFixture } from "./contractor-practice-session-fixtures.js";
import { rolledBack } from "./upgrade-proof-utils.js";

const signature = "app.contractor_admin_command(uuid,jsonb,text)";
const oldCheck = "IF rev<>(payload->>'expectedRevision')::integer THEN";
const newCheck = "IF (payload->>'expectedRevision') IS NULL OR rev<>(payload->>'expectedRevision')::integer THEN";
const migration = readFileSync(new URL("../migrations/0845_contractor_admin_expected_revision.sql", import.meta.url), "utf8");

it("keeps the 0816 function intact except the required revision check and preserves its security posture", () => {
 const predecessor = readFileSync(new URL("../migrations/0816_contractor_admin_owner_guard.sql", import.meta.url), "utf8");
 const body = (sql: string) => sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION"), sql.indexOf("END $$;") + "END $$;".length);
 expect(body(migration).replace(newCheck, oldCheck)).toBe(body(predecessor));
 expect(body(migration).split(newCheck)).toHaveLength(2);
 expect(migration.trim()).toMatch(/^BEGIN;[\s\S]*COMMIT;$/u);
 expect(migration).toContain(`ALTER FUNCTION ${signature} OWNER TO jobguard_migration;`);
 expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;`);
 expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO jobguard_runtime;`);
});

describe("contractor admin requires expectedRevision (real embedded PostgreSQL)", () => {
 let c: Cluster, f: SessionFixture, repo: ContractorRepository;
 const original = process.env.JOBGUARD_ENV;
 const kinds = ["grant.create", "member.invite", "membership.revoke"] as const;
 const writes = () => counts(c.admin, ["identity.identity_user", "app.membership", "app.contractor_member", "app.role_grant", "app.role_grant_revocation", "app.contractor_membership_revocation", "app.team_membership", "app.command_receipt", "app.audit_event"]);
 const definition = async () => (await c.admin.query("SELECT pg_get_functiondef($1::regprocedure) definition", [signature])).rows[0]!.definition as string;
 async function command(kind: typeof kinds[number]): Promise<Record<string, unknown>> {
  const invite = await currentCommand(c, f, { kind: "member.invite", role: "read_only", scope: { kind: "tenant", id: f.p.tenantId }, clientId: null, contractId: null, email: "fictional@revision.invalid" });
  if (kind === "member.invite") return invite;
  await repo.command(f.p, invite);
  // membership.revoke is strict: it carries only the membership to revoke.
  return currentCommand(c, f, kind === "membership.revoke" ? { kind, membershipId: invite.id }
   : { kind, membershipId: invite.id, role: "finance", scope: { kind: "tenant", id: f.p.tenantId }, contractId: null });
 }
 async function direct(db: PoolClient, raw: Record<string, unknown>) {
  await db.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]);
  await db.query("SET LOCAL ROLE jobguard_runtime");
  return db.query("SELECT app.contractor_admin_command($1,$2::jsonb,$3) result", [f.p.membershipId, JSON.stringify(raw), sha256Hex(canonicalJson(raw))]);
 }
 async function refused(raw: Record<string, unknown>) {
  const before = await writes();
  await expect(rolledBack(c.admin, db => direct(db, raw))).rejects.toMatchObject({ code: "40001", message: "STALE_REVISION" });
  expect(await writes()).toEqual(before);
 }
 beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  c = await cluster(); // Fresh migrate applies both the 0816 predecessor and 0845.
  f = await startSession(c); repo = new ContractorRepository(c.runtime);
 }, 120000);
 afterAll(async () => { await c?.close(); if (original === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = original; });

 it.each(kinds)("%s refuses missing, null and wrong revisions without writes; the correct revision works", async kind => {
  const raw = await command(kind);
  const missing = { ...raw }; delete missing.expectedRevision;
  await refused(missing);
  await refused({ ...raw, expectedRevision: null });
  await refused({ ...raw, expectedRevision: Number(raw.expectedRevision) + 1 });
  await expect(repo.command(f.p, raw)).resolves.toMatchObject({ kind, revision: Number(raw.expectedRevision) + 1 });
  expect((await currentCommand(c, f, {})).expectedRevision).toBe(Number(raw.expectedRevision) + 1);
 });

 it.each(kinds)("scratch restoration of the old check permits missing-key %s and is rolled back", async kind => {
  const raw = await command(kind); delete raw.expectedRevision;
  const before = await writes(), fixed = await definition();
  expect(fixed.split(newCheck)).toHaveLength(2);
  await rolledBack(c.admin, async db => {
   await db.query(fixed.replace(newCheck, oldCheck));
   const result = await direct(db, raw);
   expect(result.rows[0]!.result).toMatchObject({ kind });
   // This successful mutant is killed by the same stale-revision rejection assertion.
   await expect(async () => {
    await expect(Promise.resolve(result)).rejects.toMatchObject({ code: "40001", message: "STALE_REVISION" });
   }).rejects.toThrow();
  });
  expect(await definition()).toBe(fixed);
  expect(await writes()).toEqual(before);
  await refused(raw);
 });
});
