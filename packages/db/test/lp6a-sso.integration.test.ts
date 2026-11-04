import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createScimHarness, fixture, person, deactivate, type ScimHarness } from "./scim-fixtures.js";
let h:ScimHarness;
beforeAll(async()=>{h=await createScimHarness("jg-lp6a-sso-");},300_000);
afterAll(async()=>{await h?.close();});
const refused={code:"42501",message:"REQUEST_BINDING_REFUSED"};

it("uses the merged SSO-required membership rules for real bindings",async()=>{
  const f=await fixture(h),p=await person(f);
  await f.enable();
  const c=await h.runtime.connect();
  try{
    await c.query("BEGIN");
    await expect(c.query("SELECT app.bind_request('real',$1,$2)",[h.provider.digest(`session:${p.ordinary.sessionToken}`),f.principal.tenantId])).rejects.toMatchObject(refused);
    await c.query("ROLLBACK; BEGIN");
    await c.query("SELECT app.bind_request('real',$1,$2)",[h.provider.digest(`session:${p.bound.sessionToken}`),f.principal.tenantId]);
    expect((await c.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(p.membershipId);
  }finally{await c.query("ROLLBACK");c.release();}
},60_000);

it("races the actual SCIM deactivation routine without adding membership locks or deadlocking",async()=>{
  const f=await fixture(h),p=await person(f),digest=h.provider.digest(`session:${p.bound.sessionToken}`);
  const c=await h.runtime.connect(),revoker=await h.identity.connect();
  try{
    await c.query("BEGIN");await c.query("SELECT app.bind_request('real',$1,$2)",[digest,f.principal.tenantId]);
    await revoker.query("BEGIN; SET LOCAL lock_timeout='150ms'");
    // SCIM locks memberships first, then sessions. Binding holds the session
    // but no membership row lock: this times out, never deadlocks.
    await expect(revoker.query("SELECT identity.scim_deactivate($1,$2)",[f.connectionId,
      {version:"scim-deactivation.v1",eventId:randomUUID(),subjectHash:createHash("sha256").update(p.subject).digest("hex"),eventHash:"a".repeat(64)}])).rejects.toMatchObject({code:"55P03"});
    await revoker.query("ROLLBACK");await c.query("COMMIT");
    await deactivate(f,p);
    await expect(c.query("SELECT app.bind_request('real',$1,$2)",[digest,f.principal.tenantId])).rejects.toMatchObject(refused);
  }finally{await c.query("ROLLBACK");await revoker.query("ROLLBACK");c.release();revoker.release();}
},60_000);
