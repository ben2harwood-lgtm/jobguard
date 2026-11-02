import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { applyTenancyProofs, applyUpgradeProofs, combineLp0, loadMigrationProofs, proofSchema, proofSourceDigests, type MigrationProof, type MigrationProofSnapshot } from "./migration-proof-loader.js";
import { compareInventory, loadReviewedInventory, parseInventory } from "./lp-0-catalog.js";

const baseline = () => parseInventory(JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8")));
const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const empty = (migration = "0002_fiction.sql"): MigrationProof => ({ migration, lp0: [], upgrade: [], tenancy: [] });
function fixture(migrations = ["0001_legacy.sql", "0002_fiction.sql"]) {
  const dir = mkdtempSync(join(tmpdir(), "jg-proof-unit-")); directories.push(dir);
  const put = (file: string, value: unknown) => writeFileSync(join(dir, file), JSON.stringify(value));
  put("legacy-migrations.json", ["0001_legacy.sql"]);
  const save = (p: MigrationProof) => put(p.migration.replace(/\.sql$/, ".proof.json"), p);
  save(empty());
  return { dir, put, save, load: () => loadMigrationProofs(dir, migrations) };
}
const relation = { nspname: "app", relname: "fiction", relowner: "jobguard_migration", relacl: "{jobguard_migration=arwdDxt/jobguard_migration}", relrowsecurity: true, relforcerowsecurity: true };
const routine = { nspname: "app", proname: "fiction", args: "t uuid", proowner: "jobguard_migration", proacl: "{jobguard_migration=X/jobguard_migration}", prosecdef: true, proconfig: ["search_path=pg_catalog"] };
const policy = { schemaname: "app", tablename: "fiction", policyname: "tenant_isolation", permissive: "PERMISSIVE" as const, roles: "{jobguard_migration}", cmd: "ALL" as const, qual: "(tenant_id = app.current_tenant_id())", with_check: "(tenant_id = app.current_tenant_id())" };
const posture = { relrowsecurity: true, relforcerowsecurity: true, guarded: true, owner: "jobguard_migration" };
const snapshot = (): MigrationProofSnapshot => ({ rows: { "app.history": [{ id: 1, value: "unchanged" }] }, routines: [], relations: [], policies: [] });
const oids = { jobguard_migration: 42 };
function populated(): MigrationProof {
  return { ...empty(), upgrade: [
    { section: "rows", before: null, after: { table: "app.fiction", data: [] } },
    { section: "relations", before: null, after: relation },
    { section: "relations", before: null, after: { ...relation, relname: "fiction_pkey", relrowsecurity: false, relforcerowsecurity: false, relacl: null } },
    { section: "routines", before: null, after: routine },
    { section: "policies", before: null, after: policy },
  ], tenancy: [{ relname: "fiction", before: null, after: posture }] };
}

describe("strict migration proof discovery", () => {
  it("zero fragments preserves the committed baseline exactly, including held LP0-13 and LP0-22", async () => {
    const f = fixture();
    f.put("legacy-migrations.json", ["0001_legacy.sql", "0002_fiction.sql"]);
    rmSync(join(f.dir, "0002_fiction.proof.json"));
    expect(f.load().proofs).toEqual([]);
    expect((await loadReviewedInventory()).inventory).toEqual(parseInventory(combineLp0(baseline(), loadMigrationProofs().proofs)));
    expect(combineLp0(baseline(), [])).toEqual(baseline());
    expect(applyUpgradeProofs(snapshot(), [], {})).toEqual(snapshot());
    expect(applyTenancyProofs([{ relname: "history", ...posture }], [], "owner")).toEqual([{ relname: "history", ...posture }]);
    expect(baseline().held.map(h => h.id)).toEqual(expect.arrayContaining(["LP0-13", "LP0-22"]));
  });
  it("combines two independent files in migration order, even at an unused low number", () => {
    const f = fixture(["0001_legacy.sql", "0000_low.sql", "0002_fiction.sql"]);
    const a = empty("0000_low.sql"), b = populated();
    a.lp0 = [{ section: "entries", before: null, after: { key: "acl|rel|table|app.low|jobguard_runtime|SELECT|-", group: baseline().groups[0]!.id } }];
    a.tenancy = [{ relname: "low", before: null, after: posture }];
    a.upgrade = [{ section: "rows", before: null, after: { table: "app.low", data: [] } }];
    f.save(b); f.save(a);
    const { proofs } = f.load();
    expect(proofs.map(p => p.migration)).toEqual([a.migration, b.migration]);
    expect(parseInventory(combineLp0(baseline(), proofs)).entries).toContainEqual(a.lp0[0]!.after);
    expect(applyUpgradeProofs(snapshot(), proofs, oids).rows).toEqual({ ...snapshot().rows, "app.low": [], "app.fiction": [] });
    expect(applyTenancyProofs([], proofs, "owner")).toEqual([{ relname: "fiction", owner: "jobguard_migration" }, { relname: "low", owner: "jobguard_migration" }]);
    expect(applyTenancyProofs([], proofs, "rls")).toHaveLength(2);
  });
  it.each(["lp0", "upgrade", "tenancy"])("requires the %s section", section => {
    const f = fixture(), p = { ...empty() } as Record<string, unknown>; delete p[section];
    f.put("0002_fiction.proof.json", p); expect(f.load).toThrow();
  });
  it("rejects unknown fields at the root, operation and nested record boundaries", () => {
    const f = fixture();
    for (const value of [{ ...empty(), surprise: [] }, { ...empty(), upgrade: [{ section: "relations", before: null, after: { ...relation, surprise: true } }] },
      { ...empty(), tenancy: [{ relname: "fiction", before: null, after: { ...posture, surprise: true } }] },
      { ...empty(), lp0: [{ section: "entries", before: null, after: { key: "abcde", group: "x", surprise: true } }] }]) {
      f.put("0002_fiction.proof.json", value); expect(f.load).toThrow();
    }
  });
  it("rejects missing, corrupt, orphan, mismatched and duplicate proofs", () => {
    const f = fixture();
    rmSync(join(f.dir, "0002_fiction.proof.json")); expect(f.load).toThrow();
    writeFileSync(join(f.dir, "0002_fiction.proof.json"), "{"); expect(f.load).toThrow();
    f.put("0002_fiction.proof.json", empty("0003_wrong.sql")); expect(f.load).toThrow(/mismatched/);
    f.save(empty()); f.put("0003_orphan.proof.json", empty("0003_orphan.sql")); expect(f.load).toThrow(/orphan/);
    rmSync(join(f.dir, "0003_orphan.proof.json"));
    f.save({ ...populated(), upgrade: [populated().upgrade[0]!, populated().upgrade[0]!] }); expect(f.load).toThrow(/duplicate proof identity/);
  });
  it("rejects a clashing identity across independent fragments", () => {
    const f = fixture(["0001_legacy.sql", "0002_fiction.sql", "0003_other.sql"]);
    f.save(populated()); f.save({ ...populated(), migration: "0003_other.sql" }); expect(f.load).toThrow(/duplicate proof identity/);
  });
  it("accepts only exact sequential before/after transitions across migration proofs", () => {
    const f = fixture(["0001_legacy.sql", "0002_fiction.sql", "0003_other.sql"]);
    const a = populated(), b = empty("0003_other.sql");
    const entry = { key: "acl|routine|fiction", group: baseline().groups[0]!.id };
    a.lp0 = [{ section: "entries", before: null, after: entry }];
    b.lp0 = [{ section: "entries", before: entry, after: null }];
    b.upgrade = [{ section: "routines", before: routine, after: { ...routine, proacl: null } }];
    b.tenancy = [{ relname: "fiction", before: posture, after: { ...posture, guarded: false } }];
    f.save(a); f.save(b);
    const proofs = f.load().proofs;
    expect(combineLp0(baseline(), proofs).entries).not.toContainEqual(entry);
    expect(applyUpgradeProofs(snapshot(), proofs, oids).routines[0]!.proacl).toBeNull();
    expect(applyTenancyProofs([], proofs, "rls")[0]).toMatchObject({ guarded: false });
    for (const section of ["lp0", "upgrade", "tenancy"] as const) {
      const broken = structuredClone(b);
      broken[section][0]!.before = null;
      if (section === "lp0") broken.lp0[0]!.after = entry;
      f.save(broken); expect(f.load).toThrow(/duplicate proof identity/);
    }
    b.upgrade[0]!.before = { ...routine, proacl: "wrong" };
    f.save(b); expect(f.load).toThrow(/duplicate proof identity/);
  });
  it("refuses duplicate or removed legacy names and proofs for legacy migrations", () => {
    const f = fixture();
    f.put("legacy-migrations.json", ["0001_legacy.sql", "0001_legacy.sql"]); expect(f.load).toThrow(/duplicate/);
    f.put("legacy-migrations.json", ["0004_missing.sql"]); expect(f.load).toThrow(/missing legacy/);
    f.put("legacy-migrations.json", ["0001_legacy.sql"]); f.save(empty("0001_legacy.sql")); expect(f.load).toThrow(/orphan/);
    expect(() => loadMigrationProofs(f.dir, ["0001_legacy.sql", "0001_legacy.sql"])).toThrow(/duplicate/);
  });
  it("does not support wildcard identities, empty changes or partial attribute allowances", () => {
    expect(() => proofSchema.parse({ ...empty(), upgrade: [{ section: "relations", before: null, after: { ...relation, relname: "fiction*" } }] })).toThrow();
    expect(() => proofSchema.parse({ ...empty(), upgrade: [{ section: "relations", before: null, after: null }] })).toThrow();
    const { relforcerowsecurity: _removed, ...partial } = relation;
    expect(() => proofSchema.parse({ ...empty(), upgrade: [{ section: "relations", before: null, after: partial }] })).toThrow();
  });
});

describe("exact expectations retain all catalogue and historical attributes", () => {
  it.each(["unlisted table", "unlisted routine", "unlisted index", "unlisted policy", "changed historical row", "RLS disabled", "FORCE RLS removed", "invalid policy", "wrong owner", "changed ACL", "changed definer", "changed config"])("full snapshot equality rejects %s", defect => {
    const expected = applyUpgradeProofs(snapshot(), [populated()], oids);
    const live = structuredClone(expected);
    if (defect === "unlisted table") live.rows["app.unlisted"] = [];
    if (defect === "unlisted routine") live.routines.push({ ...live.routines[0], proname: "unlisted" });
    if (defect === "unlisted index") live.relations.push({ ...live.relations[0], relname: "unlisted_idx" });
    if (defect === "unlisted policy") live.policies.push({ ...live.policies[0], policyname: "unlisted" });
    if (defect === "changed historical row") live.rows["app.history"] = [{ id: 1, value: "rewritten" }];
    if (defect === "RLS disabled") live.relations[0]!.relrowsecurity = false;
    if (defect === "FORCE RLS removed") live.relations[0]!.relforcerowsecurity = false;
    if (defect === "invalid policy") live.policies[0]!.qual = "true";
    if (defect === "wrong owner") live.relations[0]!.relowner = 99;
    if (defect === "changed ACL") live.routines[0]!.proacl = "{PUBLIC=X/jobguard_migration}";
    if (defect === "changed definer") live.routines[0]!.prosecdef = false;
    if (defect === "changed config") live.routines[0]!.proconfig = null;
    expect(isDeepStrictEqual(live, expected)).toBe(false);
  });
  it("requires an exact before/after allowance to modify an existing object", () => {
    const initial = applyUpgradeProofs(snapshot(), [populated()], oids);
    const p = empty();
    p.upgrade = [{ section: "routines", before: routine, after: { ...routine, prosecdef: false } }];
    expect(applyUpgradeProofs(initial, [p], oids).routines[0]!.prosecdef).toBe(false);
    p.upgrade[0]!.before = { ...routine, proacl: null };
    expect(() => applyUpgradeProofs(initial, [p], oids)).toThrow(/before allowance mismatch/);
    expect(() => applyUpgradeProofs(initial, [populated()], oids)).toThrow(/before allowance mismatch/);
    expect(() => applyUpgradeProofs(snapshot(), [populated()], {})).toThrow(/missing owner/);
  });
  it("preserves historical tenancy rows and requires exact prior RLS and owner attributes", () => {
    const p = populated(); p.tenancy[0]!.before = { ...posture, guarded: false };
    expect(() => applyTenancyProofs([{ relname: "fiction", ...posture }], [p], "rls")).toThrow(/before allowance mismatch/);
    p.tenancy[0]!.before = { ...posture, owner: "wrong_owner" };
    expect(() => applyTenancyProofs([{ relname: "fiction", owner: "jobguard_migration" }], [p], "owner")).toThrow(/before allowance mismatch/);
  });
  it("LP-0 additions still default-deny and existing entry changes require an exact before", () => {
    const inv = baseline();
    expect(compareInventory(inv, [{ key: "acl|rel|table|app.unlisted|jobguard_runtime|SELECT|-", category: "acl", objectClass: "table", object: "app.unlisted" }]).ok).toBe(false);
    const p = empty(), entry = inv.entries[0]!;
    p.lp0 = [{ section: "entries", before: { ...entry, group: "wrong" }, after: entry }];
    expect(() => combineLp0(inv, [p])).toThrow(/before allowance mismatch/);
    p.lp0 = [{ section: "entries", before: null, after: entry }];
    expect(() => combineLp0(inv, [p])).toThrow(/before allowance mismatch/);
  });
  it("binds source integrity to the baseline list and every fragment's full bytes", () => {
    const f = fixture(), { sources } = f.load();
    const before = proofSourceDigests(sources);
    f.save({ ...empty(), upgrade: populated().upgrade });
    expect(proofSourceDigests(sources)).not.toEqual(before);
  });
});
