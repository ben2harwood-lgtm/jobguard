/**
 * LP-0 authority paths: views, executable overloads and helpers, equivalent routine capabilities, and reachable-path completeness.
 * Real PostgreSQL 16, complete migration registry, the real jobguard_runtime role. LP0-13 (same-signature routine/RLS change
 * detection) is HELD under the Q2 ruling and is not built here: the recorded routine protection facts are inspected, not compared.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import {
  APPLICATION_ROLE, AUTHORITY_KINDS, brief, compareInventory, compareLive, deriveFacts, loadReviewedInventory, parseInventory, pathCompleteness, readCatalogue,
  readProtectionRecord, repoFileExists, startLp0Database, type Comparison, type Inventory, type Lp0Database,
} from "./lp-0-catalog.js";
import { rolledBack } from "./upgrade-proof-utils.js";

let db: Lp0Database;
let inventory: Inventory;
let rawInventory: any;

beforeAll(async () => {
  ({ raw: rawInventory, inventory } = await loadReviewedInventory());
  db = await startLp0Database(58900);
  await db.bootstrapRuntimeLogin();
}, 300_000);
afterAll(async () => { await db?.stop(); });

async function control(defect: (client: PoolClient) => Promise<void>, observe?: (client: PoolClient) => Promise<void>): Promise<Comparison> {
  return rolledBack(db.admin, async client => {
    expect(brief(await compareLive(inventory, client)), "precondition: the reviewed base passes before the defect").toEqual([]);
    await defect(client);
    await observe?.(client);
    return compareLive(inventory, client);
  });
}
/** Owner-side creation: the migration owner, as the real migrations do (never the runtime login). */
const asOwner = async (c: PoolClient, sql: string) => { await c.query("SET LOCAL ROLE jobguard_migration"); try { await c.query(sql); } finally { await c.query("RESET ROLE"); } };
const allowed = async (c: { query: PoolClient["query"] }, sql: string) => ((await c.query(sql)).rows[0] as { allowed: boolean }).allowed;

describe("LP-0 authority paths", () => {
  it("[LP0-10] view access cannot bypass the freeze", async () => {
    // A new view over a table the runtime login cannot touch, readable by that login: the view runs with its owner's rights.
    const exposure = async (grantSql: string) => control(async c => {
      await asOwner(c, "CREATE VIEW app.lp0_ctl_view AS SELECT * FROM audit_control.audit_head");
      await c.query(grantSql);
    }, async c => { expect(await allowed(c, `SELECT has_table_privilege('${APPLICATION_ROLE}','app.lp0_ctl_view','SELECT') AS allowed`)).toBe(true); });
    const result = await exposure(`GRANT SELECT ON app.lp0_ctl_view TO ${APPLICATION_ROLE}`);
    const codes = result.diagnostics.map(d => d.code);
    expect(codes).toEqual(expect.arrayContaining(["VIEW_CHANGED", "TABLE_GRANT_ADDED"]));
    expect(result.diagnostics.filter(d => d.code === "VIEW_CHANGED").map(d => d.key).some(k => k.startsWith("view|dependency|app.lp0_ctl_view|audit_control.audit_head"))).toBe(true);
    // Real proof in the committed database: the runtime login is refused the base table, and reads it through the view.
    const runtime = await db.runtimeClient();
    try {
      await expect(runtime.query("SELECT count(*) FROM audit_control.audit_head")).rejects.toMatchObject({ code: "42501" });
      await db.admin.query("CREATE VIEW app.lp0_ctl_view AS SELECT * FROM audit_control.audit_head; ALTER VIEW app.lp0_ctl_view OWNER TO jobguard_migration");
      await db.admin.query(`GRANT SELECT ON app.lp0_ctl_view TO ${APPLICATION_ROLE}`);
      try {
        expect((await runtime.query("SELECT count(*)::int AS n FROM app.lp0_ctl_view")).rows).toHaveLength(1);
        const live = await compareLive(inventory, db.admin);
        expect(live.diagnostics.map(d => d.code)).toEqual(expect.arrayContaining(["VIEW_CHANGED", "TABLE_GRANT_ADDED"]));
      } finally { await db.admin.query("DROP VIEW app.lp0_ctl_view"); }
    } finally { await runtime.end(); }
    expect((await compareLive(inventory, db.admin)).ok, "view clean-up").toBe(true);
    // An existing view whose security option is flipped, and one whose definition is rewritten, fail pending review.
    const flip = await control(c => c.query("ALTER VIEW app.job_party_snapshot SET (security_invoker = false)").then(() => undefined));
    expect(flip.diagnostics.map(d => d.code)).toEqual(["VIEW_CHANGED"]);
    const rewritten = await control(async c => {
      const def = ((await c.query("SELECT pg_get_viewdef('app.job_party_recognition'::regclass,true) AS d")).rows[0] as { d: string }).d.replace(/;\s*$/, "");
      await c.query(`CREATE OR REPLACE VIEW app.job_party_recognition AS SELECT x.* FROM (${def}) x WHERE true`);
    });
    expect(rewritten.diagnostics.map(d => d.code)).toEqual(["VIEW_CHANGED"]);
    // A materialised view is a view for this purpose.
    const matview = await control(async c => {
      await asOwner(c, "CREATE MATERIALIZED VIEW app.lp0_ctl_mat AS SELECT id FROM app.account");
      await c.query(`GRANT SELECT ON app.lp0_ctl_mat TO ${APPLICATION_ROLE}`);
    });
    expect(matview.diagnostics.map(d => d.code)).toEqual(expect.arrayContaining(["VIEW_CHANGED", "TABLE_GRANT_ADDED"]));
    // Inventory completeness: dropping a reviewed view entry from the inventory makes the unchanged base fail.
    const views = rawInventory.entries.filter((e: { key: string }) => e.key.startsWith("view|app.ledger_balance|"));
    expect(views).toHaveLength(1);
    const without = parseInventory({ ...rawInventory, entries: rawInventory.entries.filter((e: { key: string }) => !e.key.startsWith("view|app.ledger_balance|")) });
    expect((await compareLive(without, db.admin)).diagnostics.map(d => d.code)).toEqual(["VIEW_CHANGED"]);
  });

  it("[LP0-11] overload and helper exposure fail independently", async () => {
    const original = "app.transition_job(uuid,uuid,integer,varchar,varchar,uuid,bigint,varchar,bigint)";
    const overload = await control(async c => {
      await asOwner(c, `CREATE FUNCTION app.transition_job(uuid,uuid,integer,varchar,varchar,uuid,bigint,varchar,bigint,text) RETURNS void LANGUAGE sql AS 'SELECT 1'`);
      await c.query(`REVOKE ALL ON FUNCTION app.transition_job(uuid,uuid,integer,varchar,varchar,uuid,bigint,varchar,bigint,text) FROM PUBLIC`);
      await c.query(`GRANT EXECUTE ON FUNCTION app.transition_job(uuid,uuid,integer,varchar,varchar,uuid,bigint,varchar,bigint,text) TO ${APPLICATION_ROLE}`);
    }, async c => { expect(await allowed(c, `SELECT has_function_privilege('${APPLICATION_ROLE}','app.transition_job(uuid,uuid,integer,varchar,varchar,uuid,bigint,varchar,bigint,text)','EXECUTE') AS allowed`)).toBe(true); });
    const exposed = overload.diagnostics.filter(d => d.code === "ROUTINE_EXPOSED");
    expect(exposed).toHaveLength(1);
    expect(exposed[0]!.object).toBe("function:app.transition_job(uuid,uuid,integer,character varying,character varying,uuid,bigint,character varying,bigint,text)");
    expect(overload.diagnostics.some(d => d.object.endsWith("character varying,bigint)"))).toBe(false); // the existing overload is its own, unchanged identity
    void original;
    // A function with no explicit ACL is executable by PUBLIC by PostgreSQL's built-in default.
    const builtin = await control(async c => { await asOwner(c, "CREATE FUNCTION app.lp0_ctl_public() RETURNS integer LANGUAGE sql AS 'SELECT 1'"); },
      async c => { expect(await allowed(c, `SELECT has_function_privilege('${APPLICATION_ROLE}','app.lp0_ctl_public()','EXECUTE') AS allowed`), "runtime reaches it through PUBLIC alone").toBe(true); });
    expect(brief(builtin)).toEqual(["OWNER_CHANGED function:app.lp0_ctl_public() -> jobguard_migration", "PUBLIC_GRANT_ADDED function:app.lp0_ctl_public() EXECUTE -> PUBLIC"]);
    // A newly exposed owner-only helper.
    const helper = "app.append_final_lock_audit(uuid,uuid,uuid,text,jsonb,jsonb)";
    const exposedHelper = await control(c => c.query(`GRANT EXECUTE ON FUNCTION ${helper} TO ${APPLICATION_ROLE}`).then(() => undefined),
      async c => { expect(await allowed(c, `SELECT has_function_privilege('${APPLICATION_ROLE}','${helper}','EXECUTE') AS allowed`)).toBe(true); });
    expect(brief(exposedHelper)).toEqual(["OWNER_CHANGED function:app.append_final_lock_audit(uuid,uuid,uuid,text,jsonb,jsonb) -> jobguard_migration", `ROUTINE_EXPOSED function:app.append_final_lock_audit(uuid,uuid,uuid,text,jsonb,jsonb) EXECUTE -> ${APPLICATION_ROLE}`]);
    // Other roles: a helper opened to the identity-side role is also a change.
    const identitySide = await control(c => c.query(`GRANT EXECUTE ON FUNCTION ${helper} TO jobguard_identity`).then(() => undefined));
    expect(identitySide.diagnostics.map(d => d.code).sort()).toEqual(["OWNER_CHANGED", "ROUTINE_EXPOSED"]);
    // Routine kinds other than functions are read without error and keep their own identity.
    const kinds = await control(async c => {
      await asOwner(c, "CREATE PROCEDURE app.lp0_ctl_proc(integer) LANGUAGE sql AS 'SELECT 1'");
      await asOwner(c, "CREATE AGGREGATE app.lp0_ctl_agg(integer) (sfunc = int4pl, stype = integer)");
      await c.query(`REVOKE ALL ON PROCEDURE app.lp0_ctl_proc(integer) FROM PUBLIC; GRANT EXECUTE ON PROCEDURE app.lp0_ctl_proc(integer) TO ${APPLICATION_ROLE}`);
      await c.query(`REVOKE ALL ON FUNCTION app.lp0_ctl_agg(integer) FROM PUBLIC; GRANT EXECUTE ON FUNCTION app.lp0_ctl_agg(integer) TO ${APPLICATION_ROLE}`);
    });
    expect(kinds.diagnostics.filter(d => d.code === "ROUTINE_EXPOSED").map(d => d.object).sort()).toEqual(["aggregate:app.lp0_ctl_agg(integer)", "procedure:app.lp0_ctl_proc(integer)"]);
    // Inventory completeness: removing the entry for one alternate signature exposes exactly that overload.
    const second = "function:app.adopt_in_flight_job(uuid,uuid,uuid,character varying,character varying,character,character varying,bigint,bigint,character varying,character varying,uuid,timestamp with time zone,uuid,uuid,uuid,uuid,uuid)";
    const key = `acl|routine|${second}|${APPLICATION_ROLE}|EXECUTE|-`;
    expect(rawInventory.entries.some((e: { key: string }) => e.key === key)).toBe(true);
    const without = parseInventory({ ...rawInventory, entries: rawInventory.entries.filter((e: { key: string }) => e.key !== key) });
    expect(brief(await compareLive(without, db.admin))).toEqual([`ROUTINE_EXPOSED ${second} EXECUTE -> ${APPLICATION_ROLE}`]);
  });

  it("[LP0-12] equivalent routine write capability fails", async () => {
    const tenant = "9d0c0000-0000-4000-8000-0000000000a1";
    const runtimeCannotInsertDirectly = `SELECT has_table_privilege('${APPLICATION_ROLE}','control_plane.tenant','INSERT') AS allowed`;
    expect(await allowed(db.admin, runtimeCannotInsertDirectly), "precondition: no direct write grant exists").toBe(false);
    const runtime = await db.runtimeClient();
    try {
      await expect(runtime.query("INSERT INTO control_plane.tenant(id) VALUES ($1)", [tenant])).rejects.toMatchObject({ code: "42501" });
      // The wrapper: owner-run, EXECUTE for the runtime login only, performing an effect the login cannot perform itself.
      await db.admin.query(`CREATE FUNCTION app.lp0_ctl_wrapper(p uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$ INSERT INTO control_plane.tenant(id) VALUES (p) $$;
        ALTER FUNCTION app.lp0_ctl_wrapper(uuid) OWNER TO jobguard_migration;
        REVOKE ALL ON FUNCTION app.lp0_ctl_wrapper(uuid) FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION app.lp0_ctl_wrapper(uuid) TO ${APPLICATION_ROLE}`);
      try {
        expect(await allowed(db.admin, runtimeCannotInsertDirectly), "still no direct write grant").toBe(false);
        // The control creates the intended reachable capability: the runtime login now causes the protected effect, and it persists.
        await runtime.query("SELECT app.lp0_ctl_wrapper($1)", [tenant]);
        const second = await db.admin.connect();
        try { expect((await second.query("SELECT count(*)::int AS n FROM control_plane.tenant WHERE id=$1", [tenant])).rows[0].n, "persisted, seen from a second connection").toBe(1); } finally { second.release(); }
        const result = await compareLive(inventory, db.admin);
        expect(brief(result).filter(b => !b.startsWith("OWNER_CHANGED"))).toEqual([`ROUTINE_EXPOSED function:app.lp0_ctl_wrapper(uuid) EXECUTE -> ${APPLICATION_ROLE}`]);
        expect(result.diagnostics.some(d => d.code === "TABLE_GRANT_ADDED" || d.code === "COLUMN_GRANT_ADDED"), "no table grant changed: only the routine reveals it").toBe(false);
        expect(result.diagnostics.find(d => d.code === "OWNER_CHANGED")).toMatchObject({ object: "function:app.lp0_ctl_wrapper(uuid)", grantee: "jobguard_migration" });
      } finally {
        await db.admin.query("DROP FUNCTION IF EXISTS app.lp0_ctl_wrapper(uuid); DELETE FROM control_plane.tenant WHERE id=$1".replace("$1", `'${tenant}'`));
      }
      // Clean-up proof: the effect and the routine are gone and the guard is clean again.
      await expect(runtime.query("SELECT app.lp0_ctl_wrapper($1)", [tenant])).rejects.toMatchObject({ code: "42883" });
    } finally { await runtime.end(); }
    expect((await db.admin.query("SELECT count(*)::int AS n FROM control_plane.tenant")).rows[0].n).toBe(0);
    expect((await compareLive(inventory, db.admin)).ok).toBe(true);
    // A wrapper that is NOT executable by the runtime login (owner-only) is not a capability and is not flagged.
    const hidden = await control(async c => {
      await c.query(`CREATE FUNCTION app.lp0_ctl_hidden(p uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$ INSERT INTO control_plane.tenant(id) VALUES (p) $$;
        ALTER FUNCTION app.lp0_ctl_hidden(uuid) OWNER TO jobguard_migration; REVOKE ALL ON FUNCTION app.lp0_ctl_hidden(uuid) FROM PUBLIC`);
    });
    expect(hidden.ok).toBe(true);
  });

  it("[LP0-17] every reachable authority path has a disposition", async () => {
    const live = await readCatalogue(db.admin);
    const facts = deriveFacts(live);
    const reviewed = new Set(inventory.entries.map(e => e.key));
    const groups = new Map(inventory.groups.map(g => [g.id, g]));
    const group = (key: string) => groups.get(inventory.entries.find(e => e.key === key)!.group)!;
    // Every live capability has a disposition (exception or approved), and every authority-bearing one has card, path, source and test.
    for (const f of facts) expect(reviewed.has(f.key), f.key).toBe(true);
    expect(pathCompleteness(inventory, repoFileExists)).toEqual([]);
    const paths = new Map(inventory.authorityPaths.map(p => [p.id, p]));
    for (const f of facts.filter(f => f.category === "acl" && f.grantee === APPLICATION_ROLE && f.privilege && f.privilege !== "SELECT" && (f.objectClass === "table" || f.objectClass === "column" || f.objectClass === "routine"))) {
      const g = group(f.key);
      if (f.objectClass !== "routine" || !g.kind.startsWith("helper")) {
        expect(g.status === "existing_exception" || g.status === "approved_current", f.key).toBe(true);
      }
      if (AUTHORITY_KINDS.has(g.kind)) { expect(g.cards.length, f.key).toBeGreaterThan(0); expect(paths.get(g.path!), f.key).toBeDefined(); }
    }
    // The proposal-review tables, evidence-upload UPDATE and scope/proposal column grants are classified by their actual effects, not as read/insert only.
    for (const key of [
      `acl|rel|table|app.proposal_review|${APPLICATION_ROLE}|UPDATE|-`, `acl|rel|table|app.proposal_review_line|${APPLICATION_ROLE}|DELETE|-`, `acl|col|app.proposal_line.state|${APPLICATION_ROLE}|UPDATE|-`,
      `acl|col|app.scope_identity.state|${APPLICATION_ROLE}|UPDATE|-`, `acl|col|app.evidence_upload.state|${APPLICATION_ROLE}|UPDATE|-`,
    ]) { const g = group(key); expect(g.cards.length, key).toBeGreaterThan(0); expect(g.downstream.length, key).toBeGreaterThan(30); }
    // The named LP-13 items are explicit authority paths.
    for (const id of ["ap-lp13-invoice-number-burning", "ap-lp13-legacy-unknown-raiser", "ap-lp13-scope-progress-actor", "ap-lp13-sso-audit-connection", "ap-lp13-0095-replay-branch"]) {
      expect(paths.get(id), id).toBeDefined();
      expect(paths.get(id)!.cards).toContain("LP-13");
    }
    // A path or card removed from the reviewed file fails inventory completeness.
    expect(() => parseInventory({ ...rawInventory, authorityPaths: rawInventory.authorityPaths.slice(1) })).toThrow(/no known authority path/);
    const firstAuthority = rawInventory.groups.findIndex((g: { kind: string }) => AUTHORITY_KINDS.has(g.kind));
    const noCard = rawInventory.groups.map((g: any, i: number) => (i === firstAuthority ? { ...g, cards: [], responsibilities: {} } : g));
    expect(() => parseInventory({ ...rawInventory, groups: noCard })).toThrow(/(closing LP card|has no LP card|needs an LP card)/);
    // Recorded (not compared) routine protection facts exist for every reachable routine, with static-scan hypotheses.
    const record = readProtectionRecord(live);
    expect(record.routines.length, "owner-only routines are recorded too (reachable: false)").toBe(live.routines.length);
    expect(record.routines.filter(r => r.reachable).length).toBeGreaterThan(100);
    // Identity completeness only. The recorded definition digests, search paths, policies and triggers are NOT compared with the live
    // database here: that comparison is the held LP0-13 mechanism (Q2) and is deliberately not built.
    expect(inventory.recorded.routines.map(r => r.identity).sort()).toEqual(record.routines.map(r => r.identity).sort()); // order-insensitive: database collation differs by host
    expect(inventory.recorded.policies.length).toBeGreaterThan(200);
    expect(inventory.recorded.triggers.length).toBeGreaterThan(300);
    expect(inventory.held.map(h => h.id)).toEqual(["LP0-13", "LP0-22"]);
  });

  it("proves the unreachable and trigger-only routines are really refused to the runtime login", async () => {
    const live = await readCatalogue(db.admin);
    const runtime = await db.runtimeClient();
    try {
      let refused = 0, notCallable = 0;
      for (const r of live.routines) {
        if (r.kind !== "function" && r.kind !== "procedure") continue;
        if (r.extension) continue;
        const call = `${r.schema}.${r.name}(${r.args ? r.args.split(",").map(t => `NULL::${t.trim()}`).join(",") : ""})`;
        const holdsExecute = ((await db.admin.query("SELECT has_function_privilege($1,$2::regprocedure,'EXECUTE') AS ok", [APPLICATION_ROLE, `${r.schema}.${r.name}(${r.args})`])).rows[0] as { ok: boolean }).ok;
        if (!holdsExecute) {
          await expect(runtime.query(r.kind === "procedure" ? `CALL ${call}` : `SELECT ${call}`), `${r.schema}.${r.name}`).rejects.toMatchObject({ code: "42501" });
          refused++;
        } else if (r.returnsTrigger) {
          await expect(runtime.query(`SELECT ${call}`), `${r.schema}.${r.name}`).rejects.toMatchObject({ code: "0A000" });
          notCallable++;
        }
      }
      expect(refused).toBeGreaterThan(40);
      expect(notCallable).toBeGreaterThan(10);
    } finally { await runtime.end(); }
  });

  it("reports existing exceptions truthfully: the real runtime login can do these things today", async () => {
    const runtime = await db.runtimeClient();
    const tenant = "9d0c0000-0000-4000-8000-0000000000b2", user = "9d0c0000-0000-4000-8000-0000000000b3", account = "9d0c0000-0000-4000-8000-0000000000b4";
    await db.admin.query("INSERT INTO control_plane.tenant(id) VALUES ($1); INSERT INTO identity.identity_user(id) VALUES ($2)".replace("$1", `'${tenant}'`).replace("$2", `'${user}'`));
    await db.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES ($1,$2,'LP-0 fixture')".replace("$1", `'${account}'`).replace("$2", `'${tenant}'`));
    try {
      // LP-1: the application login cannot forge an owner membership; committed state stays unchanged.
      const committed = async () => (await db.admin.query(`SELECT
        ARRAY(SELECT row_to_json(m)::text FROM app.membership m WHERE tenant_id=$1 ORDER BY id) AS memberships,
        ARRAY(SELECT row_to_json(a)::text FROM app.account a WHERE tenant_id=$1 ORDER BY id) AS accounts,
        ARRAY(SELECT row_to_json(u)::text FROM identity.identity_user u WHERE id=$2) AS users,
        ARRAY(SELECT row_to_json(t)::text FROM control_plane.tenant t WHERE id=$1) AS tenants`, [tenant, user])).rows;
      const before = await committed();
      await runtime.query("BEGIN");
      await runtime.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
      await expect(runtime.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES (gen_random_uuid(),$1,$2,$3,'owner') RETURNING role", [tenant, account, user])).rejects.toMatchObject({ code: "42501" });
      await runtime.query("ROLLBACK");
      expect(await committed()).toEqual(before);
      // LP-2: the legacy transition routine is executable (it fails on its own checks, not on permission).
      await runtime.query("BEGIN");
      await expect(runtime.query("SELECT app.transition_job(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)")).rejects.not.toMatchObject({ code: "42501" });
      await runtime.query("ROLLBACK");
    } finally {
      await runtime.query("ROLLBACK").catch(() => undefined);
      await runtime.end();
      await db.admin.query(`DELETE FROM app.membership WHERE tenant_id='${tenant}'; DELETE FROM app.account WHERE tenant_id='${tenant}'; DELETE FROM identity.identity_user WHERE id='${user}'; DELETE FROM control_plane.tenant WHERE id='${tenant}'`);
    }
    expect((await db.admin.query("SELECT (SELECT count(*) FROM app.membership)::int AS m,(SELECT count(*) FROM app.account)::int AS a,(SELECT count(*) FROM control_plane.tenant)::int AS t")).rows[0]).toEqual({ m: 0, a: 0, t: 0 });
    expect((await compareLive(inventory, db.admin)).ok).toBe(true);
  });
});
