/**
 * LP-0 grant freeze guard, real PostgreSQL 16, complete migration registry.
 *
 * Owner setup (admin), runtime access (jobguard_runtime, real role) and catalogue inspection are kept apart. Catalogue facts of the
 * migrated base are read BEFORE any test-only login posture is applied. Every deliberate control states its precondition, introduces
 * ONE kind of defect, asserts the specific guard diagnostic, and proves clean-up. LP0-13 (same-signature routine/RLS change detection)
 * is HELD under the Q2 ruling and is deliberately not built here.
 */
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { MIGRATION_URLS, migrate } from "../src/index.js";
import {
  APPLICATION_ROLE, brief, compareInventory, deriveFacts, dispositions, existingExceptionKeys, finalAllowedKeys, keys, loadReviewedInventory, parseInventory, staleEntries,
  readCatalogue, startLp0Database, type Comparison, type Fact, type Inventory, type Lp0Database,
} from "./lp-0-catalog.js";
import { rolledBack } from "./upgrade-proof-utils.js";

let db: Lp0Database;
let inventory: Inventory;
let rawInventory: any;
let baselineMigrationOnly: Fact[]; // runtime NOLOGIN: exactly as the migrations leave it
let baselineBootstrapLogin: Fact[]; // runtime LOGIN: the synthetic-bootstrap posture used to exercise the real role
let registryBefore: { migration_name: string; applied_at: string }[];
let protectionDigestsBefore: string[];

const registry = async () => (await db.admin.query("SELECT migration_name,applied_at::text AS applied_at FROM public.jobguard_schema_migration ORDER BY migration_name")).rows as { migration_name: string; applied_at: string }[];
const factKeys = (facts: Fact[]) => facts.map(f => f.key);

/** One deliberate control, rolled back whatever happens. Precondition: the guard passes. Returns the guard's reading after the defect. */
async function control(defect: (client: PoolClient) => Promise<void>, observe?: (client: PoolClient) => Promise<void>): Promise<Comparison> {
  return rolledBack(db.admin, async client => {
    const before = compareInventory(inventory, deriveFacts(await readCatalogue(client)));
    expect(brief(before), "precondition: the reviewed base passes before the defect").toEqual([]);
    await defect(client);
    await observe?.(client);
    return compareInventory(inventory, deriveFacts(await readCatalogue(client)));
  });
}
const has = async (c: PoolClient, sql: string, values: unknown[] = []) => (await c.query(sql, values)).rows[0]!.allowed as boolean;

beforeAll(async () => {
  ({ raw: rawInventory, inventory } = await loadReviewedInventory());
  db = await startLp0Database(58600);
  // Catalogue of the migrated base BEFORE any test-only login posture is applied.
  baselineMigrationOnly = deriveFacts(await readCatalogue(db.admin));
  registryBefore = await registry();
  protectionDigestsBefore = (await readCatalogue(db.admin)).routines.map(r => `${r.schema}.${r.name}(${r.args})=${r.definitionDigest}`);
  await db.bootstrapRuntimeLogin();
  baselineBootstrapLogin = deriveFacts(await readCatalogue(db.admin));
}, 300_000);

afterAll(async () => { await db?.stop(); });

describe("LP-0 grant freeze guard against the fully migrated database", () => {
  it("[LP0-01] full registry and repeat migrate retain the reviewed catalogue", async () => {
    expect(registryBefore.map(r => r.migration_name)).toEqual([...db.migrationNames].sort());
    expect(registryBefore.length).toBe(MIGRATION_URLS.length);
    await migrate(db.admin); await migrate(db.admin);
    expect(await registry()).toEqual(registryBefore);
    const catalogue = await readCatalogue(db.admin);
    expect(catalogue.routines.map(r => `${r.schema}.${r.name}(${r.args})=${r.definitionDigest}`)).toEqual(protectionDigestsBefore);
    expect(factKeys(deriveFacts(catalogue))).toEqual(factKeys(baselineBootstrapLogin));
    expect(brief(compareInventory(inventory, baselineMigrationOnly))).toEqual([]);
    expect(catalogue.server).toMatch(/PostgreSQL 16\./);
  });

  it("[LP0-02] installed base matches reviewed capabilities", async () => {
    for (const profile of [baselineMigrationOnly, baselineBootstrapLogin]) {
      const result = compareInventory(inventory, profile);
      expect(brief(result)).toEqual([]);
      expect(result.matched).toBe(profile.length);
    }
    // No stale entries: the only inventory keys absent from a live profile are the OTHER profile's role-login key.
    // A closing LP card must therefore remove its inventory entries in the same change; a closed exception left
    // in the file (which a later migration could silently re-grant) makes the base fail.
    const roleKeys = (facts: Fact[]) => facts.filter(f => f.category === "role" && f.object === APPLICATION_ROLE).map(f => f.key).sort();
    expect(roleKeys(baselineMigrationOnly).length).toBe(1);
    expect(roleKeys(baselineBootstrapLogin).length).toBe(1);
    expect(compareInventory(inventory, baselineMigrationOnly).reductions).toEqual(roleKeys(baselineBootstrapLogin));
    expect(compareInventory(inventory, baselineBootstrapLogin).reductions).toEqual(roleKeys(baselineMigrationOnly));
    expect(staleEntries(compareInventory(inventory, baselineMigrationOnly), roleKeys(baselineBootstrapLogin))).toEqual([]);
    expect(staleEntries(compareInventory(inventory, baselineBootstrapLogin), roleKeys(baselineMigrationOnly))).toEqual([]);
    // The expected value is the committed file, never the live read: a missing, malformed or wrong-version file is refused.
    expect(() => parseInventory(undefined)).toThrow();
    expect(() => parseInventory({ ...rawInventory, version: 2 })).toThrow(/version/);
    expect(() => parseInventory({ ...rawInventory, entries: rawInventory.entries.slice(1).concat([{ key: rawInventory.entries[1].key, group: rawInventory.entries[1].group }]) })).toThrow(/duplicate entry key/);
    const withoutOne = parseInventory({ ...rawInventory, entries: rawInventory.entries.filter((e: { key: string }, i: number) => i !== 3) });
    expect(compareInventory(withoutOne, baselineMigrationOnly).ok).toBe(false);
    // The reviewed file names the base it was prepared against and the profiles it covers.
    expect(MIGRATION_URLS.map(u => u.pathname.split("/").at(-1)!)).toContain(inventory.base.lastMigration);
    expect(inventory.base.subject).toBe(APPLICATION_ROLE);
    expect(inventory.base.profiles.length).toBe(2);
    // The runtime role in this database really is the least-privilege posture the inventory records (inspected, not assumed).
    const role = (await readCatalogue(db.admin)).roles.find(r => r.name === APPLICATION_ROLE)!;
    expect(role).toMatchObject({ super: false, bypassrls: false, createrole: false, createdb: false, replication: false, inherit: false });
  });

  it("[LP0-03] dangerous column grant fails the freeze", async () => {
    for (const column of ["status", "accepted_net_value_pence", "recovery_cap_pence", "fee_policy_version", "accepted_quote_version_id"]) {
      const result = await control(
        c => c.query(`GRANT UPDATE (${column}) ON app.job TO ${APPLICATION_ROLE}`).then(() => undefined),
        async c => { expect(await has(c, `SELECT has_column_privilege('${APPLICATION_ROLE}','app.job','${column}','UPDATE') AS allowed`)).toBe(true); },
      );
      expect(brief(result), column).toEqual([`COLUMN_GRANT_ADDED app.job.${column} UPDATE -> ${APPLICATION_ROLE}`]);
      expect(result.diagnostics[0]).toMatchObject({ disposition: "unreviewed_addition", cards: [] });
    }
    // Table-level and column-level facts are distinct, and a grant option is its own fact.
    const table = await control(c => c.query(`GRANT UPDATE ON app.job TO ${APPLICATION_ROLE}`).then(() => undefined));
    expect(table.diagnostics.map(d => d.code)).toContain("TABLE_GRANT_ADDED");
    expect(table.diagnostics.some(d => d.code === "COLUMN_GRANT_ADDED")).toBe(false);
    const option = await control(c => c.query(`GRANT SELECT ON app.job TO ${APPLICATION_ROLE} WITH GRANT OPTION`).then(() => undefined));
    expect(option.diagnostics.map(d => d.code)).toEqual(["GRANT_OPTION_ADDED"]);
    // Before the defect the runtime role cannot update these columns at all (real role, real refusal).
    const runtime = await db.runtimeClient();
    try { await expect(runtime.query("UPDATE app.job SET status='live' WHERE false")).rejects.toMatchObject({ code: "42501" }); } finally { await runtime.end(); }
  });

  it("[LP0-04] PUBLIC authority grant fails even without a runtime operation delta", async () => {
    const result = await control(
      c => c.query("GRANT INSERT ON app.job TO PUBLIC").then(() => undefined),
      async c => { expect(await has(c, `SELECT has_table_privilege('${APPLICATION_ROLE}','app.job','INSERT') AS allowed`)).toBe(true); },
    );
    // The runtime login held INSERT directly before and after, so no effective-privilege delta exists. Only the PUBLIC fact reveals it.
    expect(brief(result)).toEqual(["PUBLIC_GRANT_ADDED app.job INSERT -> PUBLIC"]);
    const column = await control(c => c.query("GRANT UPDATE (status) ON app.job TO PUBLIC").then(() => undefined));
    expect(brief(column)).toEqual(["PUBLIC_GRANT_ADDED app.job.status UPDATE -> PUBLIC"]);
    const schema = await control(c => c.query("GRANT CREATE ON SCHEMA public TO PUBLIC").then(() => undefined));
    expect(brief(schema)).toEqual(["PUBLIC_GRANT_ADDED public CREATE -> PUBLIC"]);
  });

  it("[LP0-05] inherited and transitive authority grants fail", async () => {
    const direct = await control(async c => {
      await c.query("CREATE ROLE lp0_ctl_inherited NOLOGIN");
      await c.query("GRANT UPDATE ON app.job TO lp0_ctl_inherited");
      await c.query(`GRANT lp0_ctl_inherited TO ${APPLICATION_ROLE} WITH INHERIT TRUE, SET FALSE`);
    }, async c => {
      expect(await has(c, `SELECT has_table_privilege('${APPLICATION_ROLE}','app.job','UPDATE') AS allowed`), "runtime now holds UPDATE only through the inherited role").toBe(true);
    });
    const codes = direct.diagnostics.map(d => d.code);
    for (const code of ["TABLE_GRANT_ADDED", "ROLE_PATH_ADDED", "MEMBERSHIP_CHANGED", "ROLE_ATTRIBUTE_CHANGED", "EFFECTIVE_PRIVILEGE_ADDED"]) expect(codes, code).toContain(code);
    expect(direct.diagnostics.find(d => d.code === "EFFECTIVE_PRIVILEGE_ADDED")).toMatchObject({ object: "app.job", privilege: "UPDATE", route: "inherit:lp0_ctl_inherited" });
    // Transitive: runtime -> a -> b, where only b holds the grant.
    const transitive = await control(async c => {
      await c.query("CREATE ROLE lp0_ctl_a NOLOGIN; CREATE ROLE lp0_ctl_b NOLOGIN");
      await c.query("GRANT DELETE ON app.job TO lp0_ctl_b");
      await c.query("GRANT lp0_ctl_b TO lp0_ctl_a WITH INHERIT TRUE, SET FALSE");
      await c.query(`GRANT lp0_ctl_a TO ${APPLICATION_ROLE} WITH INHERIT TRUE, SET FALSE`);
    });
    const reach = transitive.diagnostics.filter(d => d.code === "ROLE_PATH_ADDED" && d.grantee === APPLICATION_ROLE).map(d => d.object).sort();
    expect(reach, "the runtime login reaches both the direct and the transitive role").toEqual(["lp0_ctl_a", "lp0_ctl_b"]);
    expect(transitive.diagnostics.find(d => d.code === "EFFECTIVE_PRIVILEGE_ADDED")).toMatchObject({ privilege: "DELETE", route: "inherit:lp0_ctl_b" });
    // A membership with every flag off still changes the reviewed state, and different flags are different facts.
    const flagsOff = await control(async c => {
      await c.query("CREATE ROLE lp0_ctl_idle NOLOGIN");
      await c.query(`GRANT lp0_ctl_idle TO ${APPLICATION_ROLE} WITH INHERIT FALSE, SET FALSE`);
    });
    expect(flagsOff.diagnostics.map(d => d.code)).toContain("MEMBERSHIP_CHANGED");
    expect(flagsOff.diagnostics.some(d => d.code === "ROLE_PATH_ADDED" || d.code === "ROLE_SET_PATH_ADDED")).toBe(false);
    const flagKeys = new Set<string>();
    for (const [inherit, set] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      const r = await control(async c => {
        await c.query("CREATE ROLE lp0_ctl_flags NOLOGIN");
        await c.query(`GRANT lp0_ctl_flags TO ${APPLICATION_ROLE} WITH INHERIT ${inherit}, SET ${set}`);
      });
      flagKeys.add(r.diagnostics.find(d => d.code === "MEMBERSHIP_CHANGED")!.key);
    }
    expect(flagKeys.size).toBe(4);
  });

  it("[LP0-06] NOINHERIT does not hide SET ROLE escalation", async () => {
    // Committed control: the real runtime login has to attempt the switch from its own session.
    const expectRefused = async (role: string) => {
      const runtime = await db.runtimeClient();
      try { await expect(runtime.query(`SET ROLE ${role}`)).rejects.toMatchObject({ code: "42501" }); } finally { await runtime.end(); }
    };
    await expectRefused("jobguard_migration"); // baseline: the real role cannot assume the owner
    await expectRefused("jobguard_identity");
    await db.admin.query("CREATE ROLE lp0_ctl_switch NOLOGIN; GRANT USAGE ON SCHEMA app TO lp0_ctl_switch; GRANT UPDATE ON app.job TO lp0_ctl_switch");
    try {
      await db.admin.query(`GRANT lp0_ctl_switch TO ${APPLICATION_ROLE} WITH INHERIT FALSE, SET TRUE`);
      const noAutomatic = (await db.admin.query(`SELECT has_table_privilege('${APPLICATION_ROLE}','app.job','UPDATE') AS allowed`)).rows[0]!.allowed;
      expect(noAutomatic, "automatic inheritance is off, so the ordinary privilege check sees nothing").toBe(false);
      const runtime = await db.runtimeClient();
      try {
        await runtime.query("SET ROLE lp0_ctl_switch");
        expect((await runtime.query("SELECT has_table_privilege(current_user,'app.job','UPDATE') AS allowed")).rows[0]!.allowed, "yet SET ROLE reaches the grant").toBe(true);
      } finally { await runtime.end(); }
      const result = await (await import("./lp-0-catalog.js")).compareLive(inventory, db.admin);
      expect(result.diagnostics.map(d => d.code)).toContain("ROLE_SET_PATH_ADDED");
      expect(result.diagnostics.find(d => d.code === "ROLE_SET_PATH_ADDED")).toMatchObject({ grantee: APPLICATION_ROLE, object: "lp0_ctl_switch", route: "set" });
      expect(result.diagnostics.some(d => d.code === "EFFECTIVE_PRIVILEGE_ADDED")).toBe(false);
    } finally {
      await db.admin.query(`REVOKE lp0_ctl_switch FROM ${APPLICATION_ROLE}; REVOKE UPDATE ON app.job FROM lp0_ctl_switch; REVOKE USAGE ON SCHEMA app FROM lp0_ctl_switch; DROP ROLE lp0_ctl_switch`);
    }
    // Owner and migration authority: assuming either is a reported path, with the number of objects it would hand over.
    for (const owner of ["jobguard_migration", "jobguard_identity", "jobguard_infrastructure"]) {
      const result = await control(c => c.query(`GRANT ${owner} TO ${APPLICATION_ROLE} WITH INHERIT FALSE, SET TRUE`).then(() => undefined));
      const path = result.diagnostics.find(d => d.code === "ROLE_SET_PATH_ADDED");
      expect(path, owner).toMatchObject({ object: owner, grantee: APPLICATION_ROLE });
    }
    await expectRefused("jobguard_migration"); // after clean-up the real role is refused again
  });

  it("[LP0-07] owner and role-attribute escalation fails", async () => {
    const owner = await control(
      c => c.query(`ALTER TABLE app.job OWNER TO ${APPLICATION_ROLE}`).then(() => undefined),
      async c => { expect(await has(c, `SELECT has_table_privilege('${APPLICATION_ROLE}','app.job','TRUNCATE') AS allowed`)).toBe(true); },
    );
    expect(owner.diagnostics.map(d => d.code)).toContain("OWNER_CHANGED");
    expect(owner.diagnostics.find(d => d.code === "OWNER_CHANGED")).toMatchObject({ object: "app.job", grantee: APPLICATION_ROLE });
    expect(owner.diagnostics.some(d => d.code === "EFFECTIVE_PRIVILEGE_ADDED" && d.route?.includes("owner"))).toBe(true);
    const routineOwner = await control(c => c.query(`ALTER FUNCTION app.transition_job(uuid,uuid,integer,varchar,varchar,uuid,bigint,varchar,bigint) OWNER TO ${APPLICATION_ROLE}`).then(() => undefined));
    expect(routineOwner.diagnostics.map(d => d.code)).toContain("OWNER_CHANGED");
    const schemaOwner = await control(c => c.query(`ALTER SCHEMA app OWNER TO ${APPLICATION_ROLE}`).then(() => undefined));
    expect(schemaOwner.diagnostics.map(d => d.code)).toContain("OWNER_CHANGED");
    for (const attribute of ["CREATEDB", "CREATEROLE", "BYPASSRLS", "REPLICATION", "SUPERUSER", "INHERIT"]) {
      const result = await control(c => c.query(`ALTER ROLE ${APPLICATION_ROLE} ${attribute}`).then(() => undefined));
      expect(result.diagnostics.map(d => d.code), attribute).toContain("ROLE_ATTRIBUTE_CHANGED");
      expect(result.diagnostics.find(d => d.code === "ROLE_ATTRIBUTE_CHANGED")!.object, attribute).toBe(APPLICATION_ROLE);
    }
    const other = await control(c => c.query("ALTER ROLE jobguard_migration BYPASSRLS").then(() => undefined));
    expect(other.diagnostics.map(d => d.code)).toEqual(["ROLE_ATTRIBUTE_CHANGED"]);
    const setting = await control(c => c.query(`ALTER ROLE ${APPLICATION_ROLE} SET row_security = off`).then(() => undefined));
    expect(setting.diagnostics.map(d => d.code)).toEqual(["ROLE_ATTRIBUTE_CHANGED"]);
    // LOGIN posture is recorded accurately for the profile under test: NOLOGIN as migrated, LOGIN as synthetic bootstrap.
    const login = (facts: Fact[]) => facts.find(f => f.category === "role" && f.object === APPLICATION_ROLE)!.key;
    expect(login(baselineMigrationOnly)).toContain("login=f");
    expect(login(baselineBootstrapLogin)).toContain("login=t");
    expect((await readCatalogue(db.admin)).roles.find(r => r.name === APPLICATION_ROLE)!.login).toBe(true);
    // Neither profile grants superuser, BYPASSRLS, CREATEROLE, CREATEDB or replication to any jobguard_ role.
    for (const k of [...baselineMigrationOnly, ...baselineBootstrapLogin].filter(f => f.category === "role" && f.object.startsWith("jobguard_")).map(f => f.key)) {
      expect(k, k).toMatch(/super=f,inherit=f,createrole=f,createdb=f,login=[tf],replication=f,bypassrls=f/);
    }
  });

  it("[LP0-08] DDL and destructive capabilities fail", async () => {
    // Baseline refusals by the real role.
    const runtime = await db.runtimeClient();
    try {
      await expect(runtime.query("CREATE TABLE app.lp0_ctl_ddl(a int)")).rejects.toMatchObject({ code: "42501" });
      await expect(runtime.query("CREATE TABLE public.lp0_ctl_ddl(a int)")).rejects.toMatchObject({ code: "42501" });
      await expect(runtime.query("TRUNCATE app.job")).rejects.toMatchObject({ code: "42501" });
      await expect(runtime.query("CREATE TRIGGER lp0_ctl BEFORE INSERT ON app.job FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation()")).rejects.toMatchObject({ code: "42501" });
      await expect(runtime.query("CREATE SCHEMA lp0_ctl_schema")).rejects.toMatchObject({ code: "42501" });
    } finally { await runtime.end(); }
    const schema = await control(c => c.query(`GRANT CREATE ON SCHEMA app TO ${APPLICATION_ROLE}`).then(() => undefined),
      async c => { expect(await has(c, `SELECT has_schema_privilege('${APPLICATION_ROLE}','app','CREATE') AS allowed`)).toBe(true); });
    expect(brief(schema)).toEqual([`SCHEMA_PRIVILEGE_ADDED app CREATE -> ${APPLICATION_ROLE}`]);
    const database = await control(c => c.query(`GRANT CREATE ON DATABASE ${db.databaseName} TO ${APPLICATION_ROLE}`).then(() => undefined),
      async c => { expect(await has(c, `SELECT has_database_privilege('${APPLICATION_ROLE}','${db.databaseName}','CREATE') AS allowed`)).toBe(true); });
    expect(brief(database)).toEqual([`DATABASE_PRIVILEGE_ADDED ${db.databaseName} CREATE -> ${APPLICATION_ROLE}`]);
    for (const privilege of ["TRUNCATE", "TRIGGER", "REFERENCES"]) {
      const result = await control(c => c.query(`GRANT ${privilege} ON app.job TO ${APPLICATION_ROLE}`).then(() => undefined),
        async c => { expect(await has(c, `SELECT has_table_privilege('${APPLICATION_ROLE}','app.job','${privilege}') AS allowed`)).toBe(true); });
      expect(brief(result), privilege).toEqual([`DESTRUCTIVE_PRIVILEGE_ADDED app.job ${privilege} -> ${APPLICATION_ROLE}`]);
    }
    // The runtime login holds none of these today, as PostgreSQL itself answers.
    const live = await readCatalogue(db.admin);
    expect(live.effective.filter(e => (e.cls === "schema" || e.cls === "database") && e.privilege === "CREATE")).toEqual([]);
    expect(live.effective.filter(e => e.cls === "rel" && ["TRUNCATE", "TRIGGER", "REFERENCES"].includes(e.privilege))).toEqual([]);
  });

  it("[LP0-09] sequence capability additions fail", async () => {
    const live = await readCatalogue(db.admin);
    expect(live.relations.filter(r => r.kind === "sequence"), "no sequence exists at the inspected base; invoice numbering uses tables").toEqual([]);
    for (const privilege of ["USAGE", "SELECT", "UPDATE"]) {
      const result = await control(async c => {
        await c.query("CREATE SEQUENCE app.lp0_ctl_seq");
        await c.query("ALTER SEQUENCE app.lp0_ctl_seq OWNER TO jobguard_migration");
        await c.query(`GRANT ${privilege} ON SEQUENCE app.lp0_ctl_seq TO ${APPLICATION_ROLE}`);
      }, async c => { expect(await has(c, `SELECT has_sequence_privilege('${APPLICATION_ROLE}','app.lp0_ctl_seq','${privilege}') AS allowed`)).toBe(true); });
      expect(result.diagnostics.find(d => d.code === "SEQUENCE_GRANT_ADDED"), privilege).toMatchObject({ object: "app.lp0_ctl_seq", privilege, grantee: APPLICATION_ROLE });
    }
    const owned = await control(async c => { await c.query("CREATE SEQUENCE app.lp0_ctl_seq"); await c.query(`ALTER SEQUENCE app.lp0_ctl_seq OWNER TO ${APPLICATION_ROLE}`); });
    expect(owned.diagnostics.map(d => d.code)).toContain("OWNER_CHANGED");
    // The two existing number-sequence TABLES are not labelled harmless: money groups, with the numbering consequence and cards named.
    const groups = new Map(inventory.groups.map(g => [g.id, g]));
    for (const table of ["app.customer_invoice_sequence", "app.customer_credit_note_sequence"]) {
      const entries = inventory.entries.filter(e => e.key.includes(`|${table}|${APPLICATION_ROLE}|`));
      expect(entries.map(e => e.key.split("|")[5]).sort(), table).toEqual(["INSERT", "SELECT"]);
      for (const e of entries) {
        const g = groups.get(e.group)!;
        expect(g.kind, table).toBe("money");
        expect(g.status).toBe("existing_exception");
        expect(g.cards).toEqual(expect.arrayContaining(["LP-8a", "LP-13"]));
        expect(g.downstream).toMatch(/number/i);
      }
    }
  });

  it("[LP0-14] defaults cover future objects and do not repair existing ACLs", async () => {
    const live = await readCatalogue(db.admin);
    expect(live.defaults, "no explicit object-creator default privilege exists at the inspected base").toEqual([]);
    expect(baselineMigrationOnly.filter(f => f.key.startsWith("default|explicit|"))).toEqual([]);
    expect(baselineMigrationOnly.filter(f => f.key.startsWith("default|builtin|")).map(f => f.key).sort()).toEqual([
      "default|builtin|database|PUBLIC|CONNECT|-", "default|builtin|database|PUBLIC|TEMPORARY|-", "default|builtin|function|PUBLIC|EXECUTE|-",
      "default|builtin|language|PUBLIC|USAGE|-", "default|builtin|type|PUBLIC|USAGE|-",
    ]);
    // An existing table the runtime login cannot read, and one it can.
    const existing = "app.shadow_break_glass_access";
    const result = await control(async c => {
      expect(await has(c, `SELECT has_table_privilege('${APPLICATION_ROLE}','${existing}','SELECT') AS allowed`)).toBe(false);
      await c.query(`ALTER DEFAULT PRIVILEGES FOR ROLE jobguard_migration IN SCHEMA app GRANT SELECT, INSERT ON TABLES TO ${APPLICATION_ROLE}`);
      expect(await has(c, `SELECT has_table_privilege('${APPLICATION_ROLE}','${existing}','SELECT') AS allowed`), "defaults do not retroactively amend the existing table").toBe(false);
      await c.query("SET LOCAL ROLE jobguard_migration");
      await c.query("CREATE TABLE app.lp0_ctl_future(id int)");
      await c.query("RESET ROLE");
      expect(await has(c, `SELECT has_table_privilege('${APPLICATION_ROLE}','app.lp0_ctl_future','INSERT') AS allowed`), "but a table created afterwards inherits the default").toBe(true);
    });
    const codes = result.diagnostics.map(d => d.code);
    expect(codes.filter(c => c === "DEFAULT_PRIVILEGE_ADDED")).toHaveLength(2);
    expect(brief(result).filter(b => b.startsWith("TABLE_GRANT_ADDED app.lp0_ctl_future"))).toEqual([
      `TABLE_GRANT_ADDED app.lp0_ctl_future INSERT -> ${APPLICATION_ROLE}`, `TABLE_GRANT_ADDED app.lp0_ctl_future SELECT -> ${APPLICATION_ROLE}`,
    ]);
    expect(result.diagnostics.find(d => d.code === "DEFAULT_PRIVILEGE_ADDED")).toMatchObject({ object: "jobguard_migration/app", route: "future-objects" });
    // A dangerous future default for functions: PUBLIC execute on everything the owner creates later.
    const fn = await control(c => c.query("ALTER DEFAULT PRIVILEGES FOR ROLE jobguard_migration IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO jobguard_identity").then(() => undefined));
    expect(fn.diagnostics.map(d => d.code)).toEqual(["DEFAULT_PRIVILEGE_ADDED"]);
    const global = await control(c => c.query(`ALTER DEFAULT PRIVILEGES FOR ROLE jobguard_migration GRANT ALL ON TABLES TO ${APPLICATION_ROLE}`).then(() => undefined));
    expect(global.diagnostics.every(d => d.code === "DEFAULT_PRIVILEGE_ADDED")).toBe(true);
    expect(global.diagnostics.length).toBeGreaterThanOrEqual(7);
    expect(global.diagnostics[0]!.object).toBe("jobguard_migration/*");
  });

  it("[LP0-15] exceptions cannot become target authority", async () => {
    const exceptions = existingExceptionKeys(inventory);
    const finalState = finalAllowedKeys(inventory);
    expect(exceptions.size).toBeGreaterThan(50);
    for (const k of exceptions) expect(finalState.has(k), k).toBe(false);
    const groups = new Map(inventory.groups.map(g => [g.id, g]));
    const rows = dispositions(inventory, baselineBootstrapLogin);
    const find = (key: string) => rows.find(r => r.key === key);
    // Existing powers are reported as what they are, not as SELECT/INSERT-only and not as the final state.
    for (const [key, cards] of [
      ["acl|rel|table|app.audit_event|jobguard_audit_writer|INSERT|-", ["LP-4", "LP-6e"]],
      ["acl|rel|table|app.customer_invoice|jobguard_runtime|INSERT|-", ["LP-8a"]],
      ["acl|rel|table|app.proposal_review|jobguard_runtime|DELETE|-", ["LP-6d"]],
      ["acl|rel|table|app.evidence_upload|jobguard_runtime|INSERT|-", ["LP-8b"]],
    ] as const) {
      const row = find(key);
      expect(row, key).toBeDefined();
      expect(row).toMatchObject({ disposition: "existing_exception" });
      expect(row!.cards, key).toEqual(expect.arrayContaining([...cards]));
      expect(row!.target).not.toBe("retain");
    }
    // LP-4 deliberately withdraws direct runtime audit INSERT; its dedicated
    // NOLOGIN writer is the remaining, separately reviewed capability above.
    expect(find("acl|rel|table|app.audit_event|jobguard_runtime|INSERT|-")).toBeUndefined();
    // LP-1 closed these broad powers; neither live facts nor the reviewed exceptions may retain them.
    for (const key of [
      "acl|rel|table|app.membership|jobguard_runtime|DELETE|-",
      "acl|rel|table|app.account|jobguard_runtime|UPDATE|-",
    ]) {
      expect(find(key), key).toBeUndefined();
      expect(exceptions.has(key), key).toBe(false);
      expect(inventory.entries.some(entry => entry.key === key), key).toBe(false);
    }
    const runtime = await db.runtimeClient();
    try {
      await expect(runtime.query("DELETE FROM app.membership WHERE false")).rejects.toMatchObject({ code: "42501" });
      await expect(runtime.query("UPDATE app.account SET name=name WHERE false")).rejects.toMatchObject({ code: "42501" });
    } finally { await runtime.end(); }
    // Only these exact immutable locking-column dispositions survive, still assigned to LP-1.
    const lockingKeys = ["account", "membership"].map(table => `acl|col|app.${table}.created_at|jobguard_runtime|UPDATE|-`);
    expect(rows.filter(row => row.group === "x-membership-account-writes").map(row => row.key).sort()).toEqual(lockingKeys);
    for (const key of lockingKeys) {
      expect(find(key), key).toMatchObject({ disposition: "existing_exception", target: "revoke" });
      expect(find(key)!.cards, key).toContain("LP-1");
    }
    const closedTransition = keys.aclRoutine("function:app.transition_job(uuid,uuid,integer,character varying,character varying,uuid,bigint,character varying,bigint)", APPLICATION_ROLE, "EXECUTE", false);
    expect(find(closedTransition)).toBeUndefined();
    expect(exceptions.has(closedTransition)).toBe(false);
    expect(baselineBootstrapLogin.some(fact => fact.key === closedTransition)).toBe(false);
    expect((await db.admin.query("SELECT has_function_privilege('jobguard_runtime','app.transition_job(uuid,uuid,integer,varchar,varchar,uuid,bigint,varchar,bigint)','EXECUTE') allowed")).rows).toEqual([{ allowed: false }]);
    // Reads are approved current capability, rebound at LP-11; they are not an exception.
    expect(find("acl|rel|table|app.job|jobguard_runtime|SELECT|-")).toMatchObject({ disposition: "approved_current" });
    // Target state is a separate section and names no live key.
    expect(inventory.targetState.length).toBeGreaterThan(5);
    for (const t of inventory.targetState) { expect(t.statement).not.toMatch(/^acl\|/); for (const gid of t.groups) expect(groups.has(gid)).toBe(true); }
    const markdown = await readFile(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.md", import.meta.url), "utf8");
    expect(markdown).toMatch(/## Existing exceptions \(temporary, not approved for production use\)/);
    expect(markdown).toMatch(/## Target state \(separate from the exceptions\)/);
    expect(markdown).toMatch(/does not make customer data safe to load/i);
  });

  it("[LP0-16] reductions pass and additions default-deny", async () => {
    const reduction = await control(async c => { await c.query(`REVOKE INSERT ON app.job FROM ${APPLICATION_ROLE}`); await c.query(`REVOKE UPDATE(created_at) ON app.membership FROM ${APPLICATION_ROLE}`); });
    expect(reduction.ok).toBe(true);
    expect(reduction.reductions).toEqual(expect.arrayContaining([
      `acl|rel|table|app.job|${APPLICATION_ROLE}|INSERT|-`, `acl|col|app.membership.created_at|${APPLICATION_ROLE}|UPDATE|-`,
    ]));
    expect(inventory.entries.length, "a reduction never widens or rewrites the reviewed inventory").toBe(rawInventory.entries.length);
    const addition = await control(async c => {
      await c.query("CREATE TABLE app.lp0_ctl_working(id uuid PRIMARY KEY)");
      await c.query("ALTER TABLE app.lp0_ctl_working OWNER TO jobguard_migration");
      await c.query(`GRANT SELECT, INSERT ON app.lp0_ctl_working TO ${APPLICATION_ROLE}`);
    });
    expect(addition.ok).toBe(false);
    expect(addition.diagnostics.filter(d => d.privilege).map(d => `${d.object}:${d.privilege}`).sort()).toEqual(["app.lp0_ctl_working:INSERT", "app.lp0_ctl_working:SELECT"]);
    expect(addition.diagnostics.every(d => d.downstream.startsWith("unclassified"))).toBe(true);
  });

  it("[LP0-18] deliberate controls leave no residual privilege or business effect", async () => {
    // Clean-up runs after an assertion failure inside a control too.
    let failed = false;
    await expect(control(async c => {
      await c.query("CREATE ROLE lp0_ctl_residue NOLOGIN");
      await c.query(`GRANT UPDATE ON app.job TO ${APPLICATION_ROLE}`);
      failed = true;
      throw new Error("assertion failed halfway through a control");
    })).rejects.toThrow(/halfway/);
    expect(failed).toBe(true);
    // A fresh connection (committed state only) reads exactly the baseline, in the expected profile, and finds no leftovers.
    const second = await db.admin.connect();
    try {
      const facts = deriveFacts(await readCatalogue(second));
      expect(factKeys(facts)).toEqual(factKeys(baselineBootstrapLogin));
      expect(compareInventory(inventory, facts).ok).toBe(true);
      const leftovers = await second.query(`SELECT
        (SELECT count(*) FROM pg_roles WHERE rolname LIKE 'lp0\\_ctl\\_%')::int AS roles,
        (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname LIKE 'lp0\\_ctl\\_%')::int AS relations,
        (SELECT count(*) FROM pg_proc WHERE proname LIKE 'lp0\\_ctl\\_%')::int AS routines,
        (SELECT count(*) FROM pg_default_acl)::int AS defaults,
        (SELECT count(*) FROM pg_auth_members m WHERE m.member=(SELECT oid FROM pg_roles WHERE rolname='${APPLICATION_ROLE}'))::int AS memberships,
        (SELECT count(*) FROM control_plane.tenant)::int AS tenants,
        (SELECT count(*) FROM app.account)::int AS accounts,
        (SELECT count(*) FROM app.job)::int AS jobs,
        (SELECT rolcanlogin FROM pg_roles WHERE rolname='${APPLICATION_ROLE}') AS login`);
      expect(leftovers.rows[0]).toEqual({ roles: 0, relations: 0, routines: 0, defaults: 0, memberships: 0, tenants: 0, accounts: 0, jobs: 0, login: true });
    } finally { second.release(); }
    // The reviewed file on disk is untouched by any of the above.
    expect(parseInventory(JSON.parse(await readFile(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8"))).entries.length).toBe(inventory.entries.length);
  });
});

