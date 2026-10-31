import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { UserCommandDispatcher } from "../src/commands.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(true); }, 300_000);
afterAll(async () => { await db?.close(); });

describe("LP-5c runtime command authority cutover", () => {
  it("has no effective table or column creation/completion privilege, including inherited and PUBLIC access", async () => {
    const result = await db.runtime.query(`SELECT c.relname,a.attname,
      has_column_privilege(current_user,c.oid,a.attnum,'INSERT') can_insert,
      has_column_privilege(current_user,c.oid,a.attnum,'UPDATE') can_update
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      WHERE n.nspname='app' AND c.relname IN ('command_receipt','decision_resolution','action_authorization')`);
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row.can_insert, `${row.relname}.${row.attname}`).toBe(false);
      if (row.relname === "command_receipt") expect(row.can_update, row.attname).toBe(false);
    }
  });
  it("cannot call private completion/proof helpers through inherited or PUBLIC execution", async () => {
    const helpers = await db.runtime.query(`SELECT p.oid::regprocedure::text signature,
      has_function_privilege(current_user,p.oid,'EXECUTE') allowed
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='app' AND p.proname IN ('lp5_bind_effect','lp5_command_result','lp5_check_command_completion')`);
    expect(helpers.rows).toHaveLength(3);
    for (const row of helpers.rows) expect(row.allowed, row.signature).toBe(false);
    await expect(db.runtime.query("SELECT app.lp5_bind_effect($1,$2,'forged','{}')", [randomUUID(), randomUUID()]))
      .rejects.toMatchObject({ code: "42501" });
  });
  it("refuses forgeries and fabricated completion, then commits and replays a checked positive command", async () => {
    const actor = await jobDoorsActor(db.owner), context = testTenantContext(actor.tenant);
    const commandId = randomUUID(), job = randomUUID();
    await db.owner.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional LP5c job','live')", [actor.tenant, job]);
    const count = async () => (await db.owner.query(`SELECT
      (SELECT count(*) FROM app.command_receipt WHERE tenant_id=$1) receipts,
      (SELECT count(*) FROM app.decision_resolution WHERE tenant_id=$1) resolutions,
      (SELECT count(*) FROM app.action_authorization WHERE tenant_id=$1) grants,
      (SELECT count(*) FROM app.audit_event WHERE tenant_id=$1) audits,
      (SELECT count(*) FROM app.action_outbox WHERE tenant_id=$1) outbox`, [actor.tenant])).rows[0];
    const before = await count();
    for (const sql of [
      "INSERT INTO app.command_receipt(command_id) VALUES(gen_random_uuid())",
      "INSERT INTO app.decision_resolution(resolution) VALUES('approved')",
      "INSERT INTO app.action_authorization(id) VALUES(gen_random_uuid())",
      "UPDATE app.command_receipt SET status='succeeded',result='{}',completed_at=clock_timestamp()",
    ]) {
      await expect(withTenant(db.runtime, context, tx => tx.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
      expect(await count()).toEqual(before);
    }
    const dispatcher = new UserCommandDispatcher(db.runtime);
    const command = { version: "command.v1", commandId, commandType: "synthetic.lock", semanticKey: `lp5c:${commandId}`,
      actorMembershipId: actor.member, subjectType: "job", subjectRef: job,
      action: { actionType: "synthetic.lock", recipient: null, contentHash: "a".repeat(64), aggregateRevision: 1,
        amountPence: null, currency: null, policyVersion: "synthetic_demo_activation.v3", expiresAt: new Date("2099-01-01") } };
    const handler = { mutate: async () => ({ locked: job }) };
    expect(await dispatcher.dispatch(context, command, handler)).toEqual({ locked: job });
    const committed = await count();
    expect(committed.receipts).toBe("1");
    expect(await dispatcher.dispatch(context, command, { mutate: async () => { throw new Error("replay mutated"); } })).toEqual({ locked: job });
    expect(await count()).toEqual(committed);
    await expect(withTenant(db.runtime, context, tx => tx.$client.query(
      "UPDATE app.command_receipt SET result='{}' WHERE command_id=$1", [commandId]))).rejects.toMatchObject({ code: "42501" });
    expect(await count()).toEqual(committed);
  });
});
