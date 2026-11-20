import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership } from "../src/tenant-context.js";
let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(true); }, 300_000);
afterAll(async () => { await db?.close(); });
async function session() {
  const a = await jobDoorsActor(db.owner), id = randomUUID(), credential = randomBytes(32).toString("hex");
  await db.owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${a.person}@fictional.invalid`, a.person]);
  await db.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [a.person,a.tenant,a.member]);
  await db.owner.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')", [id,a.person,credential]);
  const context = verifiedTenantContextFromMembership({ tenantId:a.tenant, membershipId:a.member, identityUserId:a.person } as AuthenticatedMembership, { kind:"real",credential });
  return { ...a, id, context };
}
it("revalidates a stamped credential revoked between bridge authentication and transaction start", async () => {
  const s = await session(); let ran = false;
  await db.owner.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [s.id]);
  await expect(withTenant(db.runtime,s.context,async () => { ran = true; })).rejects.toMatchObject({code:"FORBIDDEN",message:"FORBIDDEN"});
  expect(ran).toBe(false);
});
it("binds each request on a reused backend and clears authority after both commit and rollback", async () => {
  const a = await session(), b = await session(), pool = db.freshRuntime();
  let pid: number | undefined;
  try {
    for (const [s, rollback] of [[a,false],[b,true],[a,false]] as const) {
      const run = withTenant(pool,s.context,async tx => {
        const row=(await tx.$client.query("SELECT app.current_actor() actor,app.current_tenant() tenant,pg_backend_pid() pid")).rows[0];
        expect(row.actor).toBe(s.member); expect(row.tenant).toBe(s.tenant);
        if (pid !== undefined) expect(row.pid).toBe(pid); pid=row.pid;
        if (rollback) throw new Error("fictional rollback");
      });
      if (rollback) await expect(run).rejects.toThrow("fictional rollback"); else await run;
      const unbound = await pool.connect();
      try { await expect(unbound.query("SELECT app.current_actor()")).rejects.toMatchObject({code:"42501"}); }
      finally { unbound.release(); }
    }
  } finally { await pool.end(); }
});
it("holds the established request through a racing session revocation, then refuses reuse", async () => {
  const s = await session(), revoker = await db.owner.connect();
  try {
    await withTenant(db.runtime,s.context,async tx => {
      await revoker.query("BEGIN; SET LOCAL lock_timeout='100ms'");
      await expect(revoker.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[s.id])).rejects.toMatchObject({code:"55P03"});
      await revoker.query("ROLLBACK");
      expect((await tx.$client.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(s.member);
    });
    await revoker.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[s.id]);
    await expect(withTenant(db.runtime,s.context,async () => { throw new Error("must not run"); })).rejects.toMatchObject({code:"FORBIDDEN",message:"FORBIDDEN"});
  } finally { await revoker.query("ROLLBACK"); revoker.release(); }
});
