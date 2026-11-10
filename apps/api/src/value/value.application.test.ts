import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, practiceOwnedJobsSql } from "@jobguard/db";
import { ValueApplication } from "./value.application.js";

type Revision = { id: string; revision_id: string; revision: number; description: string; signed_delta_pence: string; approved: boolean; rejected: boolean; current: boolean };

// This double models the two variation joins, not PostgreSQL itself. The companion
// integration suite exercises the real query and variation commands with RLS.
type Catch = { id: string; description: string; origin: string; kind: string | null; source_signal_id: string | null; revision_id: string | null; revision: number | null; signed_delta_pence: string | null; approved: boolean };
function fixture(revisions: Revision[], catches: Catch[] = [], owned = true) {
 const session = randomUUID(), jobId = randomUUID();
 const query = vi.fn(async (sql: string, params?: unknown[]) => {
  if (sql === "SELECT app.current_actor() actor, app.current_tenant() tenant") return { rows: [{ actor: DEMO_MEMBERSHIP_ID, tenant: DEMO_TENANT_ID }] };
  if (sql.includes("authenticate_practice_session")) return { rows: [{ tenant_id: DEMO_TENANT_ID, membership_id: DEMO_MEMBERSHIP_ID, identity_user_id: DEMO_IDENTITY_USER_ID }] };
  if (sql.startsWith(practiceOwnedJobsSql())) return { rows: owned ? [{ id: jobId }] : [] };
  if (sql.startsWith("SELECT baseline_quote_version_id")) return { rows: [{ baseline_quote_version_id: null }] };
  if (sql.includes("JOIN app.extra_origin o")) {
   expect(params).toEqual([DEMO_TENANT_ID, jobId]);
   expect(sql).toContain("v.tenant_id=$1 AND v.job_id=$2");
   expect(sql).toContain("(o.tenant_id,o.job_id,o.variation_id)=(v.tenant_id,v.job_id,v.id)");
   expect(sql).toContain("LEFT JOIN app.variation_revision");
   expect(sql).toContain("v.origin='jobguard_catch' AND o.kind='jobguard_catch' AND o.source_signal_id IS NOT NULL");
   expect(sql).not.toMatch(/app\.(shadow|final_check|evidence)/);
   return { rows: catches.filter(row => row.origin === "jobguard_catch" && row.kind === "jobguard_catch" && row.source_signal_id !== null) };
  }
  if (sql.includes("FROM app.variation v")) {
   const currentOnly = sql.includes("(v.tenant_id,v.current_revision_id)");
   if (currentOnly) return { rows: revisions.filter(row => row.current) };
   if (sql.includes("(r.tenant_id,r.variation_id)=(v.tenant_id,v.id)")) return { rows: revisions };
   throw new Error("Unsupported variation join in query double");
  }
  return { rows: [] };
 });
 const pool = { query, connect: vi.fn(async () => ({ query, release: vi.fn() })) } as unknown as Pool;
 return { app: new ValueApplication(pool, session), jobId, query };
}
afterEach(() => vi.unstubAllEnvs());

it.each(["addition", "omission"] as const)("value preserves the approved amount while repricing awaits approval (%s)", async direction => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const sign = direction === "addition" ? 1 : -1;
 const variationId = randomUUID();
 const first: Revision = { id: variationId, revision_id: randomUUID(), revision: 1, description: "Fictional reviewed extra", signed_delta_pence: String(sign * 12500), approved: true, rejected: false, current: true };
 const revisions = [first], { app, jobId } = fixture(revisions);
 const key = direction === "addition" ? "approvedExtras" : "approvedReductions";
 const source = (row: Revision) => ({ id: row.revision_id, revision: row.revision, label: `Variation revision ${row.revision}: ${row.description}`, href: `/jobs/${jobId}#variation-${variationId}` });
 expect((await app.read(jobId))[key]).toEqual({ pence: 12500, basis: "net", sources: [source(first)] });

 first.current = false;
 const second: Revision = { ...first, revision_id: randomUUID(), revision: 2, signed_delta_pence: String(sign * 15000), approved: false, rejected: false, current: true };
 revisions.push(second);
 const pending = await app.read(jobId);
 expect(pending[key]).toEqual({ pence: 12500, basis: "net", sources: [source(first)] });
 expect(pending.pendingExtras).toEqual(direction === "addition" ? [{ id: second.revision_id, revision: 2, description: second.description, pence: 15000, status: "awaiting_approval", href: `/jobs/${jobId}#variation-${variationId}` }] : []);

 second.approved = true;
 const approved = await app.read(jobId);
 expect(approved[key]).toEqual({ pence: 15000, basis: "net", sources: [source(second)] });
 expect(approved.pendingExtras).toEqual([]);
});

it("counts the latest approval once per variation across direction changes and unordered rows", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const id = randomUUID(), other = randomUUID();
 const row = (variationId: string, revision: number, pence: number, approved: boolean, current: boolean): Revision => ({ id: variationId, revision_id: randomUUID(), revision, description: "Fictional varied work", signed_delta_pence: String(pence), approved, rejected: false, current });
 const reduction = row(id, 2, -15000, true, false), pending = row(id, 3, 20000, false, true), extra = row(other, 2, 5000, true, true);
 const { app, jobId } = fixture([reduction, pending, extra, row(other, 1, 4000, true, false), row(id, 1, 12500, true, false)]);
 const value = await app.read(jobId);
 expect(value.approvedExtras.pence).toBe(5000);
 expect(value.approvedExtras.sources.map(source => source.id)).toEqual([extra.revision_id]);
 expect(value.approvedReductions.pence).toBe(15000);
 expect(value.approvedReductions.sources.map(source => source.id)).toEqual([reduction.revision_id]);
 expect(value.pendingExtras.map(source => source.id)).toEqual([pending.revision_id]);
});

it("keeps unapproved money unknown and lists only the current pending revision", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const first: Revision = { id: randomUUID(), revision_id: randomUUID(), revision: 1, description: "Fictional unapproved extra", signed_delta_pence: "12500", approved: false, rejected: false, current: false };
 const current = { ...first, revision_id: randomUUID(), revision: 2, signed_delta_pence: "15000", current: true };
 const { app, jobId } = fixture([first, current]), value = await app.read(jobId);
 expect(value.approvedExtras).toEqual({ pence: null, basis: "net", sources: [] });
 expect(value.approvedReductions).toEqual({ pence: null, basis: "net", sources: [] });
 expect(value.pendingExtras.map(source => source.id)).toEqual([current.revision_id]);
});

const catchRow = (): Catch => ({ id: randomUUID(), description: "fitted loft hatch", origin: "jobguard_catch", kind: "jobguard_catch", source_signal_id: randomUUID(), revision_id: randomUUID(), revision: 2, signed_delta_pence: "30000", approved: false });
it("reads the one persisted catch and its current price on repeated reads without counting approvals", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const found = catchRow(), { app, jobId } = fixture([], [found]);
 const expected = [{ id: found.id, description: found.description, sourceSignalId: found.source_signal_id, revisionId: found.revision_id, revision: 2, pence: 30000, approved: false, href: `/jobs/${jobId}#variation-${found.id}` }];
 expect((await app.read(jobId)).foundAfterLock).toEqual(expected);
 expect((await app.read(jobId)).foundAfterLock).toEqual(expected);
 found.approved = true;
 expect((await app.read(jobId)).foundAfterLock[0]?.approved).toBe(true);
});
it("keeps an unpriced catch unknown, including its absent current revision", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const { app, jobId } = fixture([], [{ ...catchRow(), revision_id: null, revision: null, signed_delta_pence: null }]);
 expect((await app.read(jobId)).foundAfterLock[0]).toMatchObject({ revisionId: null, revision: null, pence: null, approved: false });
});
it.each(["builder_logged", "final_review"])("never attributes a builder's own %s extra with the same description and £300", async origin => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const { app, jobId } = fixture([], [{ ...catchRow(), origin }]);
 expect((await app.read(jobId)).foundAfterLock).toEqual([]);
});
it.each([null, "builder_logged", "final_review"])("omits a missing or mismatched origin record (%s)", async kind => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const { app, jobId } = fixture([], [{ ...catchRow(), kind }]);
 expect((await app.read(jobId)).foundAfterLock).toEqual([]);
});
it("omits a catch without a stored signal link", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const { app, jobId } = fixture([], [{ ...catchRow(), source_signal_id: null }]);
 expect((await app.read(jobId)).foundAfterLock).toEqual([]);
});
it.each(["before lock", "declined", "already billed"])("has no found entry or pounds for %s without a persisted catch", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const { app, jobId } = fixture([]);
 const value = await app.read(jobId);
 expect(value.foundAfterLock).toEqual([]);
 expect(value.approvedExtras.pence).toBeNull();
});
it.each(["another firm", "another practice session"])("refuses %s's job before reading values", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const { app, jobId, query } = fixture([], [catchRow()], false);
 await expect(app.read(jobId)).rejects.toThrow();
 expect(query.mock.calls.some(([sql]) => sql.includes("FROM app.variation v"))).toBe(false);
});

it("removes a rejected extra while retaining another pending extra on the same job", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const proposed: Revision = { id: randomUUID(), revision_id: randomUUID(), revision: 1, description: "Fictional proposed extra", signed_delta_pence: "12500", approved: false, rejected: false, current: true };
 const revisions = [proposed], { app, jobId } = fixture(revisions);
 expect((await app.read(jobId)).pendingExtras.map(row => row.id)).toEqual([proposed.revision_id]);
 // Rejection leaves the current pointer on the same revision.
 proposed.rejected = true;
 const rejected = await app.read(jobId);
 expect(rejected.pendingExtras).toEqual([]);
 const other = { ...proposed, id: randomUUID(), revision_id: randomUUID(), description: "Fictional still-pending extra", rejected: false };
 revisions.push(other);
 const pending = await app.read(jobId);
 expect(pending).toEqual({ ...rejected, pendingExtras: [{ id: other.revision_id, revision: 1, description: other.description, pence: 12500, status: "awaiting_approval", href: `/jobs/${jobId}#variation-${other.id}` }] });
});
