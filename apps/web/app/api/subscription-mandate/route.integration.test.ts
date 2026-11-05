import { createHmac, randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { SubscriptionMandateRepository } from "@jobguard/db";
import { resolveVerifiedTenantContext } from "@jobguard/api/identity";
import { subscriptionAgreementHash, subscriptionAgreementText } from "@jobguard/core";
import { createWorkFixture, closeWorkFixture, type WorkFixture } from "../../../../../packages/db/test/job-work-state-fixtures.js";
import { meterCompany } from "../../../../../packages/db/test/meter-persistence-fixtures.js";
const state = vi.hoisted(() => ({ identity: undefined as unknown, pool: undefined as unknown, token: "", csrf: "" }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/identity-server", () => ({ identityApplication: () => state.identity,
  identityCredentials: async (request: Request) => ({ sessionToken: state.token, csrfToken: state.csrf, origin: request.headers.get("origin") }) }));
vi.mock("../../lib/synthetic-server", () => ({ syntheticPool: () => state.pool }));
import { GET, POST } from "./route";
let fixture: WorkFixture;
let company: Awaited<ReturnType<typeof meterCompany>>;
const origin = "https://mandate.invalid";
const request = (body?: unknown) => new Request(`${origin}/api/subscription-mandate`, { headers: { origin },
  ...(body ? { method: "POST", body: JSON.stringify(body) } : {}) });
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", origin);
  fixture = await createWorkFixture(); state.pool = fixture.runtime;
}, 120000);
afterAll(async () => { vi.unstubAllEnvs(); await closeWorkFixture(fixture); });
async function prepare() {
  company = await meterCompany(fixture);
  state.token = randomUUID(); state.csrf = randomUUID();
  const userId = (await fixture.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [company.tenantId, company.actorId])).rows[0].identity_user_id as string;
  const digest = (value: string) => createHmac("sha256", "fictional-m413-test-secret").update(value).digest("hex");
  const sessionDigest = digest(`session:${state.token}`);
  await fixture.admin.query("UPDATE identity.session SET token_digest=$1,csrf_token=$2 WHERE id=$3", [sessionDigest, state.csrf, company.sessionId]);
  const principal = { identityUserId: userId, sessionId: company.sessionId, csrfToken: state.csrf };
  const membership = { id: company.actorId, tenantId: company.tenantId, identityUserId: userId, role: "owner", name: "Fictional owner" };
  // Authentication is a seam here; SQL re-authenticates the real persisted session and owner.
  const provider = { digest, authenticate: async () => principal, findMembership: async () => membership };
  state.identity = { provider, allowedOrigin: origin,
    session: async () => ({ principal: { id: userId, sessionId: company.sessionId }, csrfToken: state.csrf, memberships: [membership] }) };
  const context = await resolveVerifiedTenantContext(provider as never, { sessionToken: state.token,
    requestedTenantId: company.tenantId, csrfToken: state.csrf, origin }, origin);
  const shown = await (await GET(request())).json();
  const input = { commandId: randomUUID(), command: { version: "subscription-mandate-command.v1", kind: "approve",
    expectedSequence: 0, selection: shown.preview.selection, previewProof: shown.preview.previewProof } };
  return { input, shown, context, sessionDigest, repository: new SubscriptionMandateRepository(fixture.runtime) };
}
it("persists exactly the shown terms once, rejects stale sequences, and holds fresh approval without writes", async () => {
  const p = await prepare();
  expect(p.shown.snapshot).toMatchObject({ record: null, authorityCurrent: false });
  const response = await POST(request(p.input)); expect(response.status).toBe(200);
  const accepted = await response.json(); expect(await (await POST(request(p.input))).json()).toEqual(accepted);
  const snapshot = await p.repository.read(p.context, p.sessionDigest);
  expect(snapshot.record?.selection).toEqual({ ...p.shown.preview.selection, tenantId: company.tenantId });
  expect(snapshot.record?.termsHash).toBe(p.shown.preview.termsHash);
  expect(subscriptionAgreementText(snapshot.record?.selection)).toBe(p.shown.preview.termsText);
  expect(subscriptionAgreementHash(snapshot.record?.selection)).toBe(accepted.termsHash);
  const count = async () => (await fixture.admin.query("SELECT count(*)::int n FROM app.subscription_mandate_event WHERE tenant_id=$1", [company.tenantId])).rows[0].n;
  expect(await count()).toBe(1);
  const stale = await POST(request({ commandId: randomUUID(), command: { version: "subscription-mandate-command.v1", kind: "revoked", expectedSequence: 0 } }));
  expect(stale.status).toBe(409); expect(await stale.json()).toMatchObject({ code: "MANDATE_STALE" }); expect(await count()).toBe(1);
  const changed = await (await GET(new Request(`${origin}/api/subscription-mandate?plan=Builder`))).json();
  const replacement = await POST(request({ commandId: randomUUID(), command: { ...p.input.command, expectedSequence: 1,
    selection: changed.preview.selection, previewProof: changed.preview.previewProof } }));
  expect(replacement.status).toBe(409); expect(await replacement.json()).toMatchObject({ code: "MANDATE_NOTICE_REAUTHORISATION_REQUIRED" });
  expect(await count()).toBe(1);
}, 120_000);
it.each(["revoked", "cancelled"])("%s removes authority and internal preflight refuses future initiation", async kind => {
  const p = await prepare(); expect((await POST(request(p.input))).status).toBe(200);
  const input = { commandId: randomUUID(), command: { version: "subscription-mandate-command.v1", kind, expectedSequence: 1 } };
  const response = await POST(request(input)); expect(response.status).toBe(200);
  expect(await (await POST(request(input))).json()).toEqual(await response.json());
  expect((await (await GET(request())).json()).snapshot).toMatchObject({ authorityCurrent: false, record: { state: kind }, providerCancellation: "pending" });
  const record = (await p.repository.read(p.context, p.sessionDigest)).record!;
  expect(await p.repository.mayInitiate(p.context, p.sessionDigest, {
    version: "subscription-mandate-collection.v1", environment: "synthetic_demo", action: "renewal",
    recipientRef: record.selection.recipientRef, currentRevision: record.selection.revision, currentTermsHash: record.termsHash,
    billingMode: "paid", providerDefaultsDisabled: true, amountPence: 4900, reservedAndCollectedPeriodPence: 0,
  })).toMatchObject({ mayInitiate: false, productionEnabled: false, eligibleForSimulation: false, reason: kind.toUpperCase() });
}, 120_000);
it("SQL rejects a session expired after the identity seam without revealing a record", async () => {
  await prepare(); await fixture.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [company.sessionId]);
  const response = await GET(request()); expect(response.status).toBe(404); expect(await response.json()).toEqual({ code: "NOT_FOUND" });
}, 120_000);
