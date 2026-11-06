import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { StoredAccountingExportError } from "@jobguard/db";
import { AccountingExportApplication, accountingExportFailure } from "./accounting-export.application.js";
import { AccountingExportSandbox } from "./accounting-export.sandbox.js";
import { FakeCodatAdapter } from "./accounting-export.fake.js";
import { ctx, source, scope, consent } from "./accounting-export.test-fixtures.js";

const tenant = "00000000-0000-4000-8000-000000000001";
const credentials = { sessionToken: "s".repeat(32), csrfToken: "c".repeat(24), tenantHeader: tenant, origin: "https://company.invalid" };
const authenticate = vi.fn(), findMembership = vi.fn(), execute = vi.fn(), routeChangeRead = vi.fn(), routeChangeConfirm = vi.fn();
const app = new AccountingExportApplication({ allowedOrigin: credentials.origin,
  provider: { authenticate, findMembership, digest: () => "a".repeat(64) } } as never, { execute, routeChangeRead, routeChangeConfirm });
let preview: ReturnType<AccountingExportSandbox["preview"]>;
const approval = () => ({ version: 1, decisionId: "00000000-0000-4000-8000-000000000003", previewHash: preview.previewHash,
  expiresAt: new Date(Date.now() + 300000).toISOString(), humanConfirmed: true });
const status = (state = "pending") => ({ version: 1, sourceId: source.sourceId, reference: "b".repeat(64),
  previewHash: preview.previewHash, artifact: preview.artifact, status: state, attemptId: null, attempts: 0, externalId: null, qualifyingRecoveryProof: false });
beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  authenticate.mockResolvedValue({ identityUserId: tenant, sessionId: tenant, csrfToken: credentials.csrfToken, sessionCredential: "a".repeat(64) });
  findMembership.mockImplementation(async (_: unknown, id: string) => id === tenant ? { id: tenant, tenantId: tenant, identityUserId: tenant, role: "owner" } : undefined);
  const tenantId = `demo-${tenant}`;
  preview = new AccountingExportSandbox(new FakeCodatAdapter(), [{ ...source, tenantId }], [{ ...consent, tenantId }], true)
    .preview({ ...ctx, tenantId }, { ...scope, tenantId, mapping: { ...scope.mapping, tenantId } }, 100);
  execute.mockImplementation(async (_c, _d, op) => op === "preview" ? { version: 1, artifact: preview.artifact, previewHash: preview.previewHash } : status());
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
it("binds the exact hash, verified context and session digest; replay uses identical Decision bytes", async () => {
  const input = approval();
  for (let i = 0; i < 2; i++) expect(await app.execute(credentials, source.sourceId, "approve", input)).toMatchObject({ status: "pending" });
  const calls = execute.mock.calls.filter(c => c[2] === "approve");
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual([expect.objectContaining({ tenantId: tenant }), "a".repeat(64), "approve", source.sourceId, input]);
  expect(calls[1]).toEqual(calls[0]);
});
it("changed source revision needs a new approval; no caller-supplied artifact or tenant is accepted", async () => {
  const old = approval(); preview.artifact.source.revision++; preview.artifact.scope.sourceRevision++; preview.artifact.target.sourceRevision++;
  preview.previewHash = "c".repeat(64);
  await expect(app.execute(credentials, source.sourceId, "approve", old)).rejects.toThrow("EXPORT_APPROVAL_REQUIRED");
  await expect(app.execute(credentials, source.sourceId, "approve", { ...approval(), artifact: preview.artifact, tenantId: tenant })).rejects.toThrow("EXPORT_INVALID_INPUT");
  expect(execute.mock.calls.some(c => c[2] === "approve")).toBe(false);
});
it("preserves SQL's stale-approval rejection if a source changes between preview and approval", async () => {
  execute.mockImplementation(async (_c, _d, op) => {
    if (op === "approve") throw new StoredAccountingExportError("EXPORT_APPROVAL_REQUIRED");
    return { version: 1, artifact: preview.artifact, previewHash: preview.previewHash };
  });
  await expect(app.execute(credentials, source.sourceId, "approve", approval())).rejects.toThrow("EXPORT_APPROVAL_REQUIRED");
});
it.each(["tax", "object", "mapping"])("refuses unsupported %s before approval", async field => {
  if (field === "tax") preview.artifact.source.tax = "unsupported";
  if (field === "object") (preview.artifact.target as { objectType: string }).objectType = "supplier_bill";
  if (field === "mapping") preview.artifact.scope.mapping.tax = "standard";
  await expect(app.execute(credentials, source.sourceId, "approve", approval())).rejects.toThrow("EXPORT_UNSUPPORTED_MAPPING");
  expect(execute.mock.calls.some(c => c[2] === "approve")).toBe(false);
});
it("refuses another tenant's source even if a repository accidentally returns it", async () => {
  preview.artifact.source.tenantId = "demo-other";
  await expect(app.execute(credentials, source.sourceId, "preview")).rejects.toThrow("EXPORT_FORBIDDEN");
});
it.each(["outcome_unknown", "external_edit", "duplicate_import", "reference_conflict", "confirmed_absent", "pushed"])("reads %s without claiming, retrying or importing paid proof", async state => {
  execute.mockResolvedValue(status(state));
  expect(await app.execute(credentials, source.sourceId, "read")).toMatchObject({ status: state, qualifyingRecoveryProof: false });
  expect(execute.mock.calls.map(c => c[2])).toEqual(["read"]);
});
it("refuses missing/revoked sessions, CSRF, hostile origins and unverified tenants before repository access", async () => {
  for (const request of [{ ...credentials, sessionToken: undefined }, { ...credentials, csrfToken: "wrong" },
    { ...credentials, origin: "https://other.invalid" }, { ...credentials, tenantHeader: "00000000-0000-4000-8000-000000000002" }]) {
    await expect(app.execute(request, source.sourceId, "preview")).rejects.toThrow();
  }
  authenticate.mockResolvedValue(undefined);
  await expect(app.execute(credentials, source.sourceId, "read")).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
});
it("rechecks membership, stays dark in production and redacts unknown failures", async () => {
  await app.execute(credentials, source.sourceId, "preview"); execute.mockClear(); findMembership.mockResolvedValue(undefined);
  await expect(app.execute(credentials, source.sourceId, "read")).rejects.toThrow();
  vi.stubEnv("JOBGUARD_ENV", "production");
  await expect(app.execute(credentials, source.sourceId, "preview")).rejects.toThrow("EXPORT_FORBIDDEN");
  expect(execute).not.toHaveBeenCalled();
  expect(accountingExportFailure(new Error("private SQL detail")).body.code).toBe("EXPORT_UNAVAILABLE");
});

const routeApproval = () => ({ ...approval(), commandId: "00000000-0000-4000-8000-000000000004" });
function routePreview() {
 return { version: 1, previewHash: preview.previewHash, artifact: { version: 1, scope: preview.artifact.scope,
  from: "codat", to: "xero", connectionRevision: 2, consentRevision: 1, entries: [] } };
}
it("route read and confirm bind verified context, current actor and exact server scope; unknown responses retry identically", async () => {
 const proposed = routePreview(), input = routeApproval();
 routeChangeRead.mockResolvedValue({ version: 1, proposal: proposed, confirmed: null, history: [] });
 const result = { ...proposed, commandId: input.commandId, decisionId: input.decisionId, actorId: tenant, revision: 1 };
 routeChangeConfirm.mockResolvedValue(result);
 expect(await app.routeChange(credentials, source.sourceId, "read")).toMatchObject({ proposal: proposed });
 for (let i = 0; i < 2; i++) expect(await app.routeChange(credentials, source.sourceId, "confirm", input)).toEqual(result);
 expect(routeChangeConfirm.mock.calls[0]).toEqual([expect.objectContaining({ tenantId: tenant }), "a".repeat(64), source.sourceId,
  { scope: proposed.artifact.scope, from: "codat", to: "xero", connectionRevision: 2, consentRevision: 1, ...input, action: "accounting_export.route", status: "approved", tenantId: `demo-${tenant}` }, tenant]);
 expect(routeChangeConfirm.mock.calls[1]).toEqual(routeChangeConfirm.mock.calls[0]);
 routeChangeRead.mockResolvedValue({ version: 1, proposal: null, confirmed: result, history: [result] });
 expect(await app.routeChange(credentials, source.sourceId, "confirm", input)).toEqual(result);
 expect(routeChangeConfirm.mock.calls[2]).toEqual(routeChangeConfirm.mock.calls[0]);
});
it("route boundary refuses supplied authority, stale hashes and roles without export permission", async () => {
 routeChangeRead.mockResolvedValue({ version: 1, proposal: routePreview(), confirmed: null, history: [] });
 for (const extra of [{ actorId: tenant }, { tenantId: tenant }, { scope: preview.artifact.scope }, { sessionToken: "forged" }])
  await expect(app.routeChange(credentials, source.sourceId, "confirm", { ...routeApproval(), ...extra })).rejects.toThrow("EXPORT_INVALID_INPUT");
 await expect(app.routeChange(credentials, source.sourceId, "confirm", { ...routeApproval(), previewHash: "f".repeat(64) })).rejects.toThrow("EXPORT_APPROVAL_REQUIRED");
 await expect(app.routeChange(credentials, source.sourceId, "read", { actorId: tenant })).rejects.toThrow("EXPORT_INVALID_INPUT");
 findMembership.mockResolvedValue({ id: tenant, tenantId: tenant, identityUserId: tenant, role: "read_only" });
 await expect(app.routeChange(credentials, source.sourceId, "read")).rejects.toThrow("EXPORT_FORBIDDEN");
 expect(routeChangeConfirm).not.toHaveBeenCalled();
});
it("route boundary preserves database refusals and stays synthetic only", async () => {
 for (const code of ["EXPORT_NOT_FOUND", "EXPORT_STALE_REVISION", "EXPORT_CONSENT_EXPIRED", "EXPORT_RECONCILE_REQUIRED"]) {
  routeChangeRead.mockRejectedValue(new StoredAccountingExportError(code));
  await expect(app.routeChange(credentials, source.sourceId, "read")).rejects.toThrow(code);
 }
 routeChangeRead.mockClear(); vi.stubEnv("JOBGUARD_ENV", "production");
 await expect(app.routeChange(credentials, source.sourceId, "read")).rejects.toThrow("EXPORT_FORBIDDEN");
 expect(routeChangeRead).not.toHaveBeenCalled();
});
