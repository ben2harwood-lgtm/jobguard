// Real PostgreSQL CI: retain historical non-raiser facts, breaches and exact routine privileges.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, expect, it, vi } from "vitest";
import { startBeforeMigration, applyMigration, snapshot, type Cluster } from "./contractor-entitlement-fixtures.js";
import { chainWorld, submitted } from "./extra-approval-chain-fixtures.js";
import { testActorContext } from "./tenant-context-test-utils.js";
import { extraProceed, WorkOrderRepository, demoFile, demoRow, withTenant, migrate } from "../src/index.js";
import { lp11EmptyTables } from "./later-empty-tables.js";
import { discardDraftRegistryRow, invoiceSendRegistryRow } from "./lp5-command-catalog.js";

let c: Cluster | undefined;
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it("populated upgrade retains a colleague's old statement byte-for-byte and its breach, but refuses their new writes and replays", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const db = c = await startBeforeMigration("0760_extra_proceed_raiser_authority.sql");
 const f = await chainWorld(db), s = await submitted(db, f, 150000), a = f.members.operative.member, b = f.unassigned.member;
 const imported = await new WorkOrderRepository(db.runtime).importCsv(f.p, { commandId: randomUUID(), name: "fictional-upgrade.csv", kind: "csv",
  csv: demoFile([demoRow(f.demo, f.nextOrder - 1, { expectedRevision: 1, assignedMembershipIds: [a.membershipId, b.membershipId] })]) });
 expect(imported.rows[0]?.outcome).toBe("revised");
 const actors = [a, b, f.members.supervisor.member];
 const contexts = await Promise.all(actors.map(actor => testActorContext(db.admin, f.ctx, actor)));
 for (const [i, actor] of [a, b].entries())
  expect(await withTenant(db.runtime, contexts[i]!, async tx => (await tx.$client.query(
   "SELECT decision FROM app.ent3a_extra_authority($1,'LogSiteExtra',$2)", [actor.membershipId, s.jobId])).rows[0].decision)).toBe("allowed");
 const body = { version: "record-extra-proceed.v1", commandId: randomUUID(), requestId: s.requestId, reason: "Fictional historical colleague statement" };
 const old = await extraProceed(db.runtime, contexts[1]!, b, s.jobId, s.extraId, body);
 expect(old.history[0]?.actorMembershipId).toBe(b.membershipId);
 const breaches = () => withTenant(db.runtime, contexts[0]!, async tx => (await tx.$client.query(
  "SELECT app.xa_proceed_breaches($1,$2) ids", [s.jobId, s.extraId])).rows[0].ids);
 const rows = () => db.admin.query("SELECT row_to_json(s)::text bytes FROM app.extra_proceed_statement s ORDER BY tenant_id,id").then(r => r.rows);
 const catalog = () => db.admin.query(`SELECT p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN('app','identity','control_plane','audit_control') AND p.prokind='f' ORDER BY p.oid`).then(r => r.rows);
 const before = await snapshot(db.admin), oldRows = await rows(), prior = await catalog();
 expect(await breaches()).toEqual([s.requestId]);
 await applyMigration(db, "0760_extra_proceed_raiser_authority.sql");
 expect(await snapshot(db.admin)).toEqual(before);
 expect(await rows()).toEqual(oldRows);
 expect(await breaches()).toEqual([s.requestId]);
 const live = await catalog();
 const target = (await db.admin.query("SELECT 'app.xa_proceed(uuid,uuid,uuid,jsonb)'::regprocedure::oid oid")).rows[0].oid;
 const source = await readFile(new URL("../migrations/0760_extra_proceed_raiser_authority.sql", import.meta.url), "utf8");
 expect(live).toHaveLength(prior.length);
 for (const previous of prior) {
  const current = live.find(row => row.oid === previous.oid);
  if (previous.oid === target) {
   expect({ ...current, definition: previous.definition }).toEqual(previous);
   expect(current.definition.split("$function$")[1]).toBe(source.split("AS $$")[1]!.split("$$;")[0]);
  } else expect(current).toEqual(previous);
 }
 for (const [i, actor] of actors.entries())
  expect(await extraProceed(db.runtime, contexts[i]!, actor, s.jobId, s.extraId)).toEqual(old);
 for (const i of [1, 2]) {
  for (const raw of [body, { ...body, commandId: randomUUID() }]) {
   await expect(extraProceed(db.runtime, contexts[i]!, actors[i]!, s.jobId, s.extraId, raw)).rejects.toMatchObject({ code: "NOT_FOUND" });
   await expect(withTenant(db.runtime, contexts[i]!, tx => tx.$client.query("SELECT app.xa_proceed($1,$2,$3,$4::jsonb)",
    [s.jobId, s.extraId, actors[i]!.membershipId, JSON.stringify(raw)]))).rejects.toMatchObject({ message: "NOT_FOUND", code: "P0002" });
   expect(await snapshot(db.admin)).toEqual(before);
  }
 }
 const ownBody = { ...body, commandId: randomUUID(), reason: "Fictional raiser's own statement" };
 const own = await extraProceed(db.runtime, contexts[0]!, a, s.jobId, s.extraId, ownBody);
 expect(own.history).toHaveLength(2);
 expect(own.history[0]).toEqual(old.history[0]);
 expect(await extraProceed(db.runtime, contexts[0]!, a, s.jobId, s.extraId, ownBody)).toEqual(own);
 expect(await withTenant(db.runtime, contexts[0]!, async tx => (await tx.$client.query("SELECT app.xa_proceed($1,$2,$3,$4::jsonb) result",
  [s.jobId, s.extraId, a.membershipId, JSON.stringify(ownBody)])).rows[0].result)).toEqual(own);
 const after = await snapshot(db.admin);
 await migrate(db.admin); await migrate(db.admin);
 expect(await snapshot(db.admin)).toEqual({ ...after, ...lp11EmptyTables, "control_plane.worker_action_binding": [], "app.command_type_registry": (await db.admin.query("SELECT jsonb_agg(value ORDER BY value::text) data FROM jsonb_array_elements($1::jsonb)", [JSON.stringify([...(after["app.command_type_registry"] as unknown[]), discardDraftRegistryRow, invoiceSendRegistryRow])])).rows[0].data });
 expect(await breaches()).toEqual([s.requestId]);
}, 300_000);

// Executable without PostgreSQL: pin the copied body and the exact admission order.
it("source preserves the predecessor byte-for-byte except for the pre-claim raiser check", async () => {
 const previous = await readFile(new URL("../migrations/0634_extra_proceed_statement.sql", import.meta.url), "utf8");
 const current = await readFile(new URL("../migrations/0760_extra_proceed_raiser_authority.sql", import.meta.url), "utf8");
 const body = (sql: string) => sql.split(/CREATE (?:OR REPLACE )?FUNCTION app\.xa_proceed\(/u)[1]!.split("AS $$")[1]!.split("$$;")[0]!;
 const check = " IF NOT EXISTS(SELECT 1 FROM app.extra_origin o WHERE o.tenant_id=t AND o.job_id=p_job\n"
  + "  AND o.variation_id=p_extra AND o.raising_membership_id=p_actor) THEN\n"
  + "  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;\n";
 expect(body(current).split(check)).toHaveLength(2);
 expect(body(current).replace(check, "")).toBe(body(previous));
 expect(body(current)).toContain(" IF p_body IS NULL THEN RETURN app.xa_proceed_view(p_job,p_extra); END IF;\n" + check);
 expect(body(current).indexOf(check)).toBeLessThan(body(current).indexOf("app.begin_command("));
 expect(current.slice(current.indexOf("ALTER FUNCTION"), current.indexOf("COMMIT;"))).toBe(
  previous.slice(previous.indexOf("ALTER FUNCTION app.xa_proceed(uuid"), previous.indexOf("-- Like the existing work-status seam:")).trimEnd() + "\n");
});
