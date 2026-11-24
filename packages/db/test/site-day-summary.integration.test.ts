// QW-2 site day sources on real PostgreSQL: right day, right job, right tenant.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { siteDayOfV1, siteDayWindowV1 } from "@jobguard/core";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, type FinalCheckFixture } from "./final-check-fixture.js";
import { insertVariationProposal } from "../src/variation-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { SiteDaySummaryRepository } from "../src/site-day-summary-repository.js";
import { workTenant } from "./job-work-state-fixtures.js";
import { testBoundTenantContext } from "./tenant-context-test-utils.js";

let f: FinalCheckFixture;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createFinalCheckFixture(); }, 120000);
afterAll(async () => { await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });

const today = () => siteDayWindowV1(siteDayOfV1(new Date()));
async function photo(tenantId: string, jobId: string, scopeItemId: string, at: string, contentType = "image/jpeg") {
  const id = randomUUID(), version = randomUUID(), sha = "d".repeat(64);
  await workTenant(f.admin, tenantId, async db => {
    await db.query(`INSERT INTO app.evidence_upload(tenant_id,id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_received_at,server_verified_at)
      VALUES($1,$2::uuid,$3,$4,$2::text,$5,$7,100,'standard_evidence',$6::timestamptz+interval '1 day','verified',$8,$6,$6)`, [tenantId, id, jobId, scopeItemId, sha, at, contentType, version]);
    await db.query(`INSERT INTO app.evidence_object(tenant_id,id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
      VALUES($1,$2::uuid,$2::uuid,$3,$4,'original','completion_photo',$2::text,$5,$6,80,$8,'standard_evidence',$7,$7)`, [tenantId, id, jobId, scopeItemId, version, sha, at, contentType]);
  });
  return id;
}

it("collects the day's extras, photos and progress, and nothing from outside the window", async () => {
  const a = await seedFinalCheckJob(f), window = today(), repository = new SiteDaySummaryRepository(f.runtime);
  const variationId = randomUUID();
  await withTenant(f.runtime, a.context, db => insertVariationProposal(db, a.tenantId, { version: "variation-proposal.v1", id: variationId, jobId: a.jobId, scopeItemId: variationId, existingScopeItemId: null, lineageParentScopeItemId: null, captureKind: "text", captureText: "Fictional rotten joist", description: "Fictional rotten joist", suggestion: null }));
  const inside = await photo(a.tenantId, a.jobId, a.scopeItemId, new Date(Date.now() - 60_000).toISOString());
  await photo(a.tenantId, a.jobId, a.scopeItemId, new Date(Date.parse(window.startsAt) - 1).toISOString());
  await photo(a.tenantId, a.jobId, a.scopeItemId, new Date(Date.now() - 30_000).toISOString(), "text/plain; charset=utf-8");
  const sources = await repository.sources(a.context, a.jobId, window);
  expect(sources.issues).toEqual([{ variationId, description: "Fictional rotten joist", at: expect.any(String) }]);
  expect(sources.photos.map(p => p.evidenceId)).toEqual([inside]);
  expect(sources.workDone.every(item => item.at >= window.startsAt && item.at < window.closesAt)).toBe(true);
  const earlier = siteDayWindowV1("2020-01-01");
  expect(await repository.sources(a.context, a.jobId, earlier)).toEqual({ workDone: [], issues: [], deliveries: [], photos: [] });
});

it("never shows another job's or another tenant's rows", async () => {
  const a = await seedFinalCheckJob(f), b = await seedFinalCheckJob(f), window = today(), repository = new SiteDaySummaryRepository(f.runtime);
  await photo(b.tenantId, b.jobId, b.scopeItemId, new Date(Date.now() - 60_000).toISOString());
  expect((await repository.sources(a.context, a.jobId, window)).photos).toEqual([]);
  const tenant = randomUUID(), user = randomUUID(), account = randomUUID(), member = randomUUID();
  await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await f.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional other builder')", [account, tenant]);
  await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member, tenant, account, user]);
  const other = await testBoundTenantContext(f.admin, tenant, member);
  expect(await repository.sources(other, b.jobId, window)).toEqual({ workDone: [], issues: [], deliveries: [], photos: [] });
});
