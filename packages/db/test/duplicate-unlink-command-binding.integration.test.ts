import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExtraRepository } from "../src/index.js";
import { cluster, fixture, linkInput, raise, type Cluster, type Fixture } from "./extra-fixtures.js";

const oldMigration = readFileSync(new URL("../migrations/0322_enterprise_duplicate_reconciliation.sql", import.meta.url), "utf8");
const oldGuard = oldMigration.slice(oldMigration.indexOf("CREATE OR REPLACE FUNCTION app.ent4b_fact_guard()"), oldMigration.indexOf("END $$;", oldMigration.indexOf("CREATE OR REPLACE FUNCTION app.ent4b_fact_guard()")) + "END $$;".length);
const migration = readFileSync(new URL("../migrations/0856_duplicate_unlink_command_binding.sql", import.meta.url), "utf8");
const binding = "   IF command.command_type IS DISTINCT FROM 'UnlinkDuplicate' OR command.semantic_key IS DISTINCT FROM ('extra-duplicate-unlink:'||NEW.job_id::text||':'||NEW.reverses_link_id::text||':'||NEW.command_id::text) THEN RAISE EXCEPTION 'DUPLICATE_LINK_REFUSED' USING ERRCODE='23514'; END IF;\n";

it("copies the latest guard verbatim except the unlink receipt binding", () => {
 expect(migration).toBe(`BEGIN;\n\n${oldGuard.replace("   SELECT * INTO prior_link", `${binding}   SELECT * INTO prior_link`)}\n\nCOMMIT;\n`);
});

describe("LATER-SAFETY-131 duplicate unlink command binding on PostgreSQL", () => {
 let c: Cluster, repo: ExtraRepository;
 beforeAll(async () => { c = await cluster(); repo = new ExtraRepository(c.runtime); }, 60_000);
 afterAll(async () => { await c?.close(); });

 async function linked() {
  const f = await fixture(c);
  const duplicate = (await repo.raiseExtra(f.ctx, raise(f))).variationId;
  const canonical = (await repo.raiseExtra(f.ctx, raise(f))).variationId;
  const link = await repo.linkDuplicate(f.ctx, linkInput(f, duplicate, canonical));
  return { f, duplicate, canonical, linkId: link.linkId };
 }
 type Linked = Awaited<ReturnType<typeof linked>>;
 const key = (f: Fixture, link: string, command: string) => `extra-duplicate-unlink:${f.jobId}:${link}:${command}`;

 // Owner-only receipt setup, then the actual INSERT as jobguard_runtime. Always
 // roll back: neither a processing fixture receipt nor the mutation can escape.
 async function probe(l: Linked, type: string, semantic: (command: string) => string, restoreOld = false) {
  const db = await c.admin.connect(), command = randomUUID(), id = randomUUID();
  try {
   await db.query("BEGIN");
   if (restoreOld) await db.query(oldGuard);
   await db.query("SELECT set_config('app.tenant_id',$1,true)", [l.f.p.tenantId]);
   await db.query("SET LOCAL ROLE jobguard_migration");
   await db.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
    VALUES($1,$2,$3,$4,$5,'processing',$6)`, [l.f.p.tenantId, command, type, semantic(command), "a".repeat(64), l.f.p.membershipId]);
   await db.query("SET LOCAL ROLE jobguard_runtime");
   expect((await db.query("SELECT current_user AS role")).rows[0].role).toBe("jobguard_runtime");
   expect((await db.query("SELECT status,actor_membership_id FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [l.f.p.tenantId, command])).rows).toEqual([{ status: "processing", actor_membership_id: l.f.p.membershipId }]);
   await db.query("SAVEPOINT unlink_attempt");
   let error: unknown;
   try {
    await db.query(`INSERT INTO app.extra_duplicate_link(tenant_id,id,job_id,duplicate_id,canonical_id,kind,reverses_link_id,reason_code,command_id,actor_membership_id)
     VALUES($1,$2,$3,$4,$5,'unlink',$6,'linked_in_error',$7,$8)`, [l.f.p.tenantId, id, l.f.jobId, l.duplicate, l.canonical, l.linkId, command, l.f.p.membershipId]);
   } catch (caught) {
    error = caught;
    await db.query("ROLLBACK TO SAVEPOINT unlink_attempt");
   }
   const rows = (await db.query("SELECT id FROM app.extra_duplicate_link WHERE tenant_id=$1 AND id=$2", [l.f.p.tenantId, id])).rows;
   return { error, rows };
  } finally {
   try { await db.query("ROLLBACK"); } finally { db.release(); }
  }
 }
 function assertRefused(result: Awaited<ReturnType<typeof probe>>) {
  expect(result.error).toMatchObject({ message: "DUPLICATE_LINK_REFUSED", code: "23514" });
  expect(result.rows).toEqual([]);
 }

 it("the sole unlink writer succeeds end to end and makes the duplicate active again", async () => {
  const l = await linked(), commandId = randomUUID();
  expect((await repo.readDuplicateLinks(l.f.ctx, l.f.jobId)).activeLinks).toHaveLength(1);
  const result = await repo.unlinkDuplicate(l.f.ctx, { version: "extra-duplicate-unlink.v1", commandId, jobId: l.f.jobId,
   actorMembershipId: l.f.p.membershipId, linkId: l.linkId, expectedRevision: 1, reasonCode: "linked_in_error" });
  expect(result).toMatchObject({ linkId: l.linkId, variationId: l.duplicate, revision: 2 });
  expect((await repo.readDuplicateLinks(l.f.ctx, l.f.jobId)).activeLinks).toEqual([]);
  expect(await repo.readDuplicateGroup(l.f.ctx, l.f.jobId, l.duplicate)).toMatchObject({ canonicalId: l.duplicate });
  expect((await c.admin.query("SELECT app.xa_latest_kind($1,$2,$3) AS kind", [l.f.p.tenantId, l.f.jobId, l.duplicate])).rows[0].kind).toBe("logged");
  expect((await c.admin.query("SELECT command_type,semantic_key,status FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [l.f.p.tenantId, commandId])).rows).toEqual([
   { command_type: "UnlinkDuplicate", semantic_key: key(l.f, l.linkId, commandId), status: "succeeded" },
  ]);
 });

 it("refuses another processing command by the same actor even with the exact unlink key", async () => {
  const l = await linked();
  assertRefused(await probe(l, "MarkDuplicate", command => key(l.f, l.linkId, command)));
  expect((await repo.readDuplicateLinks(l.f.ctx, l.f.jobId)).activeLinks).toHaveLength(1);
 });

 it.each(["job", "link", "command", "prefix"] as const)("refuses UnlinkDuplicate with a different %s in its semantic key", async field => {
  const l = await linked();
  assertRefused(await probe(l, "UnlinkDuplicate", command => {
   if (field === "job") return `extra-duplicate-unlink:${randomUUID()}:${l.linkId}:${command}`;
   if (field === "link") return key(l.f, randomUUID(), command);
   if (field === "command") return key(l.f, l.linkId, randomUUID());
   return `extra-duplicate:${l.f.jobId}:${l.duplicate}:${l.canonical}:${command}`;
  }));
  expect((await repo.readDuplicateLinks(l.f.ctx, l.f.jobId)).activeLinks).toHaveLength(1);
 });

 it("the same refusal assertion fails with the old unlink branch and the fixed guard is restored", async () => {
  const l = await linked(), semantic = (command: string) => key(l.f, l.linkId, command);
  const mutant = await probe(l, "MarkDuplicate", semantic, true);
  expect(mutant.error).toBeUndefined();
  expect(mutant.rows).toHaveLength(1);
  expect(() => assertRefused(mutant)).toThrow();
  assertRefused(await probe(l, "MarkDuplicate", semantic));
  expect((await repo.readDuplicateLinks(l.f.ctx, l.f.jobId)).activeLinks).toHaveLength(1);
 });
});
