/** Tests-first closure assertions; NOT RUN here. Expected red until cutover.
 * No filtered replacement for the protected LP-0 inventory is constructed.
 * Reviewed re-grant controls are STOPPED on its coordinator-owned amendment.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APPLICATION_ROLE, deriveFacts, readCatalogue, startLp0Database, type Catalogue, type Lp0Database } from "./lp-0-catalog.js";

const targets = ["app.command_receipt", "app.decision_resolution", "app.action_authorization"];
const writes = new Set(["INSERT", "UPDATE", "DELETE", "TRUNCATE"]);
let db: Lp0Database;
let cat: Catalogue;
beforeAll(async () => {
  db = await startLp0Database(59900);
  await db.bootstrapRuntimeLogin();
  cat = await readCatalogue(db.admin);
}, 300_000);
afterAll(async () => { await db?.stop(); });

describe("LP-5c catalogue cutover assertions (prerequisites outstanding)", () => {
  it("[LP5C-01] no effective table or column write substitutes on all target columns", async () => {
    const runtime = await db.runtimeClient();
    try {
      expect((await runtime.query("SELECT current_user AS name")).rows[0].name).toBe(APPLICATION_ROLE);
      for (const table of targets) {
        for (const privilege of writes) {
          expect((await runtime.query("SELECT has_table_privilege(current_user,$1,$2) AS allowed", [table, privilege])).rows[0].allowed, `${table} ${privilege}`).toBe(false);
        }
        // readCatalogue.columns contains only explicit column ACLs. Query all
        // live columns as well so implicit/table privileges cannot hide one.
        const columns = (await db.admin.query<{ column: string }>("SELECT attname AS column FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped", [table])).rows;
        expect(columns.length).toBeGreaterThan(0);
        for (const { column } of columns) for (const privilege of ["INSERT", "UPDATE"]) {
          expect((await runtime.query("SELECT has_column_privilege(current_user,$1,$2,$3) AS allowed", [table, column, privilege])).rows[0].allowed, `${table}.${column} ${privilege}`).toBe(false);
        }
      }
    } finally { await runtime.end(); }
  });

  it("[LP5C-04] PUBLIC, inherited and switchable roles cannot restore target writes or ownership", () => {
    const reachable = new Set([APPLICATION_ROLE, "PUBLIC", ...cat.reach.filter(r => r.from === APPLICATION_ROLE && (r.inherit || r.set)).map(r => r.to)]);
    for (const table of targets) {
      const rel = cat.relations.find(r => `${r.schema}.${r.name}` === table)!;
      expect(rel).toBeDefined();
      expect(reachable.has(rel.owner), `${table} owner`).toBe(false);
      expect(rel.rlsEnabled).toBe(true);
      expect(rel.rlsForced).toBe(true);
      const acl = [...rel.acl, ...rel.columns.flatMap(c => c.acl)];
      expect(acl.filter(a => reachable.has(a.grantee) && writes.has(a.privilege)), table).toEqual([]);
    }
    for (const role of cat.roles.filter(r => reachable.has(r.name))) {
      expect(role, role.name).toMatchObject({ super: false, bypassrls: false, createrole: false, createdb: false, replication: false });
    }
    const facts = deriveFacts(cat);
    expect(facts.filter(f => f.category === "eff" && f.privilege && writes.has(f.privilege) && targets.some(t => f.object === t || f.object.startsWith(`${t}.`)))).toEqual([]);
  });

  it("[LP5C-04] target-dependent views expose no writable runtime or role-switch route", async () => {
    // Traverse view dependencies instead of assuming that every view points
    // directly to the table. Trigger/function-mediated effects remain LP-0's
    // broader path review and are not certified by this relation-only proof.
    const relevant = new Set(targets);
    let grew = true;
    while (grew) {
      grew = false;
      for (const rel of cat.relations.filter(r => r.kind === "view")) {
        const name = `${rel.schema}.${rel.name}`;
        if (!relevant.has(name) && rel.dependsOn.some(d => relevant.has(d))) { relevant.add(name); grew = true; }
      }
    }
    const subjects = [APPLICATION_ROLE, ...cat.reach.filter(r => r.from === APPLICATION_ROLE && r.set).map(r => r.to)];
    for (const view of cat.relations.filter(r => r.kind === "view" && relevant.has(`${r.schema}.${r.name}`))) {
      for (const subject of subjects) for (const privilege of ["INSERT", "UPDATE", "DELETE"]) {
        expect((await db.admin.query("SELECT has_table_privilege($1,$2,$3) AS allowed", [subject, `${view.schema}.${view.name}`, privilege])).rows[0].allowed).toBe(false);
        const columns = (await db.admin.query<{ column: string }>("SELECT attname AS column FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped", [`${view.schema}.${view.name}`])).rows;
        for (const { column } of columns) if (privilege !== "DELETE") {
          expect((await db.admin.query("SELECT has_column_privilege($1,$2,$3,$4) AS allowed", [subject, `${view.schema}.${view.name}`, column, privilege])).rows[0].allowed).toBe(false);
        }
      }
    }
  });

  it("[LP5C-04] SELECT remains available with tenant RLS", async () => {
    const runtime = await db.runtimeClient();
    try {
      for (const table of targets) {
        expect((await runtime.query("SELECT has_table_privilege(current_user,$1,'SELECT') AS allowed", [table])).rows[0].allowed).toBe(true);
        // No caller-selected tenant is installed. These are not session-binding proofs.
        expect((await runtime.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
      }
    } finally { await runtime.end(); }
  });
});
