import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulateFreeFirstJobCardSetup } from "./free-first-job-card.adapter.js";
const input = () => ({ version: "free-first-job-card-fixture.v1", environment: "synthetic_demo",
  tenantId: "00000000-0000-4000-8000-000000000001", setupId: "00000000-0000-4000-8000-000000000002", fixtureCard: "card_a", outcome: "completed" });
describe("MON-3 stateless simulated hosted setup fixture", () => {
  beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); });
  afterEach(() => { vi.unstubAllEnvs(); });
  it("[MON3-A24] server mode rejects a forged synthetic fixture flag", () => {
    for (const mode of ["production", "pilot_no_charge", ""]) {
      vi.stubEnv("JOBGUARD_ENV", mode);
      expect(() => simulateFreeFirstJobCardSetup(input())).toThrow("FREE_FIRST_JOB_SYNTHETIC_ONLY");
    }
  });
  it("[MON3-A08] successful simulation contains only an opaque provider reference and fingerprint", () => {
    const result = simulateFreeFirstJobCardSetup(input());
    expect(result).toMatchObject({ simulated: true, hypothetical: true, realExternalActions: 0, hostedFlow: "simulated", card: { status: "completed", provider: "simulated" } });
    expect(Object.keys(result.card).sort()).toEqual(["environment", "fingerprint", "provider", "reference", "status", "tenantId", "version"]);
    if (result.card.status !== "completed") throw new Error("Expected complete fixture");
    expect(result.card.reference).toMatch(/^sim_ref_/);
    expect(result.card.fingerprint).toMatch(/^sim_fp_/);
    for (const extra of [{ cardNumber: "demo" }, { expiry: "demo" }, { cvv: "demo" }, { taxIdentifier: "demo" }, { reference: "sim_ref_client" }, { fingerprint: "sim_fp_client" }]) {
      expect(() => simulateFreeFirstJobCardSetup({ ...input(), ...extra })).toThrow("INVALID_FREE_FIRST_JOB_INPUT");
    }
  });
  it("[MON3-A07] pending, redirect, cancelled, failed and unknown completion cannot qualify", () => {
    for (const outcome of ["requested", "redirect_only", "cancelled", "failed", "outcome_unknown"]) {
      const result = simulateFreeFirstJobCardSetup({ ...input(), outcome });
      expect(result.card.status).toBe(outcome); expect(result.card).not.toHaveProperty("reference"); expect(result.card).not.toHaveProperty("fingerprint");
    }
  });
  it("[MON3-A17] mechanical fixture repeat is stable; setup reference is tenant-bound, fingerprint provider-bound", () => {
    const result = simulateFreeFirstJobCardSetup(input());
    expect(simulateFreeFirstJobCardSetup(input())).toEqual(result);
    const other = simulateFreeFirstJobCardSetup({ ...input(), tenantId: input().setupId, setupId: input().tenantId });
    if (other.card.status !== "completed" || result.card.status !== "completed") throw new Error("Expected complete fixtures");
    expect(other.card.reference).not.toBe(result.card.reference); expect(other.card.fingerprint).toBe(result.card.fingerprint);
    const differentCard = simulateFreeFirstJobCardSetup({ ...input(), fixtureCard: "card_b" }).card;
    if (differentCard.status !== "completed") throw new Error("Expected complete fixture");
    expect(differentCard.fingerprint).not.toBe(result.card.fingerprint);
  });
  it("[MON3-A24] [MON3-A26] simulation refuses non-synthetic modes and unknown fixture versions", () => {
    for (const extra of [{ environment: "production" }, { environment: "pilot_no_charge" }, { version: "v2" }, { paid: true }, { outcome: "paid" }, { fixtureCard: "external" }]) {
      expect(() => simulateFreeFirstJobCardSetup({ ...input(), ...extra })).toThrow();
    }
    expect(simulateFreeFirstJobCardSetup(input())).not.toHaveProperty("paid");
  });
});
