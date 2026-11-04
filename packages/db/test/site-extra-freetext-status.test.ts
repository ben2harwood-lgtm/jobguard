import { randomUUID, createHash } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { ExtraRepository } from "../src/extra-repository.js";
import { SiteExtraRepository } from "../src/site-extra-repository.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../src/tenant-context.js";
import { canonicalJson } from "../src/work-order-repository.js";
vi.mock("../src/tenant-context.js", async original => ({ ...await original<typeof import("../src/tenant-context.js")>(), withTenant: async (db: unknown, _ctx: unknown, work: (db: unknown) => Promise<unknown>) => work(db) }));
vi.mock("../src/work-order-repository.js", async original => ({ ...await original<typeof import("../src/work-order-repository.js")>(), assertContractorGate: vi.fn() }));
vi.mock("../src/audit.js", () => ({ appendAuditBatch: vi.fn() }));

function setup() {
 const actor = { tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() } as AuthenticatedMembership;
 const context = verifiedTenantContextFromMembership(actor), grantId = randomUUID();
 const raw = { version: "log-site-extra.v4", commandId: randomUUID(), jobId: randomUUID(), description: "Fictional work", note: "Reviewed fictional note", workStatus: "finished" };
 let claimed: string | undefined, completed = false, assigned = true;
 const variationId = randomUUID();
 const query = vi.fn(async (sql: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number }> => {
  if (sql.includes("app.ent3a_extra_authority")) return { rows: [{ decision: assigned ? "allowed" : "not_found", reason_code: assigned ? "allowed" : "job_out_of_scope", raising_grant: assigned ? grantId : null }], rowCount: 1 };
  if (sql.includes("j.provenance")) return { rows: [{ provenance: "work_order", job_track: "contractor", environment: "synthetic_demo" }], rowCount: 1 };
  if (sql.includes("app.begin_command")) {
   const content = JSON.parse(values![5] as string).legacyJson as string;
   if (claimed && claimed !== content) throw new Error("COMMAND_CONFLICT");
   claimed = content;
   return { rows: [{ result: completed ? { kind: "replay", result: { variationId } } : { kind: "claim" } }], rowCount: 1 };
  }
  if (sql.includes("app.complete_command")) { completed = true; return { rows: [{ result: { variationId } }], rowCount: 1 }; }
  if (sql.includes("SELECT role FROM app.membership")) return { rows: [{ role: "operative" }], rowCount: 1 };
  if (sql.includes("RETURNING origin_hash")) return { rows: [{ origin_hash: "a".repeat(64) }], rowCount: 1 };
  return { rows: [], rowCount: 1 };
 });
 const db = { $client: { query } } as unknown as Pool;
 return { actor, context, raw, query, db, repo: new SiteExtraRepository(db), unassign: () => { assigned = false; }, claimed: () => claimed! };
}
it("binds v4 status at the actual shared command claim before replay, writes once and preserves the first statement", async () => {
 const f = setup();
 const first = await f.repo.logSiteExtra(f.context, f.actor, f.raw);
 expect(await f.repo.logSiteExtra(f.context, f.actor, f.raw)).toEqual(first);
 await expect(f.repo.logSiteExtra(f.context, f.actor, { ...f.raw, workStatus: "not_started" })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
 expect(JSON.parse(f.claimed())).toMatchObject({ version: "raise-extra.v2", workStatus: "finished", note: f.raw.note, description: f.raw.description });
 const writes = f.query.mock.calls.filter(([sql]) => sql.includes("app.ent3_work_status"));
 expect(writes).toHaveLength(1);
 expect(writes[0]![1]).toEqual([f.raw.jobId, f.actor.membershipId, expect.any(String), "finished"]);
 expect(f.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO app.extra_origin"))).toHaveLength(1);
 f.unassign();
 await expect(f.repo.logSiteExtra(f.context, f.actor, f.raw)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("preserves the historical v1 claim bytes and digest, including optional fields and old command callers", async () => {
 for (const commandType of ["LogSiteExtra", "RecordOfficeExtra", "RecordClientInstruction"]) {
  const f = setup();
  const body = { version: "raise-extra.v1", commandId: f.raw.commandId, commandType, jobId: f.raw.jobId, actorMembershipId: f.actor.membershipId, grantId: randomUUID(), note: f.raw.note, description: f.raw.description, deviceId: "fictional-device", evidenceId: randomUUID() };
  const { commandId: _id, ...historical } = body;
  await new ExtraRepository(f.db).raiseExtra(f.context, body);
  expect(f.claimed()).toBe(canonicalJson(historical));
  const digest = (text: string) => createHash("sha256").update(text).digest("hex");
  expect(digest(f.claimed())).toBe(digest(canonicalJson(historical)));
  expect(f.query.mock.calls.some(([sql]) => sql.includes("app.ent3_work_status"))).toBe(false);
 }
});
it("refuses a cross-tenant actor before any authority read or command claim", async () => {
 const f = setup();
 await expect(f.repo.logSiteExtra(f.context, { ...f.actor, tenantId: randomUUID() }, f.raw)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
 expect(f.query.mock.calls.some(([sql]) => sql.includes("app.ent3a_extra_authority") || sql.includes("app.begin_command"))).toBe(false);
});

it("matches the fixed historical request digest at the real claim seam", async () => {
 const f = setup(), id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
 await new ExtraRepository(f.db).raiseExtra(f.context, { version: "raise-extra.v1", commandId: id(1), commandType: "LogSiteExtra", jobId: id(2), actorMembershipId: id(3), grantId: id(4), note: "Fictional capture", description: "Fictional additional repair" });
 // Independently calculated from the historical sorted UTF-8 JSON bytes with Python hashlib.
 expect(createHash("sha256").update(f.claimed()).digest("hex")).toBe("a72267e08fac245cbdc8d64c86ac383de9472d1ea580a1fdf046243d9cf10bef");
});
