import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, practiceOwnedJobsSql } from "@jobguard/db";
import { ValueApplication } from "./value.application.js";

type Revision = { id: string; revision_id: string; revision: number; description: string; signed_delta_pence: string; approved: boolean; current: boolean };

// This double models the two variation joins, not PostgreSQL itself. The companion
// integration suite exercises the real query and variation commands with RLS.
function fixture(revisions: Revision[]) {
 const session = randomUUID(), jobId = randomUUID();
 const query = vi.fn(async (sql: string) => {
  if (sql.includes("authenticate_practice_session")) return { rows: [{ tenant_id: DEMO_TENANT_ID, membership_id: DEMO_MEMBERSHIP_ID, identity_user_id: DEMO_IDENTITY_USER_ID }] };
  if (sql.startsWith(practiceOwnedJobsSql())) return { rows: [{ id: jobId }] };
  if (sql.startsWith("SELECT baseline_quote_version_id")) return { rows: [{ baseline_quote_version_id: null }] };
  if (sql.includes("FROM app.variation v")) {
   const currentOnly = sql.includes("(v.tenant_id,v.current_revision_id)");
   if (currentOnly) return { rows: revisions.filter(row => row.current) };
   if (sql.includes("(r.tenant_id,r.variation_id)=(v.tenant_id,v.id)")) return { rows: revisions };
   throw new Error("Unsupported variation join in query double");
  }
  return { rows: [] };
 });
 const pool = { query, connect: vi.fn(async () => ({ query, release: vi.fn() })) } as unknown as Pool;
 return { app: new ValueApplication(pool, session), jobId };
}
afterEach(() => vi.unstubAllEnvs());

it.each(["addition", "omission"] as const)("value preserves the approved amount while repricing awaits approval (%s)", async direction => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const sign = direction === "addition" ? 1 : -1;
 const variationId = randomUUID();
 const first: Revision = { id: variationId, revision_id: randomUUID(), revision: 1, description: "Fictional reviewed extra", signed_delta_pence: String(sign * 12500), approved: true, current: true };
 const revisions = [first], { app, jobId } = fixture(revisions);
 const key = direction === "addition" ? "approvedExtras" : "approvedReductions";
 const source = (row: Revision) => ({ id: row.revision_id, revision: row.revision, label: `Variation revision ${row.revision}: ${row.description}`, href: `/jobs/${jobId}#variation-${variationId}` });
 expect((await app.read(jobId))[key]).toEqual({ pence: 12500, basis: "net", sources: [source(first)] });

 first.current = false;
 const second: Revision = { ...first, revision_id: randomUUID(), revision: 2, signed_delta_pence: String(sign * 15000), approved: false, current: true };
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
 const row = (variationId: string, revision: number, pence: number, approved: boolean, current: boolean): Revision => ({ id: variationId, revision_id: randomUUID(), revision, description: "Fictional varied work", signed_delta_pence: String(pence), approved, current });
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
 const first: Revision = { id: randomUUID(), revision_id: randomUUID(), revision: 1, description: "Fictional unapproved extra", signed_delta_pence: "12500", approved: false, current: false };
 const current = { ...first, revision_id: randomUUID(), revision: 2, signed_delta_pence: "15000", current: true };
 const { app, jobId } = fixture([first, current]), value = await app.read(jobId);
 expect(value.approvedExtras).toEqual({ pence: null, basis: "net", sources: [] });
 expect(value.approvedReductions).toEqual({ pence: null, basis: "net", sources: [] });
 expect(value.pendingExtras.map(source => source.id)).toEqual([current.revision_id]);
});
