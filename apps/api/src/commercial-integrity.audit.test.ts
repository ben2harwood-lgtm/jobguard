import { afterEach, describe, expect, it, vi } from "vitest";

// Application/process isolation test only. Real persistence is covered by the
// supplementary PostgreSQL suite; this seam does not prove RLS or durability.
const store = vi.hoisted(() => ({ feedback: [] as Record<string, unknown>[] }));
vi.mock("./practice-access.js", () => ({ PracticeAccess: class {
  async job() { return { context: {}, membershipId: "owner", digest: "synthetic" }; }
} }));
vi.mock("@jobguard/db", async importOriginal => ({
  ...await importOriginal<object>(),
  CommercialIntegrityApplicationRepository: class {
    async read(_context: unknown, jobId: string) {
      return {
        capBasisPence: jobId === "v1" ? 200000 : 250000,
        acceptedCapPence: jobId === "v1" ? 3000 : null,
        facts: [{ jobId, acceptedNetValue: { pence: 200000, currency: "GBP" },
          quotedNetValue: { pence: 300000, currency: "GBP" },
          sources: { accepted: "cap:saved", quoted: "quote:saved" } }],
        feedback: store.feedback.filter(row => row.jobId === jobId),
      };
    }
    async review(_context: unknown, _membership: string, jobId: string, input: Record<string, unknown>) {
      if (!store.feedback.some(row => row.commandId === input.commandId)) {
        store.feedback.push({ jobId, ...input, recordedAt: "2026-10-13T10:00:00.000Z" });
      }
    }
  },
}));
afterEach(() => { store.feedback.length = 0; vi.resetModules(); });
const input = { version: "commercial-integrity-review.v1", commandId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
  findingKey: "accepted_value_variance:1", explanation: "Incorrect acceptance", outcome: "dismissed_false_positive" };
const freshApplication = async () => {
  vi.resetModules();
  const { CommercialIntegrityApplication } = await import("./commercial-integrity.application.js");
  return new CommercialIntegrityApplication({} as never, "session", "synthetic_demo");
};
describe("night audit commercial-integrity regressions", () => {
  it("retains integrity reviews across application processes", async () => {
    const first = await freshApplication();
    await first.review("v1", input);
    const second = await freshApplication();
    const persisted = await second.view("v1");
    expect(persisted.feedback).toEqual([expect.objectContaining(input)]);
    expect(persisted.findings.find(row => row.key === input.findingKey)?.dismissed).toBe(true);
    expect((await second.review("v1", input)).feedback).toHaveLength(1);
  }, 30000);
  it("refuses production and pilot reads and reviews before feedback changes", async () => {
    const { CommercialIntegrityApplication } = await import("./commercial-integrity.application.js");
    for (const environment of ["production", "pilot_no_charge"]) {
      const app = new CommercialIntegrityApplication({} as never, "session", environment);
      await expect(app.view("v1")).rejects.toThrow("D11_PRODUCTION_PATH_REFUSED_PROPOSED");
      await expect(app.review("v1", input)).rejects.toThrow("D11_PRODUCTION_PATH_REFUSED_PROPOSED");
    }
    expect(store.feedback).toEqual([]);
  });
  it("projects saved integrity money and omits nonexistent caps", async () => {
    const app = await freshApplication(), v1 = await app.view("v1"), v3 = await app.view("v3");
    expect(v1.capBasisPence).toBe(200000);
    expect(v1.acceptedCapPence).toBe(3000);
    expect(v1.findings.find(row => row.kind === "accepted_value_variance")).toMatchObject({
      citedNumbers: { acceptedNetPence: 200000, quotedNetPence: 300000, differencePence: 100000 },
      sourceReferences: ["cap:saved", "quote:saved"],
    });
    expect(v3.acceptedCapPence).toBeNull();
  }, 30000);
});
