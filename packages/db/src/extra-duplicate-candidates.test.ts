import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extraDuplicateCandidatesV1 } from "./extra-duplicate-candidates.js";
const sql = (name: string) => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8");
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
describe("duplicate candidate read contract", () => {
 it("pins the unchanged database membership and pair predicates instead of allowing drift", () => {
  const previous = sql("0243_contractor_billing").split("CREATE FUNCTION app.cb_unresolved")[1]!.split("AS $$")[1]!.split("$$;")[0]!;
  const added = sql("0830_extra_duplicate_candidates");
  const members = previous.split(" WITH active")[1]!.split(" SELECT EXISTS")[0]!.trim().replaceAll("p_tenant", "t");
  expect(clean(added)).toContain(clean(`WITH RECURSIVE active ${members}`));
  const predicate = previous.split("JOIN members b")[1]!.trim().slice(0, -1);
  expect(clean(added)).toContain(clean(`JOIN members b ${predicate})`));
  expect(added).not.toMatch(/CREATE OR REPLACE|ALTER TABLE|INSERT INTO|DELETE FROM|UPDATE app\./);
 });
 it("accepts only identifiers and existing labels, never prices or authority", () => {
  const id = "40000000-0000-4000-8000-000000000001";
  const body = { version: "extra-duplicate-candidates.v1", jobId: id, revision: 0, activeLinks: [], groups: [{ id, extras: [{ extraId: id, canonicalId: id, description: "Fictional gutter" }] }] };
  expect(extraDuplicateCandidatesV1.safeParse(body).success).toBe(true);
  for (const field of ["netPence", "actor", "tenantId", "origin"]) expect(extraDuplicateCandidatesV1.safeParse({ ...body, [field]: 12 }).success).toBe(false);
  expect(extraDuplicateCandidatesV1.safeParse({ ...body, groups: [{ id, extras: [{ ...body.groups[0]!.extras[0], netPence: 12 }] }] }).success).toBe(false);
 });
});
