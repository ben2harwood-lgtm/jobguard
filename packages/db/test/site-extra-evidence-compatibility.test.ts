import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteExtraError } from "@jobguard/core";
import { ExtraRepository } from "../src/extra-repository.js";
import { SiteExtraRepository } from "../src/site-extra-repository.js";
import type { AuthenticatedMembership, TenantTransaction } from "../src/tenant-context.js";
import { verifiedTenantContextFromMembership } from "../src/tenant-context.js";

vi.mock("../src/tenant-context.js", async importOriginal => ({
 ...await importOriginal<typeof import("../src/tenant-context.js")>(),
 withTenant: async (pool: unknown, _context: unknown, work: (db: unknown) => Promise<unknown>) => work(pool),
}));
vi.mock("../src/work-order-repository.js", async importOriginal => ({
 ...await importOriginal<typeof import("../src/work-order-repository.js")>(),
 assertContractorGate: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());

// Adapter doubles prove repository routing only; the PostgreSQL case lives in the integration file.
function setup(evidenceRoutines: boolean) {
 const actor = { tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() } as AuthenticatedMembership;
 const context = verifiedTenantContextFromMembership(actor), grant = randomUUID(), variationId = randomUUID();
 const input = { commandId: randomUUID(), jobId: randomUUID(), description: "Fictional extra", note: "Fictional note" };
 const query = vi.fn(async (sql: string) => {
  if (sql.includes("app.ent3d_")) {
   if (!evidenceRoutines) throw Object.assign(new Error("routine unavailable"), { code: "42883" });
   if (sql.includes("app.ent3d_site_extra_evidence")) return { rows: [{ decision: "accepted", reason_code: "accepted", photo_sha256: null, content_sha256: "a".repeat(64) }] };
   if (sql.includes("app.ent3d_record_resident_confirmation")) return { rows: [{ outcome: "existing", reason_code: "existing", content_sha256: "a".repeat(64), document_sha256: "b".repeat(64) }] };
  }
  if (sql.includes("app.ent3a_extra_authority")) return { rows: [{ decision: "allowed", reason_code: "allowed", raising_grant: grant }] };
  return { rows: [] };
 });
 const db = { $client: { query } } as unknown as TenantTransaction;
 const raise = vi.spyOn(ExtraRepository.prototype, "raiseExtra").mockImplementation(async (_ctx, _raw, seam) => {
  await seam?.(db, { kind: "raise", commandId: input.commandId, jobId: input.jobId, variationId });
  return { variationId };
 });
 return { repo: new SiteExtraRepository(db as unknown as Pool), context, actor, input, variationId, query, raise };
}

describe("ENT-3d schema compatibility routing", () => {
 it("[R6] a non-v3 log uses the original authority checks without any 0141 routine", async () => {
  const f = setup(false);
  await expect(f.repo.logSiteExtra(f.context, f.actor, f.input)).resolves.toEqual({ variationId: f.variationId });
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
   "SELECT decision,reason_code,raising_grant FROM app.ent3a_extra_authority($1,$2,$3)",
   "SELECT app.require_watchdog_live($1::uuid)",
   "SELECT app.require_watchdog_live($1::uuid)",
   "SELECT app.ent3a_require_extra_authority($1,$2)",
   "SELECT app.ent3b_require_open_visit($1,$2)",
  ]);
 });
 it.each(["photo", "confirmation", "both"])("[R6] v3 %s fails closed with typed unavailable when 0141 routines are missing", async kind => {
  const f = setup(false), fields = {
   ...(kind !== "confirmation" ? { photoEvidenceId: randomUUID() } : {}),
   ...(kind !== "photo" ? { shownContentSha256: "a".repeat(64) } : {}),
  };
  const error = await f.repo.logSiteExtra(f.context, f.actor, { ...f.input, ...fields }).catch(e => e);
  expect(error).toBeInstanceOf(SiteExtraError); expect(error.code).toBe("SITE_EXTRA_UNAVAILABLE");
  expect(f.raise).not.toHaveBeenCalled();
 });
 it.each(["photo", "confirmation", "both"])("[R6] v3 %s keeps the transaction evidence guard when 0141 is installed", async kind => {
  const f = setup(true), fields = {
   ...(kind !== "confirmation" ? { photoEvidenceId: randomUUID() } : {}),
   ...(kind !== "photo" ? { shownContentSha256: "a".repeat(64) } : {}),
  };
  await expect(f.repo.logSiteExtra(f.context, f.actor, { ...f.input, ...fields })).resolves.toMatchObject({ variationId: f.variationId, evidence: { contentSha256: "a".repeat(64) } });
  expect(f.query.mock.calls.map(([sql]) => sql).slice(-4)).toEqual([
   "SELECT app.require_watchdog_live($1::uuid)",
   "SELECT app.ent3a_require_extra_authority($1,$2)",
   "SELECT app.ent3b_require_open_visit($1,$2)",
   "SELECT app.ent3d_require_site_extra_evidence($1,$2)",
  ]);
 });
});
