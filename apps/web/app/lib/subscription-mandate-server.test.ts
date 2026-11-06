import { createHmac } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { subscriptionAgreementHash, subscriptionAgreementText } from "@jobguard/core";
import { SubscriptionMandateError } from "@jobguard/db";
const state = vi.hoisted(() => ({ session: vi.fn(), authenticate: vi.fn(), findMembership: vi.fn(), read: vi.fn(), command: vi.fn(), credentials: {} as Record<string, string> }));
vi.mock("server-only", () => ({}));
vi.mock("./identity-server", () => ({ identityCredentials: async () => state.credentials,
  identityApplication: () => ({ allowedOrigin: "https://company.invalid", session: state.session,
    provider: { authenticate: state.authenticate, findMembership: state.findMembership,
      digest: (value: string) => createHmac("sha256", "fictional-preview-secret").update(value).digest("hex") } }) }));
vi.mock("./synthetic-server", () => ({ syntheticPool: () => ({}) }));
vi.mock("@jobguard/db", async importOriginal => ({ ...await importOriginal<typeof import("@jobguard/db")>(),
  SubscriptionMandateRepository: class { read = state.read; command = state.command; } }));
import { GET, POST } from "../api/subscription-mandate/route";
const tenant = "00000000-0000-4000-8000-000000000001";
const foreign = "00000000-0000-4000-8000-000000000002";
const commandId = "00000000-0000-4000-8000-000000000003";
const csrf = "c".repeat(24);
const authPrincipal = (sessionId: string, token: string) => Object.defineProperty(
  { identityUserId: tenant, sessionId, csrfToken: csrf }, "sessionCredential",
  { value: createHmac("sha256", "fictional-preview-secret").update(`session:${token}`).digest("hex") });
const session = () => ({ principal: { id: tenant, sessionId: commandId }, csrfToken: csrf, memberships: [{ id: tenant, tenantId: tenant, role: "owner" }] });
const request = (body?: unknown, headers = {}) => new Request("https://company.invalid/api/subscription-mandate", {
  ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }), headers: { origin: "https://company.invalid", ...headers },
});
async function approval() {
  const response = await GET(request());
  const value = await response.json();
  return { commandId, command: { version: "subscription-mandate-command.v1", kind: "approve", expectedSequence: value.sequence,
    selection: value.preview.selection, previewProof: value.preview.previewProof } };
}
beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://company.invalid");
  state.credentials = { sessionToken: "s".repeat(32), csrfToken: csrf, origin: "https://company.invalid" };
  state.session.mockResolvedValue(session());
  state.authenticate.mockImplementation(async (token: string) => token === "s".repeat(32) ? authPrincipal(commandId, token) : undefined);
  state.findMembership.mockResolvedValue({ id: tenant, tenantId: tenant, identityUserId: tenant, role: "owner" });
  state.read.mockResolvedValue({ record: null, reason: "NOT_APPROVED" });
  state.command.mockResolvedValue({ version: "subscription-mandate-result.v1", sequence: 1, state: "active", productionEnabled: false });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
describe("M4-13 session-only practice boundary", () => {
  it("reads no authority and binds the exact shown text and server hash", async () => {
    const result = await GET(request()); expect(result.headers.get("cache-control")).toBe("no-store");
    const answer = await result.json();
    expect(answer.snapshot).toEqual({ record: null, reason: "NOT_APPROVED", authorityCurrent: false });
    expect(answer.preview.selection).not.toHaveProperty("tenantId");
    const selection = { ...answer.preview.selection, tenantId: tenant };
    expect(answer.preview.termsText).toBe(subscriptionAgreementText(selection));
    expect(answer.preview.termsHash).toBe(subscriptionAgreementHash(selection));
    const input = { commandId, command: { version: "subscription-mandate-command.v1", kind: "approve", expectedSequence: 0,
      selection: answer.preview.selection, previewProof: answer.preview.previewProof } };
    const response = await POST(request(input)); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ termsHash: answer.preview.termsHash, productionEnabled: false });
    expect(state.command).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), expect.stringMatching(/^[a-f0-9]{64}$/u), commandId,
      { version: "subscription-mandate-command.v1", kind: "approve", expectedSequence: 0, selection });
  });
  it.each(["plan", "anchorDay", "recipientRef", "agreementId", "expiresAt"])("refuses an approval whose %s differs from the shown text", async field => {
    const input = await approval();
    input.command.selection[field] = field === "plan" ? "Builder" : field === "anchorDay" ? 2 : field === "expiresAt" ? "2027-01-01T00:00:00Z" : foreign;
    expect((await POST(request(input))).status).toBe(400); expect(state.command).not.toHaveBeenCalled();
  });
  it("does not let another company or session reuse the signed preview", async () => {
    const input = await approval();
    state.session.mockResolvedValue({ ...session(), memberships: [{ id: foreign, tenantId: foreign, role: "owner" }] });
    state.findMembership.mockResolvedValue({ id: foreign, tenantId: foreign, identityUserId: tenant, role: "owner" });
    expect((await POST(request(input))).status).toBe(400); expect(state.command).not.toHaveBeenCalled();
    state.session.mockResolvedValue(session()); state.credentials.sessionToken = "another-current-session".padEnd(32, "x");
    state.authenticate.mockResolvedValue(authPrincipal(foreign, state.credentials.sessionToken));
    expect((await POST(request(input))).status).toBe(400); expect(state.command).not.toHaveBeenCalled();
  });
  it.each(["paused", "renewal_failed", "superseded"])("refuses forged browser state %s", async kind => {
    expect((await POST(request({ commandId, command: { version: "subscription-mandate-command.v1", kind, expectedSequence: 0 } }))).status).toBe(400);
    expect(state.command).not.toHaveBeenCalled();
  });
  it.each(["tenantId", "actor", "price", "productionEnabled", "providerSettings", "termsText", "termsHash"])("refuses smuggled %s at each input level", async field => {
    const input = await approval();
    for (const value of [{ ...input, [field]: "forged" }, { ...input, command: { ...input.command, [field]: "forged" } },
      { ...input, command: { ...input.command, selection: { ...input.command.selection, [field]: "forged" } } }])
      expect((await POST(request(value))).status).toBe(400);
    expect(state.command).not.toHaveBeenCalled();
  });
  it("maps missing membership, stale sessions, non-owners and foreign tenant requests to the same not-found", async () => {
    const absent = { code: "NOT_FOUND" };
    for (const token of [undefined, "expired", "practice-cookie"]) {
      if (token) state.credentials.sessionToken = token; else delete state.credentials.sessionToken;
      const response = await GET(request()); expect(response.status).toBe(404); expect(await response.json()).toEqual(absent);
    }
    state.credentials.sessionToken = "s".repeat(32);
    state.session.mockResolvedValue({ ...session(), memberships: [{ ...session().memberships[0], role: "admin" }] });
    expect(await (await GET(request())).json()).toEqual(absent);
    state.session.mockResolvedValue(session()); state.findMembership.mockResolvedValue(undefined);
    expect(await (await GET(request())).json()).toEqual(absent);
    expect(await (await GET(request(undefined, { "x-tenant-id": foreign }))).json()).toEqual(absent);
    expect(state.read).not.toHaveBeenCalled();
  });
  it("refuses untrusted origins, forged host origins and missing or wrong CSRF", async () => {
    const input = await approval();
    expect((await POST(request(input, { origin: "https://evil.invalid", host: "evil.invalid", "x-forwarded-host": "evil.invalid" }))).status).toBe(404);
    for (const csrfToken of [undefined, "wrong"]) {
      if (csrfToken) state.credentials.csrfToken = csrfToken; else delete state.credentials.csrfToken;
      expect((await POST(request(input))).status).toBe(404);
    }
    expect(state.command).not.toHaveBeenCalled();
  });
  it.each(["production", "pilot", "unknown"])("returns not-found outside synthetic mode (%s)", async mode => {
    vi.stubEnv("JOBGUARD_ENV", mode);
    for (const response of [await GET(request()), await POST(request({ anything: true }))]) {
      expect(response.status).toBe(404); expect(await response.json()).toEqual({ code: "NOT_FOUND" });
    }
    expect(state.session).not.toHaveBeenCalled(); expect(state.command).not.toHaveBeenCalled();
  });
  it.each(["MANDATE_STALE", "MANDATE_COMMAND_CONFLICT", "MANDATE_NOTICE_REAUTHORISATION_REQUIRED"] as const)("preserves typed conflict %s", async code => {
    const input = await approval(); state.command.mockRejectedValue(new SubscriptionMandateError(code));
    const response = await POST(request(input)); expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code });
  });
  it.each(["revoked", "cancelled"])("never shows current authority after %s, even with a surviving approval", async kind => {
    state.read.mockResolvedValue({ sequence: 2, record: { state: kind, selection: { plan: "Builder" } }, authorityCurrent: true, providerCancellation: "pending" });
    const response = await GET(request()); expect((await response.json()).snapshot).toMatchObject({ authorityCurrent: false, providerCancellation: "pending" });
    expect((await POST(request({ commandId, command: { version: "subscription-mandate-command.v1", kind, expectedSequence: 1 } }))).status).toBe(200);
    expect(state.command).toHaveBeenCalledWith(expect.anything(), expect.any(String), commandId,
      { version: "subscription-mandate-command.v1", kind, expectedSequence: 1 });
  });
  it("does not leak internal failure details", async () => {
    state.read.mockRejectedValue(new Error("private database password"));
    const response = await GET(request()); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ version: "subscription-mandate-error.v1", code: "MANDATE_UNAVAILABLE" });
  });
});
