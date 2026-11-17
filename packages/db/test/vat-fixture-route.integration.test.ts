import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { VAT_FIXTURE_LABEL, VAT_SUPPORT_MATRIX_VERSION } from "@jobguard/core";
import { IdentityRepository, JobRepository, VatFixtureRepository } from "../src/index.js";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { IdentityApplication } from "../../../apps/api/src/auth/identity.application.js";
import { resolveVerifiedTenantContext } from "../../../apps/api/src/auth/principal-bridge.js";
import { VatFixtureApplication } from "../../../apps/api/src/vat-fixture.application.js";
// Only HTTP cookie extraction/composition is replaced. Session, membership, context,
// core validation and all repository operations run against real PostgreSQL.
const boundary = vi.hoisted(() => ({ app: null as unknown, identity: null as unknown }));
vi.mock("../../../apps/web/app/lib/identity-server", () => ({ identityApplication: () => boundary.identity,
  identityCredentials: async (request: Request) => ({ sessionToken: request.headers.get("cookie")?.replace("jobguard_session=", ""),
    origin: request.headers.get("origin") ?? undefined, csrfToken: request.headers.get("x-csrf-token") ?? undefined, tenantHeader: request.headers.get("x-tenant-id") ?? undefined }) }));
vi.mock("../../../apps/web/app/lib/vat-fixture-server", () => ({ vatFixtureApplication: () => boundary.app }));
vi.mock("../../../apps/api/dist/workspace/index.js", async () => import("../../../apps/api/src/vat-fixture.application.js"));
import { GET, POST } from "../../../apps/web/app/api/jobs/[id]/vat-fixtures/route.js";
let c: Cluster, identityPool: Pool, identity: IdentityApplication;
const origin = "https://company.invalid";
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster();
  await c.admin.query("ALTER ROLE jobguard_identity LOGIN PASSWORD 'vat-fixture-only'");
  identityPool = new Pool({ ...c.config, database: "jobguard_synthetic_demo", user: "jobguard_identity", password: "vat-fixture-only", max: 2 });
  identity = new IdentityApplication(new PersistedAuthProvider(new IdentityRepository(identityPool), "vat-fixture-only-secret-at-least-32-characters", undefined, "synthetic_demo", Date.now, () => "12345678"), origin);
  boundary.identity = identity; boundary.app = new VatFixtureApplication(identity, new VatFixtureRepository(c.runtime));
}, 240000);
afterAll(async () => { await identityPool?.end(); await c?.close(); vi.unstubAllEnvs(); });
async function company() {
  const email = `${randomUUID()}@practice.invalid`;
  await identity.provider.requestCode({ email, purpose: "signup", ip: randomUUID() });
  const session = await identity.provider.verifyCode(email, "signup", "12345678");
  const principal = await identity.principal(session.sessionToken), member = (await identity.provider.memberships(principal))[0]!;
  const credentials = { ...session, tenantHeader: member.tenantId, origin };
  const context = await resolveVerifiedTenantContext(identity.provider, credentials, origin);
  const job = await new JobRepository(c.runtime).create(context, ["job:update"], { title: "Fictional VAT route job" });
  return { session, member, jobId: job.id as string };
}
type Company = Awaited<ReturnType<typeof company>>;
function command(a: Company) {
  return { version: "vat.fixture-append.v1", commandId: randomUUID(), jobId: a.jobId,
    book: { version: "vat.fixture-book.v1", matrixVersion: VAT_SUPPORT_MATRIX_VERSION, environment: "synthetic", label: VAT_FIXTURE_LABEL,
      supplierReference: "Fictional supplier", customerReference: "Fictional customer", taxBasis: "net_after_retention", roundingVersion: "fixture_cumulative_group_half_up_v1" },
    document: { id: randomUUID(), previousDocumentId: null, kind: "interim", documentReference: "Fictional route document", documentDate: "2026-11-04",
      interimCertificationId: randomUUID(), retentionProfileId: randomUUID(), retentionReleaseId: null, creditOfDocumentId: null,
      groups: [{ treatment: "drc_20", cumulativeNetPence: 10000, retainedNetPence: 1000, eligibility: { source: "human_fixture", actorId: randomUUID(), evidenceId: randomUUID(),
        supplierVatRegistered: true, supplierVatNumber: "fictional-vat", customerVatRegistered: true, customerVatNumber: "fictional-customer-vat",
        customerEndUser: false, intermediarySupplier: false, constructionReverseChargeInScope: true, qualifyingBasisReference: "fictional qualification" } }] } };
}
function request(a: Company, raw?: unknown, jobId = a.jobId) {
  const req = new Request(`${origin}/api/jobs/${jobId}/vat-fixtures`, { method: raw ? "POST" : "GET",
    headers: { cookie: `jobguard_session=${a.session.sessionToken}`, origin, "x-csrf-token": a.session.csrfToken, "x-tenant-id": a.member.tenantId },
    ...(raw ? { body: JSON.stringify(raw) } : {}) });
  return (raw ? POST : GET)(req, { params: Promise.resolve({ id: jobId }) });
}
async function financialRows() {
  // Inventory all present financial/action tables, including side tables added later.
  const tables = (await c.admin.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname='app'
    AND tablename ~ '(invoice|receipt|fee|collection|ledger|journal|outbox|authorization|decision_resolution)' ORDER BY tablename`)).rows;
  const counts: Record<string, number> = {};
  for (const { tablename } of tables) counts[tablename] = Number((await c.admin.query(`SELECT count(*) n FROM app."${tablename.replaceAll('"', '""')}"`)).rows[0].n);
  for (const kind of ["invoice", "receipt", "fee", "collection", "ledger", "outbox"]) expect(tables.some(row => row.tablename.includes(kind))).toBe(true);
  return counts;
}
it("the screen's route stores only a synthetic document: no invoice, receipt, fee, collection, ledger or outbox effects", async () => {
  const a = await company(), input = command(a), before = await financialRows();
  const response = await request(a, input); expect(response.status).toBe(201);
  expect((await response.json()).reconciliation.documents[0].cumulative).toMatchObject({ net: { pence: 10000 }, reverseChargeVat: { pence: 1800 }, vatToSupplier: { pence: 0 }, gross: { pence: 10000 }, retained: { pence: 1000 }, expectedCash: { pence: 9000 } });
  expect((await request(a, input)).status).toBe(201);
  const conflict = await request(a, { ...input, book: { ...input.book, customerReference: "changed fictional party" } });
  expect(conflict.status).toBe(409); expect((await conflict.json()).code).toBe("CONFLICT");
  expect((await request(a)).status).toBe(200);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.vat_fixture_record WHERE tenant_id=$1", [a.member.tenantId])).rows[0].n).toBe(1);
  expect(await financialRows()).toEqual(before);
});
it("uses real current sessions and memberships; tenant and unknown-job refusals match", async () => {
  const a = await company(), b = await company(); await request(a, command(a));
  const foreign = await request(b, undefined, a.jobId), missing = await request(b, undefined, randomUUID());
  expect(foreign.status).toBe(404); expect(await foreign.json()).toEqual(await missing.json());
  for (const role of ["admin", "estimator", "foreman", "finance", "read_only"]) {
    await c.admin.query("UPDATE app.membership SET role=$1 WHERE tenant_id=$2 AND id=$3", [role, a.member.tenantId, a.member.id]);
    const directContext = await resolveVerifiedTenantContext(identity.provider, { ...a.session, tenantHeader: a.member.tenantId, origin }, origin);
    const input = command(a), direct = await new VatFixtureRepository(c.runtime).command(directContext, a.member.id, input).catch(error => error);
    const refused = await request(a, input); expect(refused.ok).toBe(false); expect((await refused.json()).code).toBe(direct.code);
  }
  await c.admin.query("UPDATE app.membership SET role='owner',revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [a.member.tenantId, a.member.id]);
  expect((await request(a, command(a))).status).toBe(403);
  await c.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1", [identity.provider.digest(`session:${b.session.sessionToken}`)]);
  expect((await request(b)).status).toBe(401); expect((await request(b, command(b))).status).toBe(401);
  const revoked = await company();
  await c.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [identity.provider.digest(`session:${revoked.session.sessionToken}`)]);
  expect((await request(revoked)).status).toBe(401);
});

it("GET permits owners/admins and denies other current roles without leaking VAT or record existence", async () => {
  const a = await company(), b = await company(); await request(a, command(a));
  const owner = await (await request(a)).json();
  for (const role of ["admin", "estimator", "foreman", "finance", "read_only"]) {
    await c.admin.query("UPDATE app.membership SET role=$1 WHERE tenant_id=$2 AND id=$3", [role, a.member.tenantId, a.member.id]);
    if (role === "admin") expect(await (await request(a)).json()).toEqual(owner);
    else for (const job of [a.jobId, randomUUID()]) {
      const response = await request(a, undefined, job); expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ version: "vat.fixture-error.v1", code: "FORBIDDEN", message: "You don't have permission." });
    }
  }
  // An owner in a different company cannot select this company's membership or records.
  const foreign = await request(b, undefined, a.jobId); expect(foreign.status).toBe(404);
  expect(JSON.stringify(await foreign.json())).not.toMatch(/fictional|vatNumber|records":/u);
  for (const state of ["revoked", "expired"]) {
    await c.admin.query("UPDATE app.membership SET role=$1,revoked_at=$2,expires_at=$3 WHERE tenant_id=$4 AND id=$5",
      [state === "revoked" ? "owner" : "admin", state === "revoked" ? new Date(0) : null,
        state === "expired" ? new Date(0) : null, a.member.tenantId, a.member.id]);
    const response = await request(a); expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toMatch(/fictional|vatNumber|records":/u);
  }
});
