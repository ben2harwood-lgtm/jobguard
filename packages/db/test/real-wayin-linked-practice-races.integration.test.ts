import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { cluster, seedHomeOwner, digestOf, type Cluster } from "./contractor-practice-session-fixtures.js";
import { jobDoorsActor } from "./lp-job-doors-fixtures.js";
import { authenticatePracticeSession } from "../src/practice-session.js";
const home = "11111111-1111-4111-8111-111111111111";
let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); await seedHomeOwner(c); }, 300_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
async function fixture() {
  const a = await jobDoorsActor(c.admin), parent = randomUUID(), token = randomUUID();
  const parentDigest = createHmac("sha256", "fictional-race-key-at-least-32-characters").update(`session:${randomUUID()}`).digest("hex");
  await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${a.person}@practice.invalid`,a.person]);
  await c.admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [a.person,a.tenant,a.member]);
  await c.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')", [parent,a.person,parentDigest]);
  await c.admin.query("SELECT identity.enter_linked_practice($1,$2,$3,NULL)", [parentDigest,digestOf(token),{version:"linked-practice-company.v1",action:"enter"}]);
  return { ...a,parent,parentDigest,token,auth:await authenticatePracticeSession(c.runtime,token) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function write(client: PoolClient, f: Fixture, id: string) {
  await client.query("SELECT app.bind_request('practice',$1,$2)", [digestOf(f.token),home]);
  await client.query("SELECT set_config('app.tenant_id',$1,true)", [home]);
  await client.query("SELECT app.create_practice_sandbox_job($1,$2,$3,$4)", [home,id,f.auth.membershipId,f.auth.digest]);
}
async function end(client: PoolClient, f: Fixture, kind: string) {
  if (kind === "sign_out") return client.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [f.parent]);
  if (kind === "membership_removal") return client.query("DELETE FROM identity.membership_locator WHERE user_id=$1 AND tenant_id=$2", [f.person,f.tenant]);
  if (kind === "membership_revocation") return client.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.tenant,f.member]);
  return client.query("SELECT identity.enter_linked_practice($1,$2,$3,$4)", [f.parentDigest,digestOf(randomUUID()),{version:"linked-practice-company.v1",action:"reset"},digestOf(f.token)]);
}
async function blocked(pid: number) {
  const deadline = Date.now()+10_000;
  while (Date.now()<deadline) {
    if ((await c.admin.query("SELECT cardinality(pg_blocking_pids($1))>0 waiting", [pid])).rows[0].waiting) return;
    await new Promise(resolve => setTimeout(resolve,20));
  }
  throw new Error("competing operation did not actually wait on a PostgreSQL lock");
}

it.each(["sign_out","membership_removal","membership_revocation","reset"])("%s wins: an actual write waits then refuses without a job", async kind => {
  const f = await fixture(), id = randomUUID(), holder = await c.admin.connect(), writer = await c.runtime.connect();
  let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
  try {
    await holder.query("BEGIN"); await end(holder,f,kind);
    await writer.query("BEGIN"); await writer.query("SET LOCAL statement_timeout='15s'");
    const pid = (await writer.query("SELECT pg_backend_pid() pid")).rows[0].pid;
    pending=Promise.allSettled([write(writer,f,id)]);
    await blocked(pid); await holder.query("COMMIT");
    expect(await pending).toMatchObject([{status:"rejected",reason:{code:"42501",message:"REQUEST_BINDING_REFUSED"}}]);
    await writer.query("ROLLBACK");
    expect((await c.admin.query("SELECT count(*)::int n FROM app.job WHERE id=$1", [id])).rows[0].n).toBe(0);
    await expect(authenticatePracticeSession(c.runtime,f.token)).rejects.toThrow("UNAUTHENTICATED");
  } finally {
    await holder.query("ROLLBACK"); await pending; await writer.query("ROLLBACK"); holder.release(); writer.release();
  }
});

it.each(["sign_out","membership_removal","membership_revocation","reset"])("write wins: %s waits through the actual commit and then fences later writes", async kind => {
  const f = await fixture(), id = randomUUID(), writer = await c.runtime.connect(), revoker = await c.admin.connect();
  let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
  try {
    await writer.query("BEGIN"); await write(writer,f,id);
    await revoker.query("BEGIN"); await revoker.query("SET LOCAL statement_timeout='15s'");
    const pid = (await revoker.query("SELECT pg_backend_pid() pid")).rows[0].pid;
    pending=Promise.allSettled([end(revoker,f,kind)]);
    await blocked(pid); await writer.query("COMMIT");
    expect(await pending).toMatchObject([{status:"fulfilled"}]); await revoker.query("COMMIT");
    expect((await c.admin.query("SELECT practice_session_digest FROM app.job WHERE id=$1", [id])).rows[0].practice_session_digest).toBe(f.auth.digest);
    await writer.query("BEGIN");
    await expect(write(writer,f,randomUUID())).rejects.toThrow("REQUEST_BINDING_REFUSED");
  } finally {
    await writer.query("ROLLBACK"); await pending; await revoker.query("ROLLBACK"); writer.release(); revoker.release();
  }
});
