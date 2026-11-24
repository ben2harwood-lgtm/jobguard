import { afterEach, beforeEach, expect, it, vi } from "vitest";

const sources = vi.fn(), session = vi.fn();
vi.mock("@jobguard/db", async original => ({ ...(await original<typeof import("@jobguard/db")>()), VariationRegisterRepository: class { sources = sources; } }));
vi.mock("./practice-access.js", () => ({ PracticeAccess: class { session = session; } }));
const { VariationRegisterApplication, variationRegisterFailure } = await import("./variation-register.application.js");
const job = "11111111-1111-4111-8111-111111111111";
const row = { jobId: job, jobTitle: "Fictional kitchen", variationId: "22222222-2222-4222-8222-222222222222", createdAt: "2026-11-01T09:00:00.000Z", description: "Fictional extra",
  revision: { id: "33333333-3333-4333-8333-333333333333", number: 1, description: "Fictional extra", signedDeltaPence: "12345", createdAt: "2026-11-18T10:00:00.000Z" }, approvedAt: null, rejectedAt: null };

beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); session.mockResolvedValue({ context: { tenantId: "t" }, digest: "d" }); sources.mockResolvedValue([row]); });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("defaults to the latest closed week and reads only this session's jobs", async () => {
  const app = new VariationRegisterApplication({} as never, "session", () => new Date("2026-11-24T12:00:00.000Z"));
  const register = await app.read();
  expect(register).toMatchObject({ week: { friday: "2026-11-20" }, totals: { pendingPence: "12345" }, readAt: "2026-11-24T12:00:00.000Z" });
  expect(sources).toHaveBeenCalledWith({ tenantId: "t" }, "d", { friday: "2026-11-20", opensAt: "2026-11-13T18:00:00.000Z", closesAt: "2026-11-20T18:00:00.000Z" });
  const { bytes } = await app.pdf({ week: "2026-11-20" });
  expect(new TextDecoder().decode(bytes)).toContain("GBP 123.45");
});
it("refuses bad queries, an open week and pilot mode before reading", async () => {
  const app = new VariationRegisterApplication({} as never, "session", () => new Date("2026-11-20T17:00:00.000Z"));
  await expect(app.read({ week: "2026-11-19" })).rejects.toMatchObject({ code: "INVALID_JOB_SOURCE_INPUT" });
  await expect(app.read({ friday: "2026-11-20" })).rejects.toMatchObject({ code: "INVALID_JOB_SOURCE_INPUT" });
  const open = await app.read({ week: "2026-11-20" }).catch(error => error);
  expect(variationRegisterFailure(open)).toMatchObject({ status: 404, body: { code: "REGISTER_WEEK_NOT_CLOSED" } });
  expect(sources).not.toHaveBeenCalled();
  vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
  expect(() => new VariationRegisterApplication({} as never, "session")).toThrow();
});
