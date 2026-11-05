import { beforeEach, expect, it, vi } from "vitest";
import { electManagedRecovery, previewManagedRecoveryInvoice, MANAGED_RECOVERY_TERMS, type ManagedRecoveryState } from "@jobguard/core";
const mocks = vi.hoisted(() => ({ session: vi.fn(), credentials: vi.fn(), resolve: vi.fn(), elect: vi.fn(), preview: vi.fn(), digest: vi.fn(), construct: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@jobguard/api/identity", () => ({ resolveVerifiedTenantContext: mocks.resolve }));
vi.mock("@jobguard/db", () => ({ ManagedRecoveryRepository: class {
  constructor(...args: unknown[]) { mocks.construct(...args); }
  elect = mocks.elect; preview = mocks.preview;
} }));
vi.mock("./identity-server", () => ({ identityCredentials: mocks.credentials,
  identityApplication: () => ({ session: mocks.session, allowedOrigin: "https://practice.invalid", provider: { digest: mocks.digest } }) }));
vi.mock("./synthetic-server", () => ({ syntheticPool: () => "pool" }));
import { managedRecoveryRequest } from "./managed-recovery-server";
const id = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const params = { id: id(2), caseId: id(3) };
const actor = { membershipId: id(4), identityUserId: id(5) };
const member = { id: actor.membershipId, tenantId: id(1), role: "owner" };
const command = { version: "managed-recovery-election-command.v1", commandId: id(6), caseId: params.caseId,
  termsVersion: MANAGED_RECOVERY_TERMS, selection: { service: "drafted_for_you", points: 5 } };
const authority = { environment: "synthetic_demo", tenantId: id(1), jobId: params.id, caseId: params.caseId,
  actorMembershipId: actor.membershipId, canApprove: true, now: "2026-11-04T09:00:00Z" };
let state: ManagedRecoveryState;
function request(raw?: unknown, origin = "https://practice.invalid") {
  return new Request("https://practice.invalid/api/choice", raw === undefined ? {} : {
    method: "POST", headers: { origin, "x-tenant-id": id(99), "x-actor-id": id(99) }, body: JSON.stringify(raw),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://practice.invalid");
  state = { version: "managed-recovery-state.v1", environment: "synthetic_demo", tenantId: id(1),
    jobId: params.id, caseId: params.caseId, election: null, pursuitStartedAt: null };
  mocks.credentials.mockResolvedValue({ sessionToken: "signed-in", tenantHeader: id(99), csrfToken: "caller-supplied" });
  mocks.session.mockResolvedValue({ principal: { id: actor.identityUserId }, csrfToken: "session-csrf", memberships: [member] });
  mocks.resolve.mockResolvedValue({ tenantId: id(1) }); mocks.digest.mockReturnValue("a".repeat(64));
  // Real pure policy with an in-memory persistence double, not PostgreSQL evidence.
  mocks.elect.mockImplementation(async (_context, _job, raw) => { state = electManagedRecovery(state, raw, authority); return state; });
  mocks.preview.mockImplementation(async () => previewManagedRecoveryInvoice(state, {
    version: "managed-recovery-invoice-preview.v1", environment: "synthetic_demo", tenantId: id(1), jobId: params.id,
    caseId: params.caseId, cumulativeQualifyingPrincipal: { numerator: "32000", denominator: "1" },
  }));
});
it("delegates a session-bound preview, with no choice and no service charge line", async () => {
  const response = await managedRecoveryRequest(request(), params);
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
  const result = await response.json();
  expect(result.preview.serviceChargeInvoice).toBeNull(); expect(result.serviceChargeAmount).toBeNull();
  expect(result.choices.map((c: { label: string }) => c.label)).toEqual(["+5 points: drafted for you", "+10 points: a solicitor letter"]);
  expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), { sessionToken: "signed-in", requestedTenantId: id(1), csrfToken: "session-csrf", origin: "https://practice.invalid" }, "https://practice.invalid");
  expect(mocks.construct).toHaveBeenCalledWith("pool", "a".repeat(64));
  expect(mocks.preview).toHaveBeenCalledWith({ tenantId: id(1) }, params.id, params.caseId, actor);
  expect(mocks.elect).not.toHaveBeenCalled();
});
it("binds case/points/terms, keeps success fee identical, replays once and refuses changed-body replay", async () => {
  const before = await (await managedRecoveryRequest(request(), params)).json();
  const elected = await (await managedRecoveryRequest(request(command), params, true)).json();
  expect(mocks.elect).toHaveBeenLastCalledWith({ tenantId: id(1) }, params.id, command, actor);
  expect(elected.preview.successFee).toEqual(before.preview.successFee);
  expect(state.election).toMatchObject({ caseId: params.caseId, tenantId: id(1), termsVersion: MANAGED_RECOVERY_TERMS, selection: command.selection });
  expect(elected.serviceChargeAmount).toBe("£16.00");
  const hash = state.election!.bindingHash;
  expect((await managedRecoveryRequest(request(command), params, true)).status).toBe(200);
  expect(state.election!.bindingHash).toBe(hash);
  const changed = await managedRecoveryRequest(request({ ...command, selection: { service: "solicitor_letter", points: 10 } }), params, true);
  expect(changed.status).toBe(409); expect((await changed.json()).code).toBe("MANAGED_RECOVERY_CONFLICT");
});
it("reports pursuit refusal in plain words without making an election", async () => {
  state.pursuitStartedAt = authority.now;
  const response = await managedRecoveryRequest(request(command), params, true);
  expect(response.status).toBe(409); expect((await response.json()).message).toContain("Pursuit has already started");
  expect(state.election).toBeNull();
});
it.each(["tenantId", "actor", "actorMembershipId", "price", "status"])("refuses caller %s, even with an otherwise valid body", async field => {
  const response = await managedRecoveryRequest(request({ ...command, [field]: id(99) }), params, true);
  expect(response.status).toBe(400); expect(mocks.elect).not.toHaveBeenCalled();
});
it.each([{ selection: { service: "drafted_for_you", points: 10 } }, { termsVersion: "changed" }, { caseId: id(99) }])("refuses altered binding %j", async patch => {
  expect((await managedRecoveryRequest(request({ ...command, ...patch }), params, true)).status).toBe(400);
  expect(mocks.elect).not.toHaveBeenCalled();
});
it("gives identical not-found for other tenant, unknown case and refused role", async () => {
  const hidden = [];
  for (const caseId of [id(98), id(99)]) {
    mocks.preview.mockRejectedValueOnce({ code: "MANAGED_RECOVERY_FORBIDDEN", message: "private data" });
    const response = await managedRecoveryRequest(request(), { ...params, caseId });
    expect(response.status).toBe(404); hidden.push(await response.json());
  }
  mocks.session.mockResolvedValue({ principal: { id: actor.identityUserId }, memberships: [{ ...member, role: "finance" }] });
  const response = await managedRecoveryRequest(request(), params);
  expect(response.status).toBe(404); expect(await response.json()).toEqual(hidden[0]); expect(hidden[1]).toEqual(hidden[0]);
});
it("refuses missing or ambiguous sessions and hides all other environments before authentication", async () => {
  for (const memberships of [[], [member, { ...member, tenantId: id(99) }]]) {
    mocks.session.mockResolvedValue({ memberships });
    expect((await managedRecoveryRequest(request(), params)).status).toBe(404);
  }
  mocks.session.mockRejectedValueOnce({ code: "UNAUTHENTICATED" });
  expect((await managedRecoveryRequest(request(), params)).status).toBe(404);
  mocks.session.mockClear();
  for (const env of ["pilot_no_charge", "production", "test", ""]) {
    vi.stubEnv("JOBGUARD_ENV", env);
    expect((await managedRecoveryRequest(request(command), params, true)).status).toBe(404);
  }
  expect(mocks.session).not.toHaveBeenCalled();
});
it("requires trusted browser origin before authentication or body access", async () => {
  for (const origin of ["", "https://evil.invalid", "null"]) {
    expect((await managedRecoveryRequest(request(command, origin), params, true)).status).toBe(403);
  }
  expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.elect).not.toHaveBeenCalled();
});
it("refuses malformed JSON and redacts unknown failures with no-store", async () => {
  const malformed = new Request("https://practice.invalid/", { method: "POST", headers: { origin: "https://practice.invalid" }, body: "{" });
  expect((await managedRecoveryRequest(malformed, params, true)).status).toBe(400);
  mocks.preview.mockRejectedValueOnce(new Error("secret database detail"));
  const response = await managedRecoveryRequest(request(), params);
  expect(response.status).toBe(503); expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(JSON.stringify(await response.json())).not.toContain("secret");
});
