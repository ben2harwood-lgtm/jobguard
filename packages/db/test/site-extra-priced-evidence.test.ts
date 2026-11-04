import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { ExtraRepository } from "../src/extra-repository.js";
import { SiteExtraRepository } from "../src/site-extra-repository.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership, type TenantTransaction } from "../src/tenant-context.js";

vi.mock("../src/tenant-context.js", async original => ({ ...await original<typeof import("../src/tenant-context.js")>(), withTenant: async (db: unknown, _context: unknown, work: (db: unknown) => Promise<unknown>) => work(db) }));
vi.mock("../src/work-order-repository.js", async original => ({ ...await original<typeof import("../src/work-order-repository.js")>(), assertContractorGate: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
function setup() {
  const actor = { tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() } as AuthenticatedMembership;
  const context = verifiedTenantContextFromMembership(actor), jobId = randomUUID(), variationId = randomUUID();
  const raw = { version: "log-sor-site-extra.v2", workStatus: "finished", commandId: randomUUID(), jobId, sorCode: "CLEAR-GUTTER", quantity: "1", note: "Fictional note", description: "Fictional extra", photoEvidenceId: randomUUID(), residentConfirmation: { shownContentSha256: "a".repeat(64) } };
  const query = vi.fn(async (sql: string, _values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> => {
    if (sql.includes("app.ent3a_extra_authority")) return { rows: [{ decision: "allowed", reason_code: "allowed", raising_grant: randomUUID() }] };
    if (sql.includes("FROM app.work_order w")) return { rows: [{ revision_id: randomUUID(), sor_version_id: randomUUID() }] };
    if (sql.includes("FROM app.sor_item")) return { rows: [{ code: raw.sorCode, description: raw.description, unit: "each" }] };
    if (sql.includes("app.ent3d_site_extra_evidence")) return { rows: [{ decision: "accepted", reason_code: "accepted", photo_sha256: "b".repeat(64), content_sha256: "a".repeat(64) }] };
    if (sql.includes("app.ent3d_record_resident_confirmation")) return { rows: [{ outcome: "existing", reason_code: "existing", content_sha256: "a".repeat(64), document_sha256: "c".repeat(64) }] };
    return { rows: [], rowCount: 0 };
  });
  const db = { $client: { query } } as unknown as TenantTransaction;
  const raise = vi.spyOn(ExtraRepository.prototype, "raiseExtra").mockImplementation(async (_ctx, _raw, seam) => {
    await seam?.(db, { kind: "raise", commandId: raw.commandId, jobId, variationId });
    return { variationId };
  });
  return { actor, context, raw, query, raise, repo: new SiteExtraRepository(db as unknown as Pool) };
}
it("rejects a cross-customer actor before authority or evidence reads", async () => {
  const f = setup();
  await expect(f.repo.logSorSiteExtra(f.context, { ...f.actor, tenantId: randomUUID() }, f.raw)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
  expect(f.query.mock.calls.some(([sql]) => sql.includes("app.ent3d_") || sql.includes("app.ent3a_extra_authority"))).toBe(false);
  expect(f.raise).not.toHaveBeenCalled();
});
it("routes priced v2 through the stored-origin evidence guard before pricing", async () => {
  const f = setup();
  // The double does not store a revision, so reading the result fails after the seam. This test proves routing only.
  await expect(f.repo.logSorSiteExtra(f.context, f.actor, f.raw)).rejects.toMatchObject({ code: "SITE_PRICING_UNAVAILABLE" });
  expect(f.raise).toHaveBeenCalledOnce();
  expect(f.raise.mock.calls[0]![1]).toMatchObject({ evidenceId: f.raw.photoEvidenceId, residentConfirmationEvidenceId: expect.any(String), description: f.raw.description });
  const statements = f.query.mock.calls.map(([sql]) => sql);
  expect(statements.indexOf("SELECT app.ent3d_require_site_extra_evidence($1,$2)")).toBeLessThan(statements.indexOf("SELECT app.ent3c_record_sor_revision($1,$2,$3,$4)"));
});
it("rejects a mismatched resident hash before raising a priced extra", async () => {
  const f = setup();
  await expect(f.repo.logSorSiteExtra(f.context, f.actor, { ...f.raw, residentConfirmation: { shownContentSha256: "d".repeat(64) } })).rejects.toMatchObject({ code: "CONFIRMATION_MISMATCH" });
  expect(f.raise).not.toHaveBeenCalled();
});

it.each(["not_started", "under_way", "finished"])("records %s only in the log transaction seam, without passing it to commercial or timing input", async workStatus => {
 const f = setup();
 await expect(f.repo.logSorSiteExtra(f.context, f.actor, { ...f.raw, workStatus })).rejects.toMatchObject({ code: "SITE_PRICING_UNAVAILABLE" });
 expect(f.raise).toHaveBeenCalledOnce();
 const raised = f.raise.mock.calls[0]![1] as Record<string, unknown>;
 for (const key of ["workStatus", "doneWithoutRequiredPreapproval", "workStartedAt", "workCompletedAt", "netPence", "origin", "fee", "meter"]) expect(raised).not.toHaveProperty(key);
 expect(f.query.mock.calls.find(([sql]) => sql.includes("app.ent3_work_status"))).toEqual(["SELECT app.ent3_work_status($1,$2,$3,$4)", [f.raw.jobId, f.actor.membershipId, expect.any(String), workStatus]]);
});

it.each(["extra-repository.ts", "site-visit-repository.ts", "extra-approval-chain-repository.ts", "enterprise-fee-repository.ts", "subscription-meter-source.ts", "subscription-repository.ts"])("keeps statement reads outside the authoritative consumer %s", file => {
 expect(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")).not.toMatch(/site_extra_work_status|ent3_work_status|workStatus/);
});

it("exact replay returns the first log, but the same command with a changed status conflicts before another write", async () => {
 const f = setup(), original = f.query.getMockImplementation()!;
 let requestHash: string | undefined;
 const variationId = randomUUID();
 f.query.mockImplementation(async (sql, values) => {
  if (sql.includes("app.ent3c_record_sor_revision")) requestHash = values![3] as string;
  if (requestHash && sql.includes("FROM app.extra_sor_revision")) return { rows: [{ variation_id: variationId, job_id: f.raw.jobId, raising_membership_id: f.actor.membershipId, request_hash: requestHash,
   coverage: "new", sor_code: f.raw.sorCode, unit: "each", claimed_quantity: "1", instructed_quantity: null, quantity: "1", excess_of_scope_item_id: null, pricing_basis: "server_sor" }], rowCount: 1 };
  return original(sql, values);
 });
 const first = await f.repo.logSorSiteExtra(f.context, f.actor, f.raw);
 expect(await f.repo.logSorSiteExtra(f.context, f.actor, f.raw)).toEqual(first);
 await expect(f.repo.logSorSiteExtra(f.context, f.actor, { ...f.raw, workStatus: "not_started" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
 expect(f.raise).toHaveBeenCalledOnce();
 expect(f.query.mock.calls.filter(([sql]) => sql.includes("app.ent3_work_status"))).toHaveLength(1);
});
