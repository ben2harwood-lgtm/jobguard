import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { IdentityApplication } from "./auth/identity.application.js";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), read: vi.fn(), command: vi.fn(), list: vi.fn(), query: vi.fn() }));
vi.mock("./auth/principal-bridge.js", () => ({ resolveVerifiedTenantContext: mocks.resolve }));
vi.mock("@jobguard/db", async original => ({ ...await original<typeof import("@jobguard/db")>(),
  PayNowAttemptRepository: class { read = mocks.read; command = mocks.command; },
  PracticeInvoiceRepository: class { list = mocks.list; },
  withTenant: (_pool: unknown, _context: unknown, work: (db: unknown) => unknown) => work({ $client: { query: mocks.query } }),
}));
import { PayNowAttemptApplication, payNowAttemptFailure } from "./pay-now-attempt.application.js";
import { PayNowAttemptError } from "@jobguard/db";
const id = "11111111-1111-4111-8111-111111111111", commandId = "22222222-2222-4222-8222-222222222222";
const context = Object.freeze({ tenantId: id }), credentials = { sessionToken: "session" };
const authenticate = vi.fn(), findMembership = vi.fn();
const digest = vi.fn(() => "a".repeat(64));
const app = new PayNowAttemptApplication({ provider: { digest, authenticate, findMembership }, allowedOrigin: "https://practice.invalid" } as unknown as IdentityApplication, {} as Pool);
const invoice = { version: "pay-now.synthetic-invoice.v1", environment: "synthetic_demo", tenantId: id, jobId: id, invoiceId: id, revision: 1,
  balancePence: 100, currency: "GBP", kind: "final", builderAccount: `fake-builder-${id}`, includesCatch: false };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  authenticate.mockResolvedValue({ sessionId: id }); findMembership.mockResolvedValue({ role: "owner" });
  mocks.resolve.mockResolvedValue(context); mocks.list.mockResolvedValue([{ id, balancePence: 100 }]);
  mocks.read.mockResolvedValue({ synthetic: true, attempts: [] }); mocks.query.mockResolvedValue({ rows: [{ result: { invoice } }] });
});
afterEach(() => vi.unstubAllEnvs());
it("uses the verified context unchanged, session actor and strict server-bound command", async () => {
  await app.command(credentials, id, id, { commandId, rail: "card" });
  expect(mocks.command).toHaveBeenCalledWith(context, { jobId: id, sessionDigest: "a".repeat(64) }, { version: "pay-now-attempt.v1", invoiceId: id, commandId, rail: "card" });
  expect(digest).toHaveBeenCalledWith("session:session");
});
it.each(["balance", "balancePence", "account", "tenant", "actor", "invoiceId", "version"])("rejects forged %s", async field => {
  await expect(app.command(credentials, id, id, { commandId, rail: "card", [field]: id })).rejects.toThrow("INVALID_INPUT");
  expect(mocks.command).not.toHaveBeenCalled();
});
it("loads current stored options, checks GET's actor and clears options at zero balance", async () => {
  const view = await app.read(credentials, id, id);
  expect(view.balancePence).toBe(100); expect(view.options.map(row => row.rail)).toEqual(["bank_transfer", "card", "pay_by_bank"]);
  expect(findMembership).toHaveBeenCalledWith({ sessionId: id }, id);
  mocks.list.mockResolvedValue([{ id, balancePence: 0 }]);
  expect(await app.read(credentials, id, id)).toMatchObject({ balancePence: 0, options: [], attempts: [] });
});
it("does not read history after a refused owner/admin gate or authentication", async () => {
  findMembership.mockResolvedValueOnce({ role: "read_only" });
  await expect(app.read(credentials, id, id)).rejects.toThrow("FORBIDDEN"); expect(mocks.read).not.toHaveBeenCalled();
  mocks.resolve.mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
  await expect(app.command(credentials, id, id, { commandId, rail: "card" })).rejects.toThrow("UNAUTHENTICATED"); expect(mocks.command).not.toHaveBeenCalled();
});
it.each(["production", "pilot_no_charge", ""])("is not found in %s before authentication or storage", async mode => {
  vi.stubEnv("JOBGUARD_ENV", mode);
  await expect(app.read(credentials, id, id)).rejects.toThrow("NOT_FOUND");
  await expect(app.command(credentials, id, id, {})).rejects.toThrow("NOT_FOUND");
  expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.command).not.toHaveBeenCalled();
});
it("preserves repository not-found and conflict refusals", () => {
  expect(payNowAttemptFailure(new PayNowAttemptError("NOT_FOUND")).status).toBe(404);
  expect(payNowAttemptFailure(new PayNowAttemptError("ALREADY_ATTEMPTED")).status).toBe(409);
});
it.each(["estimator", "foreman", "operative", "finance", "read_only"])("refuses %s on GET before invoice access", async role => {
  findMembership.mockResolvedValue({ role });
  await expect(app.read(credentials, id, id)).rejects.toThrow("FORBIDDEN");
  expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
it("refuses an altered stored locator instead of rendering its options", async () => {
  mocks.query.mockResolvedValue({ rows: [{ result: { invoice: { ...invoice, tenantId: commandId } } }] });
  await expect(app.read(credentials, id, id)).rejects.toThrow("UNAVAILABLE");
  expect(mocks.read).not.toHaveBeenCalled();
});

it.each([["FORBIDDEN", 403], ["UNAUTHENTICATED", 401], ["UNAVAILABLE", 503]] as const)(
  "maps %s to %i without retry wording", (code, status) => {
    expect(payNowAttemptFailure(new PayNowAttemptError(code))).toEqual({
      status, body: { version: "pay-now-preview-error.v1", code },
    });
  });
it("refuses a session lost after context resolution before invoice access", async () => {
  authenticate.mockResolvedValue(null);
  await expect(app.read(credentials, id, id)).rejects.toThrow("UNAUTHENTICATED");
  expect(mocks.list).not.toHaveBeenCalled();
});
it.each(["METER_FORBIDDEN", "PAY_NOW_UNAUTHENTICATED", "private database fault"])(
  "classifies prepare failure %s", async message => {
    mocks.query.mockRejectedValue(new Error(message));
    expect(await app.read(credentials, id, id).catch(payNowAttemptFailure)).toMatchObject({
      status: message === "METER_FORBIDDEN" ? 403 : message === "PAY_NOW_UNAUTHENTICATED" ? 401 : 503,
    });
  });
