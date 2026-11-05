import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extraDuplicateCandidatesV1, duplicateDispositionV1 } from "./extra-duplicate-candidates.js";
const sql = (name: string) => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8");
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
describe("duplicate candidate read contract", () => {
 it("pins the unchanged database membership and pair predicates instead of allowing drift", () => {
  const previous = sql("0243_contractor_billing").split("CREATE FUNCTION app.cb_unresolved")[1]!.split("AS $$")[1]!.split("$$;")[0]!;
  const added = sql("0590_extra_duplicate_candidates");
  const members = previous.split(" WITH active")[1]!.split(" SELECT EXISTS")[0]!.trim().replaceAll("p_tenant", "t");
  expect(clean(added)).toContain(clean(`WITH RECURSIVE active ${members}`));
  const predicate = previous.split("JOIN members b")[1]!.trim().slice(0, -1);
  expect(clean(added)).toContain(clean(`JOIN members b ${predicate})`));
  expect(added).not.toMatch(/CREATE OR REPLACE|ALTER TABLE|INSERT INTO|DELETE FROM|UPDATE app\./);
 });
 it("accepts only identifiers and existing labels, never prices or authority", () => {
  const id = "40000000-0000-4000-8000-000000000001";
  const body = { version: "extra-duplicate-candidates.v1", jobId: id, revision: 0, activeLinks: [], groups: [{ id, fingerprint: "a".repeat(64), extras: [{ extraId: id, canonicalId: id, description: "Fictional gutter" }] }] };
  expect(extraDuplicateCandidatesV1.safeParse(body).success).toBe(true);
  for (const field of ["netPence", "actor", "tenantId", "origin"]) expect(extraDuplicateCandidatesV1.safeParse({ ...body, [field]: 12 }).success).toBe(false);
  expect(extraDuplicateCandidatesV1.safeParse({ ...body, groups: [{ id, fingerprint: "a".repeat(64), extras: [{ ...body.groups[0]!.extras[0], netPence: 12 }] }] }).success).toBe(false);
 });
});

it("strict disposition command refuses forged authority and requires an exact snapshot and reason", () => {
 const command = { version: "duplicate-disposition.v1", commandId: "40000000-0000-4000-8000-000000000001", groupId: "40000000-0000-4000-8000-000000000002", fingerprint: "a".repeat(64), disposition: "not_duplicates", reasonCode: "different_work" };
 expect(duplicateDispositionV1.safeParse(command).success).toBe(true);
 expect(duplicateDispositionV1.safeParse({ ...command, disposition: "reopen", reasonCode: "review_changed" }).success).toBe(true);
 for (const field of ["actorMembershipId", "tenantId", "role", "jobId", "approved"]) expect(duplicateDispositionV1.safeParse({ ...command, [field]: command.groupId }).success).toBe(false);
 for (const patch of [{ fingerprint: "" }, { reasonCode: "" }, { disposition: "approved" }, { groupId: "unknown" }]) expect(duplicateDispositionV1.safeParse({ ...command, ...patch }).success).toBe(false);
});
it("the list and export share the exact unresolved groups and preserve the original candidate predicate", () => {
 const added = sql("1201_extra_duplicate_disposition");
 const cb = added.split("CREATE OR REPLACE FUNCTION app.cb_unresolved")[1]!.split("$$;")[0]!;
 const read = added.split("CREATE OR REPLACE FUNCTION app.extra_duplicate_candidates")[1]!.split("$$;")[0]!;
 expect(cb).toContain("app.extra_duplicate_unresolved(p_tenant,p_job)");
 expect(read).toContain("app.extra_duplicate_unresolved(t,p_job)");
 const previous = sql("0243_contractor_billing").split("CREATE FUNCTION app.cb_unresolved")[1]!.split("AS $$")[1]!.split("$$;")[0]!;
 const predicate = previous.split("JOIN members b")[1]!.trim().slice(0, -1);
 expect(clean(added)).toContain(clean(`JOIN members b ${predicate})`));
 expect(added).not.toMatch(/ALTER TABLE app\.(variation|extra_origin|extra_approval_revision_binding)\b|SET app\./);
});
