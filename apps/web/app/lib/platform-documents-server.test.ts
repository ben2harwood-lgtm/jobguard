import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AuthError } from "@jobguard/api/identity";
import { PlatformInvoiceError, issuePlatformInvoiceFixture, platformInvoiceAccountFixture } from "@jobguard/core";
const s = vi.hoisted(() => ({ session: vi.fn(), authenticate: vi.fn(), findMembership: vi.fn(), read: vi.fn(), token: "s".repeat(32) }));
vi.mock("server-only", () => ({}));
vi.mock("./identity-server", () => ({ identityCredentials: async () => ({ sessionToken: s.token }),
  identityApplication: () => ({ allowedOrigin: "https://company.invalid", session: s.session,
    provider: { authenticate: s.authenticate, findMembership: s.findMembership, digest: () => "a".repeat(64) } }) }));
vi.mock("./synthetic-server", () => ({ syntheticPool: () => ({}) }));
vi.mock("@jobguard/db", async original => ({ ...await original<typeof import("@jobguard/db")>(), PlatformInvoiceReadRepository: class { read = s.read; } }));
import { GET } from "../api/plans/platform-documents/route";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const membership = { id: id(2), tenantId: id(1), identityUserId: id(3), role: "owner" };
const request = (suffix = "", headers = {}) => new Request(`https://company.invalid/api/plans/platform-documents${suffix}`, { headers });
const ref = (n: number) => ({ tenantId: id(1), id: id(n), hash: "a".repeat(64) });
function fixture(kind: "subscription" | "success_fee" = "subscription") {
  const profile = { version: "platform-invoice-profile.v1", tenantId: id(1), issuerId: id(4), name: "JobGuard fictional issuer",
    address: "Fictional address — simulation only", vatRegistration: "SIMULATION-NOT-REGISTERED", environment: "synthetic_demo" };
  const raw = { version: "platform-invoice-request.v1", environment: "synthetic_demo", commandId: id(5), tenantId: id(1), issuerId: id(4), actorMembershipId: id(2),
    kind: "invoice", originalNumber: null, taxPolicy: "D02-pending-approval-example", lines: [{ id: id(6), principalPence: 2900, sourcePrincipalPence: 2900, taxPence: 580,
      provenance: { kind: "subscription", statement: ref(7), approval: ref(8), period: "2026-09", policyVersion: "subscription_pricing_policy_v4" } }] };
  if (kind === "success_fee") Object.assign(raw.lines[0]!, { principalPence: 18800, sourcePrincipalPence: 18800, taxPence: 3760, provenance: { kind, statement: ref(7), derivation: ref(11), proof: ref(12), approval: ref(8), finalAccountLock: ref(13), policyVersion: "reference_fee_policy_v3", proofState: "verified", disclosedBeforeLock: false, builderCaptured: false, priorSettlements: [ref(14)] } });
  const invoice = issuePlatformInvoiceFixture(profile, raw, []);
  const credit = issuePlatformInvoiceFixture(profile, { ...raw, commandId: id(9), kind: "credit_note", originalNumber: invoice.number }, [invoice]);
  return { invoice, credits: [credit] };
}
beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); s.token = "s".repeat(32);
  s.session.mockResolvedValue({ memberships: [membership], csrfToken: "c".repeat(24) });
  s.authenticate.mockResolvedValue({ identityUserId: id(3), sessionId: id(10), csrfToken: "c".repeat(24) });
  s.findMembership.mockResolvedValue(membership); s.read.mockResolvedValue([]);
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
it("projects D02 fixture balances, linked credits and provenance without stored private extras", async () => {
  const f = fixture();
  Object.assign(f.invoice = structuredClone(f.invoice), { bankDetails: "secret", hidden: "secret" });
  s.read.mockResolvedValue([f]);
  const response = await GET(request()); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json(); expect(body.documents[0].account).toEqual(platformInvoiceAccountFixture(f.invoice, f.credits, 0));
  expect(body.documents[0].credits[0].number).toBe("SIM-PLATFORM-2");
  expect(body.documents[0].invoice.lines[0].references).toContainEqual({ name: "approval", id: id(8), hash: "a".repeat(64) });
  expect(JSON.stringify(body)).not.toMatch(/bankDetails|hidden|secret/);
  expect(body.collectionStarted).toBe(false);
  expect(s.read).toHaveBeenCalledWith(expect.objectContaining({ tenantId: id(1) }), "a".repeat(64));
});
it.each(["missing", "bad", "expired"])("returns 401 for %s sessions rather than 503", async kind => {
  if (kind === "missing") s.token = "";
  else s.session.mockRejectedValue(new AuthError("UNAUTHENTICATED"));
  expect((await GET(request())).status).toBe(401); expect(s.read).not.toHaveBeenCalled();
});
it.each(["admin", "revoked", "removed"])("refuses %s membership", async kind => {
  if (kind === "admin") s.session.mockResolvedValue({ memberships: [{ ...membership, role: "admin" }] });
  else if (kind === "revoked") s.session.mockResolvedValue({ memberships: [] });
  else s.findMembership.mockResolvedValue(undefined);
  expect([401, 403]).toContain((await GET(request())).status); expect(s.read).not.toHaveBeenCalled();
});
it("refuses a membership revoked between authentication and the database read", async () => {
  s.read.mockRejectedValue(new PlatformInvoiceError("PLATFORM_INVOICE_FORBIDDEN"));
  expect((await GET(request())).status).toBe(403);
});
it("never accepts browser tenant selection or practice mode outside synthetic", async () => {
  expect((await GET(request("?tenantId=" + id(9)))).status).toBe(400);
  expect((await GET(request("", { "x-tenant-id": id(9) }))).status).toBe(400);
  vi.stubEnv("JOBGUARD_ENV", "production"); expect((await GET(request())).status).toBe(404);
  expect(s.read).not.toHaveBeenCalled();
});
it("reports genuine infrastructure failures as 503", async () => {
  s.read.mockRejectedValue(new Error("db unavailable")); expect((await GET(request())).status).toBe(503);
});

it("rejects malformed cookie values before the identity lookup", async () => {
  s.token = "bad"; expect((await GET(request())).status).toBe(401); expect(s.session).not.toHaveBeenCalled();
});

it("never offsets a credited subscription against a fee document and preserves its proof references", async () => {
  const subscription = fixture(), fee = fixture("success_fee");
  s.read.mockResolvedValue([subscription, { ...fee, credits: [] }]);
  const response = await GET(request()); const body = await response.json();
  expect(body.documents.map((d: { account: { grossPence: number } }) => d.account.grossPence)).toEqual([0, 22560]);
  expect(body.documents[1].account.remainingCashDuePence).toBe(22560);
  expect(body.documents[1].invoice.lines[0].kind).toBe("success_fee");
  expect(body.documents[1].invoice.lines[0].references.map((r: { name: string }) => r.name)).toContain("priorSettlements");
});
