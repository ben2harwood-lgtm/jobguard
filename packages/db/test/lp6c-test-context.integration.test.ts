import { afterAll, beforeAll, expect, it } from "vitest";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { withTenant } from "../src/tenant-context.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(true); }, 300_000);
afterAll(async () => { await db?.close(); });

it("automatically binds persisted real credentials once per synthetic tenant/membership", async () => {
  const actor = await jobDoorsActor(db.owner);
  const context = testTenantContext(actor.tenant, { membershipId: actor.member });
  await Promise.all([context, context, testTenantContext(actor.tenant, { membershipId: actor.member })].map(async request => {
    const row = await withTenant(db.runtime, request, async tx =>
      (await tx.$client.query("SELECT app.current_actor() actor, app.current_tenant() tenant")).rows[0]);
    expect(row).toEqual({ actor: actor.member, tenant: actor.tenant });
  }));
  expect((await db.owner.query("SELECT count(*)::int n FROM identity.session WHERE user_id=$1", [actor.person])).rows[0].n).toBe(1);
  expect((await db.owner.query("SELECT membership_id FROM identity.membership_locator WHERE user_id=$1 AND tenant_id=$2", [actor.person, actor.tenant])).rows)
    .toEqual([{ membership_id: actor.member }]);
  // Neither an old context nor a fresh recipe may revive removed authority.
  await db.owner.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE user_id=$1", [actor.person]);
  for (const request of [context, testTenantContext(actor.tenant, { membershipId: actor.member })]) {
    await expect(withTenant(db.runtime, request, async () => { throw new Error("business callback reached"); }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  }
});

it("keeps explicit unbound direct-SQL attacks unbound and provisions no sign-in rows", async () => {
  const actor = await jobDoorsActor(db.owner);
  const context = testTenantContext(actor.tenant, { bindRequest: false });
  await expect(withTenant(db.runtime, context, tx => tx.$client.query(
    "SELECT app.final_check_require_invoice_actor($1,$2,$3)", [actor.tenant, actor.tenant, actor.member],
  ))).rejects.toMatchObject({ code: "42501", message: "REQUEST_BINDING_REFUSED" });
  expect((await db.owner.query("SELECT count(*)::int n FROM identity.session WHERE user_id=$1", [actor.person])).rows[0].n).toBe(0);
});
