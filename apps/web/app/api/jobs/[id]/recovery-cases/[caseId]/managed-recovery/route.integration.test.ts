// CI-only PostgreSQL proof. Authentication composition is covered separately by
// identity/context guards; here the session fixture supplies a real stamped context.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { cluster, fixture, newCase, command, start, counts, qualifyingAllocation, type Cluster, type Fixture } from "../../../../../../../../../packages/db/test/managed-recovery-fixtures";
const boundary = vi.hoisted(() => ({ session: vi.fn(), resolve: vi.fn(), digest: vi.fn(), pool: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@jobguard/api/identity", () => ({ resolveVerifiedTenantContext: boundary.resolve }));
vi.mock("../../../../../../lib/identity-server", () => ({
  identityCredentials: async () => ({ sessionToken: "fixture-token" }),
  identityApplication: () => ({ session: boundary.session, provider: { digest: boundary.digest }, allowedOrigin: "https://practice.invalid" }),
}));
vi.mock("../../../../../../lib/synthetic-server", () => ({ syntheticPool: boundary.pool }));
import { GET, POST } from "./route";
let c: Cluster;
function session(f: Fixture, role = "owner") {
  boundary.resolve.mockResolvedValue(f.context); boundary.digest.mockReturnValue(f.sessionDigest);
  boundary.session.mockResolvedValue({ principal: { id: f.actor.identityUserId }, csrfToken: "synthetic-csrf",
    memberships: [{ id: f.actor.membershipId, tenantId: f.tenant, role }] });
}
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://practice.invalid");
  c = await cluster(); boundary.pool.mockReturnValue(c.runtime);
}, 120_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
it("routes a no-charge preview, exact election and replay; refuses late, forged and cross-tenant choices", async () => {
  const f = await fixture(c), other = await fixture(c), caseId = await newCase(c, f);
  await qualifyingAllocation(c, f, caseId);
  const params = { params: Promise.resolve({ id: f.job, caseId }) };
  const read = () => GET(new Request("https://practice.invalid/"), params);
  const post = (raw: unknown) => POST(new Request("https://practice.invalid/", { method: "POST",
    headers: { origin: "https://practice.invalid" }, body: JSON.stringify(raw) }), params);
  session(f);
  const before = await (await read()).json(); expect(before.preview.serviceChargeInvoice).toBeNull();
  const input = command(caseId), priorCounts = await counts(c);
  const chosen = await post(input); expect(chosen.status).toBe(200);
  const after = await chosen.json(); expect(after.preview.successFee).toEqual(before.preview.successFee);
  expect(after.preview.serviceChargeInvoice).toMatchObject({ points: 5, termsVersion: input.termsVersion, principal: { pence: 1600 } });
  const replay = await post(input); expect(replay.status).toBe(200);
  expect((await replay.json()).preview).toEqual(after.preview);
  expect((await counts(c)).managed_recovery_election - priorCounts.managed_recovery_election).toBe(1);
  expect((await post({ ...input, selection: { service: "solicitor_letter", points: 10 } })).status).toBe(409);
  for (const patch of [{ actor: f.actor }, { tenantId: f.tenant }, { price: 1 }, { status: "approved" }])
    expect((await post({ ...input, ...patch })).status).toBe(400);
  session(other);
  const cross = await read(); expect(cross.status).toBe(404); const hidden = await cross.json();
  const crossPost = await post(input); expect(crossPost.status).toBe(404); expect(await crossPost.json()).toEqual(hidden);
  session(f, "finance"); const role = await read(); expect(role.status).toBe(404); expect(await role.json()).toEqual(hidden);
  session(f);
  const missing = await GET(new Request("https://practice.invalid/"), { params: Promise.resolve({ id: f.job, caseId: randomUUID() }) });
  expect(missing.status).toBe(404); expect(await missing.json()).toEqual(hidden);
  const late = await newCase(c, f); await start(c, f, late);
  const refused = await POST(new Request("https://practice.invalid/", { method: "POST", headers: { origin: "https://practice.invalid" },
    body: JSON.stringify(command(late)) }), { params: Promise.resolve({ id: f.job, caseId: late }) });
  expect(refused.status).toBe(409); expect((await refused.json()).message).toContain("Pursuit has already started");
  expect((await counts(c)).managed_recovery_election - priorCounts.managed_recovery_election).toBe(1);
}, 120_000);
