import { describe, expect, it } from "vitest";
import { aisHash, aisObservationV1, aisParse, FakeTrueLayerAisAdapter, SyntheticAisTokenVault, type AisBinding, type AisObservation, type AisPage } from "./ais-adapter.js";
import { DarkAisRepository } from "./ais-repository.js";
import type { Pool } from "pg";
import type { VerifiedTenantContext } from "./tenant-context.js";

const binding: AisBinding = { version: "ais-binding.v1", tenantId: "10000000-0000-4000-8000-000000000001", connectionId: "20000000-0000-4000-8000-000000000001", stateHash: aisHash("synthetic_nonce") };
const observation: AisObservation = { version: "ais-observation.v1", accountRef: "fake_account", movementRef: "fake_cash", providerRef: "fake_pending", revision: 1, status: "pending", amount: { pence: 32000, currency: "GBP" }, bookedOn: "2026-10-01" };
const window = { version: "ais-window.v1" as const, from: "2026-10-01", to: "2026-10-31", cursor: null };
const page = (obs: AisObservation[]): AisPage => ({ version: "ais-page.v1", observations: obs, nextCursor: null });

describe("M4-7 deterministic TrueLayer-shaped adapter", () => {
  it("binds consent code to tenant, connection and nonce; forged callbacks and swapped account references fail", async () => {
    const adapter = new FakeTrueLayerAisAdapter(), code = adapter.register(binding, "fake_account", new Map([["first", page([observation])]]));
    expect(adapter.register(binding, "fake_account", new Map([["first", page([observation])]]))).toBe(code);
    for (const bad of [{ ...binding, tenantId: binding.connectionId }, { ...binding, connectionId: binding.tenantId }, { ...binding, stateHash: aisHash("forged") }])
      await expect(adapter.exchange(bad, code)).rejects.toThrow("AIS_CALLBACK_INVALID");
    await expect(adapter.exchange(binding, "fake_forged")).rejects.toThrow("AIS_CALLBACK_INVALID");
    const grant = await adapter.exchange(binding, code);
    await expect(adapter.pull(grant.token, "fake_other_account", window)).rejects.toThrow("AIS_TOKEN_REVOKED");
  });
  it("preserves stable cash lineage across pending, settlement, changed provider IDs and reversal pages", async () => {
    const adapter = new FakeTrueLayerAisAdapter();
    const pages = new Map<string, AisPage>([["first", { ...page([observation]), nextCursor: "fake_next" }], ["fake_next", page([
      { ...observation, revision: 2, providerRef: "fake_settled", status: "settled" },
      { ...observation, revision: 3, providerRef: "fake_reversal", status: "reversed" },
    ])]]);
    const grant = await adapter.exchange(binding, adapter.register(binding, "fake_account", pages));
    const first = await adapter.pull(grant.token, grant.accountRef, window);
    expect(await adapter.pull(grant.token, grant.accountRef, window)).toEqual(first);
    const next = await adapter.pull(grant.token, grant.accountRef, { ...window, cursor: first.nextCursor });
    expect(next.observations.map(o => o.status)).toEqual(["settled", "reversed"]);
    expect(new Set([...first.observations, ...next.observations].map(o => o.movementRef)).size).toBe(1);
    adapter.revokeToken(grant.token);
    await expect(adapter.pull(grant.token, grant.accountRef, window)).rejects.toThrow("AIS_TOKEN_REVOKED");
  });
  it("rejects inexact/oversized money, invented authority, locked-bill references and hidden data at the observation boundary", () => {
    for (const pence of [0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 1_000_000_000_001, -1_000_000_000_001])
      expect(() => aisParse(aisObservationV1, { ...observation, amount: { pence, currency: "GBP" } })).toThrow("AIS_INVALID");
    for (const extra of [{ allocationPence: 1 }, { landed: true }, { feeAuthorized: true }, { lockedBillId: binding.connectionId }, { shadowSignals: [] }, { token: "private" }])
      expect(() => aisParse(aisObservationV1, { ...observation, ...extra })).toThrow("AIS_INVALID");
    for (const pence of [-1_000_000_000_000, 0, 1_000_000_000_000]) expect(aisParse(aisObservationV1, { ...observation, amount: { pence, currency: "GBP" } }).amount.pence).toBe(pence);
  });
  it("rejects unproven identity, out-of-window data and arbitrary pagination; vault credentials are private", async () => {
    const adapter = new FakeTrueLayerAisAdapter();
    expect(() => adapter.register(binding, "real_account", new Map())).toThrow("AIS_INVALID");
    expect(() => aisParse(aisObservationV1, { ...observation, movementRef: null })).toThrow("AIS_INVALID");
    const grant = await adapter.exchange(binding, adapter.register(binding, "fake_account", new Map([["first", page([observation])]])));
    await expect(adapter.pull(grant.token, grant.accountRef, { ...window, from: "2026-10-02" })).rejects.toThrow("AIS_PROVIDER_FAILED");
    await expect(adapter.pull(grant.token, grant.accountRef, { ...window, cursor: "fake_unknown" })).rejects.toThrow("AIS_PROVIDER_FAILED");
    const vault = new SyntheticAisTokenVault(); await vault.put(binding.connectionId, grant.token);
    expect(JSON.stringify(vault)).toBe("{}"); expect(JSON.stringify(adapter)).not.toContain(grant.token);
    await vault.revoke(binding.connectionId); expect(await vault.get(binding.connectionId)).toBeUndefined();
  });
  it("refuses live/default environments before opening SQL or invoking any provider", async () => {
    for (const environment of [undefined, "pilot_no_charge", "production"]) {
      const repository = new DarkAisRepository({} as Pool, new FakeTrueLayerAisAdapter(), new SyntheticAisTokenVault(), environment);
      await expect(repository.read({} as VerifiedTenantContext, "a".repeat(64), binding.connectionId)).rejects.toThrow("AIS_DARK_ONLY");
    }
  });
});
