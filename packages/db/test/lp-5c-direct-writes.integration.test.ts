/**
 * Tests-first cutover specification, NOT a claim that cutover exists.
 * LP-5a/5b stopped before conversion; these assertions are expected to fail on
 * that inherited base. No test-only withdrawal, fallback, skip or mock is used.
 * Run only on disposable PostgreSQL 16 in CI / the dispatcher's permitted host.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startLp0Database, type Lp0Database } from "./lp-0-catalog.js";

let db: Lp0Database;
const tenant = randomUUID(), account = randomUUID(), user = randomUUID();
const actor = randomUUID(), otherActor = randomUUID(), otherUser = randomUUID();
const decision = randomUUID(), newDecision = randomUUID();
const resolution = randomUUID(), authorization = randomUUID();
const authDecision = randomUUID(), authResolution = randomUUID();
const processing = randomUUID(), succeeded = randomUUID();
const hash = "a".repeat(64);

// Canonical database text preserves timestamp precision. These are state
// comparisons within one run, not permanent row-shape pins.
async function state() {
  const client = await db.admin.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result: Record<string, string[]> = {};
    for (const table of ["command_receipt", "decision_resolution", "action_authorization", "decision", "audit_event", "action_outbox"]) {
      result[table] = (await client.query(`SELECT row_to_json(t)::text AS value FROM app.${table} t WHERE tenant_id=$1 ORDER BY row_to_json(t)::text`, [tenant])).rows.map(r => r.value as string);
    }
    await client.query("COMMIT");
    return result;
  } finally { await client.query("ROLLBACK"); client.release(); }
}

beforeAll(async () => {
  db = await startLp0Database(59600);
  await db.bootstrapRuntimeLogin();
  const client = await db.admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
    await client.query("INSERT INTO identity.identity_user(id) VALUES($1),($2)", [user, otherUser]);
    await client.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'LP-5c fictional fixture')", [account, tenant]);
    for (const [member, identity] of [[actor, user], [otherActor, otherUser]]) {
      await client.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member, tenant, account, identity]);
    }
    await client.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$3,'synthetic','LP-5c','synthetic.test'),($2,$3,'synthetic','LP-5c','synthetic.test')", [decision, newDecision, tenant]);
    await client.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution, tenant, decision, actor]);
    await client.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'synthetic','LP-5c','synthetic.test')", [authDecision, tenant]);
    await client.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [authResolution, tenant, authDecision, actor]);
    await client.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,content_hash,aggregate_revision,policy_version,expires_at)
      VALUES($1,$2,$3,$4,$5,'synthetic.test',$6,0,'synthetic-only',transaction_timestamp()+interval '1 hour')`, [authorization, tenant, decision, resolution, actor, hash]);
    for (const [id, status] of [[processing, "processing"], [succeeded, "succeeded"]]) {
      await client.query(`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
        VALUES($1,$2,'synthetic.test',$1::text,$3,$4,CASE WHEN $4='succeeded' THEN '{"saved":true}'::jsonb END,$5,CASE WHEN $4='succeeded' THEN transaction_timestamp() END)`, [id, tenant, hash, status, actor]);
    }
    await client.query("COMMIT");
  } finally { await client.query("ROLLBACK"); client.release(); }
}, 300_000);
afterAll(async () => { await db?.stop(); });

type Attempt = { label: string; sql: string; values: unknown[]; ownerCode?: string };
const newCommand = randomUUID(), newResolution = randomUUID(), newAuthorization = randomUUID();
const receiptColumns = "command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id";
const receiptValues = [newCommand, tenant, hash, actor];
const attempts: Attempt[] = [
  { label: "[LP5C-01] processing receipt INSERT", sql: `INSERT INTO app.command_receipt(${receiptColumns}) VALUES($1,$2,'synthetic.test',$1::text,$3,'processing',$4)`, values: receiptValues },
  { label: "[LP5C-01] succeeded receipt INSERT with fabricated result", sql: `INSERT INTO app.command_receipt(${receiptColumns},result,completed_at) VALUES($1,$2,'synthetic.test',$1::text,$3,'succeeded',$4,'{"fabricated":true}',transaction_timestamp())`, values: receiptValues },
  { label: "[LP5C-01] approved resolution INSERT with valid decision and actor", sql: "INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", values: [newResolution, tenant, newDecision, actor] },
  { label: "[LP5C-01] authorization INSERT with valid approved resolution", sql: `INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,content_hash,aggregate_revision,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'synthetic.test',$6,0,'synthetic-only',transaction_timestamp()+interval '1 hour')`, values: [newAuthorization, tenant, authDecision, authResolution, actor, hash] },
  { label: "[LP5C-01] column-qualified INSERT SELECT", sql: `INSERT INTO app.command_receipt(${receiptColumns}) SELECT $1::uuid,$2::uuid,'synthetic.test',$1::text,$3,'processing',$4::uuid`, values: receiptValues },
  { label: "[LP5C-01] ON CONFLICT DO UPDATE", sql: `INSERT INTO app.command_receipt(${receiptColumns}) VALUES($1,$2,'synthetic.test',$1::text,$3,'processing',$4) ON CONFLICT(tenant_id,command_id) DO UPDATE SET result=EXCLUDED.result`, values: [processing, tenant, hash, actor] },
  { label: "[LP5C-02] status UPDATE independently", sql: "UPDATE app.command_receipt SET status='processing' WHERE tenant_id=$1 AND command_id=$2", values: [tenant, processing] },
  { label: "[LP5C-02] result UPDATE independently", sql: `UPDATE app.command_receipt SET result='{"tampered":true}' WHERE tenant_id=$1 AND command_id=$2`, values: [tenant, succeeded] },
  { label: "[LP5C-02] completed_at UPDATE independently", sql: "UPDATE app.command_receipt SET completed_at=completed_at+interval '1 microsecond' WHERE tenant_id=$1 AND command_id=$2", values: [tenant, succeeded] },
  { label: "[LP5C-02] fabricated completion UPDATE together", sql: `UPDATE app.command_receipt SET status='succeeded',result='{"fabricated":true}',completed_at=transaction_timestamp() WHERE tenant_id=$1 AND command_id=$2`, values: [tenant, processing] },
  { label: "[LP5C-02] receipt identity UPDATE", sql: "UPDATE app.command_receipt SET command_id=$3 WHERE tenant_id=$1 AND command_id=$2", values: [tenant, processing, randomUUID()] },
  { label: "[LP5C-02] receipt actor UPDATE", sql: "UPDATE app.command_receipt SET actor_membership_id=$3 WHERE tenant_id=$1 AND command_id=$2", values: [tenant, processing, otherActor] },
  { label: "[LP5C-02] receipt request hash UPDATE", sql: "UPDATE app.command_receipt SET request_hash=$3 WHERE tenant_id=$1 AND command_id=$2", values: [tenant, processing, "b".repeat(64)] },
  { label: "[LP5C-02] receipt command type UPDATE", sql: "UPDATE app.command_receipt SET command_type='synthetic.other' WHERE tenant_id=$1 AND command_id=$2", values: [tenant, processing] },
  { label: "[LP5C-02] receipt semantic key UPDATE", sql: "UPDATE app.command_receipt SET semantic_key='synthetic.other' WHERE tenant_id=$1 AND command_id=$2", values: [tenant, processing] },
  { label: "[LP5C-02] receipt creation time UPDATE", sql: "UPDATE app.command_receipt SET created_at=created_at+interval '1 microsecond' WHERE tenant_id=$1 AND command_id=$2", values: [tenant, processing] },
  { label: "[LP5C-03] direct authorization revocation", sql: "UPDATE app.action_authorization SET revoked_at=transaction_timestamp() WHERE tenant_id=$1 AND id=$2", values: [tenant, authorization] },
];
for (const [table, idColumn, id] of [["command_receipt", "command_id", succeeded], ["decision_resolution", "id", resolution], ["action_authorization", "id", authorization]]) {
  attempts.push({ label: `[LP5C-01] ${table} DELETE`, sql: `DELETE FROM app.${table} WHERE tenant_id=$1 AND ${idColumn}=$2`, values: [tenant, id], ...(table === "command_receipt" ? {} : { ownerCode: "55000" }) });
}
attempts.push({ label: "[LP5C-01] resolution UPDATE", sql: "UPDATE app.decision_resolution SET resolution='dismissed' WHERE tenant_id=$1 AND id=$2", values: [tenant, resolution], ownerCode: "55000" });
attempts.push({ label: "[LP5C-01] authorization authority fields UPDATE", sql: "UPDATE app.action_authorization SET content_hash=$3 WHERE tenant_id=$1 AND id=$2", values: [tenant, authorization, "c".repeat(64)], ownerCode: "55000" });

describe("LP-5c direct-write cutover refusals (prerequisites outstanding)", () => {
  for (const attempt of attempts) it(attempt.label, async () => {
    const before = await state();
    // Owner control uses exactly the same SQL and valid references.
    const owner = await db.admin.connect();
    try {
      await owner.query("BEGIN");
      if (attempt.ownerCode) await expect(owner.query(attempt.sql, attempt.values)).rejects.toMatchObject({ code: attempt.ownerCode });
      else expect((await owner.query(attempt.sql, attempt.values)).rowCount).toBe(1);
    } finally { await owner.query("ROLLBACK"); owner.release(); }

    const runtime = await db.runtimeClient();
    let refusal: unknown;
    try {
      expect((await runtime.query("SELECT current_user AS actor")).rows[0].actor).toBe("jobguard_runtime");
      await runtime.query("BEGIN");
      await runtime.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
      try { await runtime.query(attempt.sql, attempt.values); }
      catch (error) { refusal = error; }
    } finally { await runtime.query("ROLLBACK"); await runtime.end(); }
    expect(await state()).toEqual(before);
    expect(refusal).toMatchObject({ code: "42501" });
  });
});
