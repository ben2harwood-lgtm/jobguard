import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { contractorSessionContext, migrate, withTenant } from "../src/index.js";
import { company, start, end, startBeforeMigration, applyMigration, type Company } from "./practice-worker-switch-fixtures.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
import type { Cluster } from "./contractor-practice-session-fixtures.js";

let c: Cluster;
const migration = "0596_lp6b_effective_session_actor.sql";
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  c = await startBeforeMigration(migration);
}, 120_000);
afterAll(async () => { await c?.close(); });
const attributes = async () => (await c.admin.query(`SELECT pg_get_userbyid(proowner) owner,proacl::text acl,prosecdef,provolatile,proconfig
  FROM pg_proc WHERE oid='app.lp6_session_authority(text,text,uuid)'::regprocedure`)).rows[0];
async function assertActor(f: Company, actor: string) {
  const context = await contractorSessionContext(c.runtime, f.session);
  await withTenant(c.runtime, context, async tx => {
    expect((await tx.$client.query("SELECT app.current_actor() actor,app.current_tenant() tenant")).rows)
      .toEqual([{ actor, tenant: f.p.tenantId }]);
  });
}
it("0584 fixes the effective actor alone, preserves data/privileges and rejects stale or foreign contexts", async () => {
  const f = await company(c), foreign = await company(c);
  await assertActor(f, f.p.membershipId);
  await start(c, f);
  const switched = await contractorSessionContext(c.runtime, f.session), callback = vi.fn();
  // Regression: the old helper derives the base owner while the bridge derives the worker.
  await expect(withTenant(c.runtime, switched, callback)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(callback).not.toHaveBeenCalled();
  const rows = await proofBefore(c.admin, ["control_plane.contractor_practice_session", "control_plane.practice_worker_switch", "app.membership", "app.audit_event"]);
  const before = await attributes();
  await applyMigration(c, migration);
  expect(await attributes()).toEqual(before);
  expect(await proofDifferences(c.admin, rows)).toEqual({ rows: [], types: [] });
  await assertActor(f, f.members.operative!);
  // The fix must never rebase an already-authenticated owner context to a new actor.
  await expect(withTenant(c.runtime, f.context, callback)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(callback).not.toHaveBeenCalled();
  await expect(withTenant(c.runtime, foreign.context, tx => tx.$client.query("SELECT app.bind_request('contractor_practice',$1,$2)", [f.session, f.p.tenantId])))
    .rejects.toMatchObject({ code: "42501" });
  await end(c, f);
  await assertActor(f, f.p.membershipId);
  await expect(withTenant(c.runtime, switched, callback)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(callback).not.toHaveBeenCalled();
  await migrate(c.admin);
  await migrate(c.admin);
  expect(await attributes()).toEqual(before);
  const grants = (await c.admin.query(`SELECT has_schema_privilege('jobguard_identity','app','USAGE') usage,
    has_function_privilege('jobguard_identity','app.bind_request(text,text,uuid)','EXECUTE') bind`)).rows[0];
  expect(grants).toEqual({ usage: false, bind: false });
});
