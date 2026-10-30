import { randomUUID, createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { migrate } from "../src/migrate.js";
import { appendAuditBatch, canonicalAuditHash, verifyAuditChain, type AuditEvent } from "../src/audit.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { assertLp4SealedEvents } from "./lp4-writer-catchup-fixture.js";
import { jobDoorsActor, jobDoorsDatabase } from "./lp-job-doors-fixtures.js";

describe("LP-4 compatible upgrade and database-independent sealing", () => {
  it("requires administrative role provisioning before the restricted migration", async () => {
    const db = await jobDoorsDatabase(true, "0456_lp4_database_audit.sql");
    try {
      await db.owner.query("ALTER ROLE jobguard_audit_writer RENAME TO lp4_missing_role_fixture");
      try {
        await expect(migrate(db.owner)).rejects.toMatchObject({code:"42704",
          message:"jobguard_audit_writer is missing; run administrative ensureRoles before migrations"});
      } finally {
        await db.owner.query("ROLLBACK");
        await db.owner.query("ALTER ROLE lp4_missing_role_fixture RENAME TO jobguard_audit_writer");
      }
      await migrate(db.owner);
    } finally { await db.close(); }
  }, 300_000);
  it("preserves historical bytes/checkpoint and appends v2 without granting runtime legacy writers", async () => {
    const db = await jobDoorsDatabase(true, "0456_lp4_database_audit.sql");
    try {
      const { tenant } = await jobDoorsActor(db.owner);
      const legacy = { id: randomUUID(), tenantId: tenant, sequence: 1, version: "audit.v1" as const,
        actorRef: "user:legacy", eventType: "fixture.created", subjectType: "job", subjectRef: randomUUID(),
        occurredAt: new Date("2026-10-01T00:00:00.000Z"), payload: {},
        payloadHash: createHash("sha256").update("{}").digest("hex"), previousHash: null };
      const eventHash = canonicalAuditHash(legacy);
      await db.owner.query(`INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
        VALUES($1,$2,1,'audit.v1',$3,$4,$5,$6,$7,'{}',$8,NULL,$9)`,
      [legacy.id, tenant, legacy.actorRef, legacy.eventType, legacy.subjectType, legacy.subjectRef, legacy.occurredAt, legacy.payloadHash, eventHash]);
      await db.owner.query("INSERT INTO audit_control.audit_head(tenant_id,sequence,event_hash) VALUES($1,1,$2)", [tenant, eventHash]);
      await db.owner.query("INSERT INTO audit_control.checkpoint(tenant_id,sequence,event_hash) VALUES($1,1,$2)", [tenant, eventHash]);
      const before = (await db.owner.query("SELECT row_to_json(a)::text bytes FROM app.audit_event a WHERE tenant_id=$1", [tenant])).rows;
      await migrate(db.owner);
      expect((await db.owner.query("SELECT row_to_json(a)::text bytes FROM app.audit_event a WHERE tenant_id=$1", [tenant])).rows).toEqual(before);
      const [next] = await withTenant(db.runtime, testTenantContext(tenant), tx => appendAuditBatch(tx, [{
        id: randomUUID(), version: "audit.v1", actorRef: "user:synthetic", eventType: "fixture.created", subjectType: "job", subjectRef: randomUUID(), payload: {},
      }]));
      expect(next!.previousHash).toBe(eventHash);
      verifyAuditChain([{ ...legacy, eventHash } as AuditEvent, next!], { tenantId: tenant, sequence: 1, eventHash, recordedAt: legacy.occurredAt });
      expect((await db.owner.query("SELECT event_hash FROM audit_control.checkpoint WHERE tenant_id=$1", [tenant])).rows).toEqual([{ event_hash: eventHash }]);
    } finally { await db.close(); }
  }, 300_000);
  it("seals runtime and owner-side events in an ordinary migrated database with the same refusals", async () => {
    const db = await jobDoorsDatabase();
    try {
      expect((await db.owner.query("SELECT current_database() name")).rows[0].name).toBe("postgres");
      const {tenant,member}=await jobDoorsActor(db.owner), id=randomUUID(), job=randomUUID();
      const input={id,version:"audit.v1" as const,actorRef:"user:fixture",eventType:"fixture.created",
        subjectType:"job",subjectRef:job,payload:{}};
      const [event]=await withTenant(db.runtime,testTenantContext(tenant),tx=>appendAuditBatch(tx,[input]));
      expect(event).toMatchObject({id,version:"audit.v2",sequence:1,payload:{references:{auditTrust:"lower_trust"}}});
      verifyAuditChain([event!]);
      await withTenant(db.owner,testTenantContext(tenant),tx=>tx.$client.query(
        "SELECT app.append_final_lock_audit($1,$2,$3,'final_account.locked',$4::jsonb)",
        [randomUUID(),member,job,JSON.stringify({lockId:randomUUID()})]));
      await assertLp4SealedEvents(db.owner,tenant,"final_account.locked");
      await expect(db.runtime.query("SELECT * FROM app.append_audit($1::jsonb)",[JSON.stringify([input])]))
        .rejects.toMatchObject({code:"42501",message:"AUDIT_CONTEXT_REQUIRED"});
      await expect(db.runtime.query("SELECT app.lp4_seal_audit('[]','checked_operation')"))
        .rejects.toMatchObject({code:"42501"});
      expect((await db.owner.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1",[tenant])).rows[0].n).toBe(2);
    } finally {await db.close();}
  },300_000);
});
