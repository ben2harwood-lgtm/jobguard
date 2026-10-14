/**
 * LP-0 comparator contract. These small, explicit fixtures specify how the grant-freeze comparator behaves. They do NOT prove
 * PostgreSQL's permission semantics: lp-0-grant-freeze.integration.test.ts and lp-0-authority-paths.integration.test.ts do that
 * against a real, fully migrated PostgreSQL 16.
 *
 * Held (Q2, LP0-13): comparator fixtures for same-signature routine/helper/RLS protection changes with unchanged ACLs are NOT here.
 */
import { describe, expect, it } from "vitest";
import {
  type AclEntry, type Catalogue, type Inventory, type RelationRow, type RoutineRow, type RoleRow,
  compareInventory, deriveFacts, dispositions, existingExceptionKeys, explainRoutes, finalAllowedKeys, keys, parseInventory, pathCompleteness,
  routineIdentity, staticScan, InventoryError,
} from "./lp-0-catalog.js";

const RT = "jobguard_runtime";
const OWNER = "jobguard_migration";
const acl = (grantee: string, privilege: string, grantable = false): AclEntry => ({ grantee, privilege, grantable });
const ownerAll = (privs = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) => privs.map(p => acl(OWNER, p));
const role = (name: string, over: Partial<RoleRow> = {}): RoleRow => ({ name, super: false, inherit: false, createrole: false, createdb: false, login: false, replication: false, bypassrls: false, connlimit: -1, settings: [], ...over });

function table(name: string, grants: AclEntry[], over: Partial<RelationRow> = {}): RelationRow {
  return { schema: "app", name, kind: "table", owner: OWNER, explicitAcl: true, acl: [...ownerAll(), ...grants], columns: [], options: [], rlsEnabled: true, rlsForced: true, definitionDigest: null, dependsOn: [], ...over };
}
function routine(name: string, args: string, grants: AclEntry[], over: Partial<RoutineRow> = {}): RoutineRow {
  return { schema: "app", name, kind: "function", args, owner: OWNER, securityDefiner: true, config: ["search_path=pg_catalog, app"], explicitAcl: true, acl: [acl(OWNER, "EXECUTE"), ...grants], returnsTrigger: false, extension: null, definitionDigest: "d".repeat(64), source: "", ...over };
}
function base(over: Partial<Catalogue> = {}): Catalogue {
  return {
    server: "PostgreSQL 16.10", database: "jobguard_synthetic_demo", subject: RT,
    roles: [role(RT), role(OWNER), role("postgres", { super: true, login: true, inherit: true })],
    memberships: [], reach: [],
    schemas: [{ name: "app", owner: OWNER, acl: [acl(OWNER, "USAGE"), acl(OWNER, "CREATE"), acl(RT, "USAGE")] }],
    relations: [
      table("job", [acl(RT, "SELECT"), acl(RT, "INSERT")]),
      table("membership", [acl(RT, "SELECT"), acl(RT, "INSERT"), acl(RT, "UPDATE"), acl(RT, "DELETE")]),
      table("ledger", [acl(RT, "SELECT")]),
    ],
    routines: [routine("transition_job", "uuid,integer", [acl(RT, "EXECUTE")]), routine("transition_job", "uuid,integer,text", [acl(RT, "EXECUTE")])],
    databases: [{ name: "jobguard_synthetic_demo", owner: "postgres", acl: [acl("postgres", "CONNECT"), acl("postgres", "CREATE"), acl("postgres", "TEMPORARY"), acl("PUBLIC", "CONNECT"), acl("PUBLIC", "TEMPORARY")] }],
    languages: [], defaults: [], effective: [], systemRoutines: [], policies: [], triggers: [], ownedCounts: { [OWNER]: 3 },
    ...over,
  };
}

/** A valid reviewed inventory covering exactly `cat`'s capabilities: authority writes as exceptions, everything else approved. */
function reviewed(cat: Catalogue, over: Partial<Inventory> = {}): Inventory {
  const facts = deriveFacts(cat);
  const exceptionTables = new Set(["app.membership"]);
  const entries = facts.map(f => ({ key: f.key, group: exceptionTables.has(f.object) && f.privilege !== "SELECT" ? "membership-writes" : "baseline" }));
  return parseInventory({
    format: "lp-0-effective-privileges", version: 1,
    base: { landingBase: "abcdef0", postgres: "16.10", migrationCount: 3, lastMigration: "0150_x.sql", subject: RT, profiles: ["migration-only NOLOGIN"], generatedBy: "unit fixture" },
    groups: [
      { id: "baseline", title: "Reviewed baseline", kind: "read_access", status: "approved_current", target: { state: "retain", note: "kept as reviewed" }, cards: [], responsibilities: {}, downstream: "reads and routine entry points reviewed one by one", sources: [], tests: [], gaps: [] },
      { id: "membership-writes", title: "Membership direct writes", kind: "membership", status: "existing_exception", target: { state: "revoke", note: "closed by LP-1" }, cards: ["LP-1"], responsibilities: {}, downstream: "direct membership forging", path: "ap-membership", sources: ["a.sql:1"], tests: ["t.test.ts"], gaps: [] },
    ],
    entries,
    authorityPaths: [{ id: "ap-membership", title: "Membership", description: "direct writes to membership rows", cards: ["LP-1"], responsibilities: {}, sources: ["a.sql:1"], tests: ["t.test.ts"], gaps: [] }],
    targetState: [{ id: "ts-membership", statement: "The application login holds no INSERT, UPDATE or DELETE on membership.", groups: ["membership-writes"], cards: ["LP-1"] }],
    recorded: { note: "recorded, not compared (Q2 hold)", routines: [], rls: [], policies: [], triggers: [] },
    held: [{ id: "LP0-13", reason: "same-signature routine and RLS change detection awaits the Q2 ruling" }],
    gaps: [],
    ...over,
  });
}
const failures = (inv: Inventory, cat: Catalogue) => compareInventory(inv, deriveFacts(cat));

describe("[LP0-02] strict reviewed inventory is required", () => {
  const cat = base();
  it("refuses a missing, malformed, wrong-version or unknown-field inventory", () => {
    expect(() => parseInventory(undefined)).toThrow(InventoryError);
    expect(() => parseInventory(null)).toThrow(/missing/);
    expect(() => parseInventory({})).toThrow(InventoryError);
    const good = JSON.parse(JSON.stringify(reviewed(cat)));
    expect(() => parseInventory({ ...good, version: 2 })).toThrow(/version/);
    expect(() => parseInventory({ ...good, format: "other" })).toThrow(InventoryError);
    expect(() => parseInventory({ ...good, surprise: true })).toThrow(InventoryError);
    expect(() => parseInventory({ ...good, groups: [{ ...good.groups[0], surprise: 1 }, good.groups[1]] })).toThrow(InventoryError);
  });
  it("refuses duplicate keys and dangling group references", () => {
    const good = JSON.parse(JSON.stringify(reviewed(cat)));
    expect(() => parseInventory({ ...good, entries: [...good.entries, good.entries[0]] })).toThrow(/duplicate entry key/);
    expect(() => parseInventory({ ...good, entries: [...good.entries, { key: "acl|rel|table|app.x|a|SELECT|-", group: "nope" }] })).toThrow(/unknown group nope/);
    expect(() => parseInventory({ ...good, groups: [...good.groups, good.groups[0]] })).toThrow(/duplicate group id/);
  });
  it("matches the unchanged base, and fails an unknown capability even when it looks harmless", () => {
    const inv = reviewed(cat);
    expect(failures(inv, cat).ok).toBe(true);
    const grown = base({ relations: [...cat.relations, table("brand_new", [acl(RT, "SELECT")])] });
    const r = failures(inv, grown);
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0]).toMatchObject({ code: "TABLE_GRANT_ADDED", object: "app.brand_new", privilege: "SELECT", grantee: RT, disposition: "unreviewed_addition" });
  });
  it("never takes expected permissions from the live catalogue: an empty inventory fails everything live", () => {
    const empty = parseInventory({ ...JSON.parse(JSON.stringify(reviewed(cat))), entries: [] });
    const r = failures(empty, cat);
    expect(r.ok).toBe(false);
    expect(r.diagnostics.length).toBe(deriveFacts(cat).length);
  });
});

describe("object identities and facts", () => {
  it("are stable text keys independent of OIDs and of catalogue row order", () => {
    const cat = base();
    const shuffled = base({ relations: [...cat.relations].reverse(), routines: [...cat.routines].reverse() });
    expect(deriveFacts(shuffled).map(f => f.key)).toEqual(deriveFacts(cat).map(f => f.key));
    for (const f of deriveFacts(cat)) expect(f.key).not.toMatch(/\b\d{5,}\b/);
  });
  it("[LP0-03] keeps table and column ACLs as separate facts, with grant options", () => {
    const withCol = base({ relations: [table("job", [acl(RT, "SELECT"), acl(RT, "INSERT")], { columns: [{ column: "status", acl: [acl(RT, "UPDATE")] }] }), ...base().relations.slice(1)] });
    const facts = deriveFacts(withCol).map(f => f.key);
    expect(facts).toContain("acl|rel|table|app.job|jobguard_runtime|INSERT|-");
    expect(facts).toContain("acl|col|app.job.status|jobguard_runtime|UPDATE|-");
    const inv = reviewed(base());
    const r = failures(inv, withCol);
    expect(r.diagnostics.map(d => d.code)).toEqual(["COLUMN_GRANT_ADDED"]);
    expect(r.diagnostics[0]).toMatchObject({ object: "app.job", column: "status", privilege: "UPDATE" });
    const opt = base({ relations: [table("job", [acl(RT, "SELECT"), acl(RT, "INSERT"), acl(RT, "UPDATE", true)]), ...base().relations.slice(1)] });
    expect(failures(inv, opt).diagnostics.map(d => d.code)).toContain("GRANT_OPTION_ADDED");
  });
  it("[LP0-04] a PUBLIC grant is its own fact and fails even where the runtime login already holds the operation", () => {
    const inv = reviewed(base());
    const pub = base({ relations: [table("job", [acl(RT, "SELECT"), acl(RT, "INSERT"), acl("PUBLIC", "INSERT")]), ...base().relations.slice(1)] });
    const r = failures(inv, pub);
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0]).toMatchObject({ code: "PUBLIC_GRANT_ADDED", grantee: "PUBLIC", privilege: "INSERT", object: "app.job" });
  });
  it("[LP0-05] a grant to a role that does not start with jobguard_ fails, inherited or not", () => {
    const inv = reviewed(base());
    const ext = base({
      roles: [...base().roles, role("vendor_helper")], relations: [table("job", [acl(RT, "SELECT"), acl(RT, "INSERT"), acl("vendor_helper", "UPDATE")]), ...base().relations.slice(1)],
      memberships: [{ role: "vendor_helper", member: RT, admin: false, inherit: true, set: false }], reach: [{ from: RT, to: "vendor_helper", inherit: true, set: false }],
      effective: [{ subject: RT, cls: "rel", object: "app.job", privilege: "UPDATE" }],
    });
    const codes = failures(inv, ext).diagnostics.map(d => d.code).sort();
    expect(codes).toEqual(["EFFECTIVE_PRIVILEGE_ADDED", "MEMBERSHIP_CHANGED", "ROLE_ATTRIBUTE_CHANGED", "ROLE_PATH_ADDED", "TABLE_GRANT_ADDED"]);
    expect(failures(inv, ext).diagnostics.find(d => d.code === "EFFECTIVE_PRIVILEGE_ADDED")?.route).toBe("inherit:vendor_helper");
  });
  it("[LP0-05] transitive inheritance is explained through the chain and a changed membership flag is a different fact", () => {
    const cat = base({
      reach: [{ from: RT, to: "mid", inherit: true, set: false }, { from: RT, to: "top", inherit: true, set: false }],
      roles: [...base().roles, role("mid"), role("top")],
    });
    const holder = { owner: OWNER, acl: [acl("top", "UPDATE")] };
    expect(explainRoutes(cat, RT, holder, "UPDATE")).toEqual(["inherit:top"]);
    expect(explainRoutes(cat, RT, { owner: "top", acl: [] }, "UPDATE")).toEqual(["inherit-owner:top"]);
    expect(explainRoutes(cat, RT, { owner: OWNER, acl: [] }, "UPDATE")).toEqual(["unexplained"]);
    const f = (inherit: boolean, set: boolean) => keys.member({ role: "mid", member: RT, admin: false, inherit, set });
    expect(new Set([f(false, false), f(true, false), f(false, true), f(true, true), keys.member({ role: "mid", member: RT, admin: true, inherit: false, set: false })]).size).toBe(5);
  });
  it("[LP0-06] a SET-only path is reported even though automatic inheritance is off", () => {
    const inv = reviewed(base());
    const set = base({ reach: [{ from: RT, to: OWNER, inherit: false, set: true }], memberships: [{ role: OWNER, member: RT, admin: false, inherit: false, set: true }] });
    const r = failures(inv, set);
    expect(r.diagnostics.map(d => d.code).sort()).toEqual(["MEMBERSHIP_CHANGED", "ROLE_SET_PATH_ADDED"]);
    expect(r.diagnostics.find(d => d.code === "ROLE_SET_PATH_ADDED")).toMatchObject({ grantee: RT, object: OWNER, route: "set" });
  });
  it("[LP0-07] ownership and every role attribute are separate facts; LOGIN is recorded per profile", () => {
    const inv = reviewed(base());
    const owned = base({ relations: [table("ledger", [acl(RT, "SELECT")], { owner: RT }), ...base().relations.slice(0, 2)] });
    expect(failures(inv, owned).diagnostics.map(d => d.code)).toContain("OWNER_CHANGED");
    for (const attr of ["super", "createrole", "createdb", "replication", "bypassrls", "inherit"] as const) {
      const cat = base({ roles: [role(RT, { [attr]: true }), role(OWNER), base().roles[2]!] });
      const r = failures(inv, cat);
      expect(r.diagnostics.map(d => d.code), attr).toEqual(["ROLE_ATTRIBUTE_CHANGED"]);
    }
    const login = base({ roles: [role(RT, { login: true }), role(OWNER), base().roles[2]!] });
    expect(failures(inv, login).diagnostics.map(d => d.code)).toEqual(["ROLE_ATTRIBUTE_CHANGED"]);
    expect(keys.role(role(RT, { login: true }))).toContain("login=t");
    expect(keys.role(role(RT))).toContain("login=f");
    const set = base({ roles: [role(RT, { settings: ["row_security=off"] }), role(OWNER), base().roles[2]!] });
    expect(failures(inv, set).diagnostics.map(d => d.code)).toEqual(["ROLE_ATTRIBUTE_CHANGED"]);
  });
  it("[LP0-08] schema CREATE, database CREATE, TRUNCATE, TRIGGER and REFERENCES are inventoried with specific codes", () => {
    const inv = reviewed(base());
    const cat = base({
      schemas: [{ name: "app", owner: OWNER, acl: [acl(OWNER, "USAGE"), acl(OWNER, "CREATE"), acl(RT, "USAGE"), acl(RT, "CREATE")] }],
      databases: [{ name: "jobguard_synthetic_demo", owner: "postgres", acl: [...base().databases[0]!.acl, acl(RT, "CREATE")] }],
      relations: [table("job", [acl(RT, "SELECT"), acl(RT, "INSERT"), acl(RT, "TRUNCATE"), acl(RT, "TRIGGER"), acl(RT, "REFERENCES")]), ...base().relations.slice(1)],
    });
    const codes = failures(inv, cat).diagnostics.map(d => d.code).sort();
    expect(codes).toEqual(["DATABASE_PRIVILEGE_ADDED", "DESTRUCTIVE_PRIVILEGE_ADDED", "DESTRUCTIVE_PRIVILEGE_ADDED", "DESTRUCTIVE_PRIVILEGE_ADDED", "SCHEMA_PRIVILEGE_ADDED"]);
  });
  it("[LP0-09] sequences are their own class with SELECT, USAGE and UPDATE", () => {
    const inv = reviewed(base());
    const seq: RelationRow = { ...table("invoice_seq", [acl(RT, "USAGE")]), kind: "sequence" };
    const r = failures(inv, base({ relations: [...base().relations, seq] }));
    expect(r.diagnostics.map(d => d.code).sort()).toEqual(["OWNER_CHANGED", "SEQUENCE_GRANT_ADDED"]);
    expect(r.diagnostics.find(d => d.code === "SEQUENCE_GRANT_ADDED")!.key).toBe("acl|rel|sequence|app.invoice_seq|jobguard_runtime|USAGE|-");
  });
  it("[LP0-10] a view cannot hide a new route: its definition, options and dependencies are facts", () => {
    const view: RelationRow = { ...table("v_job", [acl(RT, "SELECT")]), kind: "view", options: ["security_invoker=true"], definitionDigest: "a".repeat(64), dependsOn: ["app.job"] };
    const cat = base({ relations: [...base().relations, view] });
    const inv = reviewed(cat);
    expect(failures(inv, cat).ok).toBe(true);
    const changed = base({ relations: [...base().relations, { ...view, definitionDigest: "b".repeat(64) }] });
    expect(failures(inv, changed).diagnostics.map(d => d.code)).toEqual(["VIEW_CHANGED"]);
    const optionless = base({ relations: [...base().relations, { ...view, options: [] }] });
    expect(failures(inv, optionless).diagnostics.map(d => d.code)).toEqual(["VIEW_CHANGED"]);
    const wider = base({ relations: [...base().relations, { ...view, dependsOn: ["app.job", "app.membership"] }] });
    expect(failures(inv, wider).diagnostics.map(d => d.code)).toEqual(["VIEW_CHANGED"]);
  });
  it("[LP0-11] each overload is a separate identity; a new overload or a PUBLIC-default executable function fails", () => {
    const cat = base();
    expect(new Set(cat.routines.map(routineIdentity)).size).toBe(2);
    const inv = reviewed(cat);
    const overload = base({ routines: [...cat.routines, routine("transition_job", "uuid,integer,text,text", [acl(RT, "EXECUTE")])] });
    const r = failures(inv, overload);
    expect(r.diagnostics.map(d => d.code).sort()).toEqual(["ROUTINE_EXPOSED", "OWNER_CHANGED"].sort());
    expect(r.diagnostics.find(d => d.code === "ROUTINE_EXPOSED")?.object).toBe("function:app.transition_job(uuid,integer,text,text)");
    const publicDefault = base({ routines: [...cat.routines, routine("helper_fn", "", [acl("PUBLIC", "EXECUTE")], { securityDefiner: false })] });
    expect(failures(inv, publicDefault).diagnostics.map(d => d.code)).toContain("PUBLIC_GRANT_ADDED");
    const helperOnly = base({ routines: [...cat.routines, routine("new_helper", "uuid", [acl("jobguard_identity", "EXECUTE")])] });
    expect(failures(inv, helperOnly).ok).toBe(false);
  });
  it("[LP0-12] a routine owned by someone else and reachable by the runtime login is flagged by owner and by execute", () => {
    const wrapper = routine("grant_myself_money", "uuid", [acl(RT, "EXECUTE")]);
    const r = failures(reviewed(base()), base({ routines: [...base().routines, wrapper] }));
    expect(r.diagnostics.map(d => d.code).sort()).toEqual(["OWNER_CHANGED", "ROUTINE_EXPOSED"]);
  });
  it("[LP0-14] explicit creator defaults and PostgreSQL built-in defaults are different facts", () => {
    const cat = base();
    const builtins = deriveFacts(cat).filter(f => f.category === "default").map(f => f.key);
    expect(builtins).toContain("default|builtin|function|PUBLIC|EXECUTE|-");
    expect(builtins).toContain("default|builtin|database|PUBLIC|CONNECT|-");
    const inv = reviewed(cat);
    const dangerous = base({ defaults: [{ creator: OWNER, schema: "app", objectType: "table", acl: [acl(OWNER, "SELECT"), acl(RT, "INSERT")] }] });
    const r = failures(inv, dangerous);
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0]).toMatchObject({ code: "DEFAULT_PRIVILEGE_ADDED", privilege: "INSERT", grantee: RT, route: "future-objects", object: `${OWNER}/app` });
    expect(r.diagnostics[0]!.key.startsWith("default|explicit|")).toBe(true);
  });
  it("records system routines the login can execute (dangerous ones are named, managed ones are listed)", () => {
    const sys = base({ systemRoutines: [{ identity: "dangerous:pg_catalog.pg_read_file(text)", explicitAcl: true, runtimeCanExecute: true }] });
    expect(failures(reviewed(base()), sys).diagnostics.map(d => d.code)).toEqual(["SYSTEM_ROUTINE_EXPOSED"]);
  });
});

describe("[LP0-15] exceptions cannot become target authority", () => {
  const cat = base();
  it("keeps current exceptions and the final allowed state separate", () => {
    const inv = reviewed(cat);
    const exceptions = existingExceptionKeys(inv);
    const finalState = finalAllowedKeys(inv);
    expect(exceptions.has("acl|rel|table|app.membership|jobguard_runtime|INSERT|-")).toBe(true);
    for (const k of exceptions) expect(finalState.has(k)).toBe(false);
    expect(finalState.has("acl|rel|table|app.membership|jobguard_runtime|SELECT|-")).toBe(true);
    const rows = dispositions(inv, deriveFacts(cat));
    expect(rows.find(r => r.key.endsWith("membership|jobguard_runtime|DELETE|-"))).toMatchObject({ disposition: "existing_exception", cards: ["LP-1"], target: "revoke" });
  });
  it("refuses an exception whose target is to keep it, one without a closing card, or approved state that withdraws", () => {
    const good = JSON.parse(JSON.stringify(reviewed(cat)));
    const swap = (patch: Record<string, unknown>) => ({ ...good, groups: [good.groups[0], { ...good.groups[1], ...patch }] });
    expect(() => parseInventory(swap({ target: { state: "retain", note: "pretend final state" } }))).toThrow(/cannot be its own target state/);
    expect(() => parseInventory(swap({ cards: [], path: "ap-membership" }))).toThrow(/closing LP card/);
    const approved = { ...good, groups: [{ ...good.groups[0], target: { state: "revoke", note: "withdraw later" }, cards: ["LP-1"] }, good.groups[1]] };
    expect(() => parseInventory(approved)).toThrow(/approved_current cannot carry a withdrawal target/);
  });
  it("requires a distinct responsibility per card when several cards share a group, and a path for authority kinds", () => {
    const good = JSON.parse(JSON.stringify(reviewed(cat)));
    const two = { ...good, groups: [good.groups[0], { ...good.groups[1], cards: ["LP-1", "LP-5c"], responsibilities: { "LP-1": "closes the writes" } }] };
    expect(() => parseInventory(two)).toThrow(/card LP-5c has no distinct responsibility/);
    const noPath = { ...good, groups: [good.groups[0], { ...good.groups[1], path: undefined }] };
    expect(() => parseInventory(noPath)).toThrow(/no known authority path/);
    const noTest = { ...good, groups: [good.groups[0], { ...good.groups[1], tests: [] }] };
    expect(() => parseInventory(noTest)).toThrow(/no behavioural test reference/);
  });
});

describe("[LP0-16] reductions pass and additions default-deny", () => {
  it("accepts a privilege reduction without widening the inventory, and reports it", () => {
    const cat = base();
    const inv = reviewed(cat);
    const reduced = base({ relations: [table("job", [acl(RT, "SELECT")]), ...cat.relations.slice(1)] });
    const r = failures(inv, reduced);
    expect(r.ok).toBe(true);
    expect(r.reductions).toEqual(["acl|rel|table|app.job|jobguard_runtime|INSERT|-"]);
    expect(inv.entries.length).toBe(deriveFacts(cat).length);
  });
  it("does not accept an apparently ordinary working-data addition without reviewed classification", () => {
    const cat = base();
    const inv = reviewed(cat);
    const addition = base({ relations: [...cat.relations, table("site_note", [acl(RT, "SELECT"), acl(RT, "INSERT")])] });
    const r = failures(inv, addition);
    expect(r.ok).toBe(false);
    expect(r.diagnostics.filter(d => d.privilege).map(d => `${d.object}:${d.privilege}`).sort()).toEqual(["app.site_note:INSERT", "app.site_note:SELECT"]);
    expect(r.diagnostics.every(d => d.disposition === "unreviewed_addition" && d.cards.length === 0)).toBe(true);
  });
});

describe("recorded routine facts and static scan", () => {
  it("static scan finds written tables and called routines as hypotheses, ignoring comments and unknown names", () => {
    const known = new Set(["app.helper", "app.other"]);
    const rels = new Set(["app.membership", "app.audit_event"]);
    const scan = staticScan(`BEGIN -- INSERT INTO app.audit_event
      UPDATE app.membership SET x=1; INSERT INTO app.nowhere(a) VALUES(1); PERFORM app.helper(1); SELECT pg_sleep(1); END`, known, rels);
    expect(scan).toEqual({ staticWrites: ["app.membership"], staticCalls: ["app.helper"] });
  });
  it("path completeness requires files to exist and every path to be used", () => {
    const cat = base();
    const inv = reviewed(cat);
    const problems = pathCompleteness(inv, () => false);
    expect(problems.some(p => p.includes("test file not found: t.test.ts"))).toBe(true);
    expect(pathCompleteness(inv, () => true)).toEqual([]);
  });
});
