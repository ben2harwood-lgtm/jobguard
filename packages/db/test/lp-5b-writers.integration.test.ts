import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// Source evidence only. This suite opens no database and cannot prove runtime
// permission, committed completion, current access or LP-5c readiness.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const tables = ["command_receipt", "decision_resolution", "action_authorization"] as const;
const disposition = z.object({
  path: z.string().min(1),
  kind: z.enum(["runtime_direct", "controlled", "read", "delegated", "owner_setup", "test_fixture"]),
  owner: z.string().min(1),
  note: z.string().min(1),
}).strict();
const inventorySchema = z.object({
  version: z.literal("lp-5b-writers.v1"),
  status: z.literal("source-inspected-only"),
  sources: z.array(disposition).min(1),
}).strict();

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|mjs)$/u.test(path) ? [path] : [];
  });
}
function mentions(source: string): boolean {
  // Includes comments as review leads, plus ordinary split SQL literals. Dynamic
  // construction and delegated calls still require the manual call-chain trace.
  const compact = source.replace(/[\s'"`+]/gu, "").toLowerCase();
  return tables.some(table => compact.includes(table));
}
function writes(source: string): boolean {
  const compact = source.replace(/[\s'"`+]/gu, "").toLowerCase();
  return tables.some(table => ["insertinto", "update", "deletefrom"].some(verb =>
    compact.includes(`${verb}app.${table}`) || compact.includes(`${verb}${table}`)));
}
function missing(paths: string[], entries: Array<{ path: string }>): string[] {
  const covered = new Set(entries.map(entry => entry.path));
  return paths.filter(path => !covered.has(path)).sort();
}
function inventory() {
  const text = readFileSync(resolve(root, "docs/contracts/lp-5b-command-writers-v1.md"), "utf8");
  const block = /```json\n([\s\S]*?)\n```/u.exec(text);
  if (!block) throw new Error("LP-5B inventory JSON is missing");
  return inventorySchema.parse(JSON.parse(block[1]!));
}

describe("LP-5B source inventory (not PostgreSQL integration evidence)", () => {
  it("5B-01 — every discovered lifecycle reference has a current disposition", () => {
    const entries = inventory().sources;
    const files = ["packages/db/src", "packages/db/tools"].flatMap(path => sourceFiles(resolve(root, path)));
    const found = files.filter(path => mentions(readFileSync(path, "utf8"))).map(path => relative(root, path));
    expect(found.length).toBeGreaterThan(0);
    expect(missing(found, entries)).toEqual([]);
    expect(new Set(entries.map(entry => entry.path)).size).toBe(entries.length);
    for (const entry of entries) expect(readFileSync(resolve(root, entry.path), "utf8").length).toBeGreaterThan(0);
  });

  it("5B-01 — source-discovered direct writers are recorded as still direct", () => {
    const entries = inventory().sources;
    const files = ["packages/db/src", "packages/db/tools"].flatMap(path => sourceFiles(resolve(root, path)));
    for (const file of files.filter(path => writes(readFileSync(path, "utf8")))) {
      const entry = entries.find(item => item.path === relative(root, file));
      expect(entry, relative(root, file)).toBeDefined();
      expect(["runtime_direct", "owner_setup", "test_fixture"], relative(root, file)).toContain(entry!.kind);
    }
  });

  it("5B-01 — a later source omission is reported without an original-nine cutoff", () => {
    expect(missing(["later-writer.ts", "known-reader.ts"], [{ path: "known-reader.ts" }])).toEqual(["later-writer.ts"]);
  });

  it("5B-01 — discovery includes split and quoted SQL references", () => {
    const examples = [
      'db.query("INSERT INTO app." + "command_receipt VALUES (...)" )',
      'db.query(`UPDATE app."action_authorization" SET revoked_at=now()`)',
      'db.query("DELETE FROM app." + "decision_resolution WHERE id=$1")',
    ];
    for (const source of examples) {
      expect(mentions(source)).toBe(true);
      expect(writes(source)).toBe(true);
    }
    expect(mentions("SELECT * FROM app.unrelated")).toBe(false);
    expect(writes("SELECT * FROM app.command_receipt")).toBe(false);
  });

  it("5B-01 — inventory refuses unknown dispositions and unsupported versions", () => {
    const valid = { version: "lp-5b-writers.v1", status: "source-inspected-only", sources: [
      { path: "example.ts", kind: "runtime_direct", owner: "LP-5b", note: "Unconverted" },
    ] };
    expect(inventorySchema.safeParse(valid).success).toBe(true);
    expect(inventorySchema.safeParse({ ...valid, version: "future" }).success).toBe(false);
    expect(inventorySchema.safeParse({ ...valid, sources: [{ ...valid.sources[0], kind: "secured" }] }).success).toBe(false);
  });
});
