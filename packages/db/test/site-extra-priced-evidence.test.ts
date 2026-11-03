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
  const raw = { version: "log-sor-site-extra.v2", commandId: randomUUID(), jobId, sorCode: "CLEAR-GUTTER", quantity: "1", note: "Fictional note", description: "Fictional extra", photoEvidenceId: randomUUID(), residentConfirmation: { shownContentSha256: "a".repeat(64) } };
  const query = vi.fn(async (sql: string) => {
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
