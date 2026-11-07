import { describe, expect, it } from "vitest";
import { FakeMachineSecretStore } from "./fake-secret-store.js";

describe("fixture-only machine secrets", () => {
  it("copies the explicit maps and never exposes mutable signing bytes", async () => {
    const bytes = Buffer.alloc(32, 8), tokens = new Map([["connection", "fictional-token"]]);
    const keys = new Map([["fixture:key", bytes]]), store = new FakeMachineSecretStore({ tokens, keys });
    bytes.fill(0); keys.clear(); tokens.clear();
    expect(await store.token("connection")).toBe("fictional-token");
    const copy = await store.key("fixture:key"); copy.fill(0);
    expect(await store.key("fixture:key")).toEqual(new Uint8Array(32).fill(8));
  });
  it("refuses absent tokens and unknown or non-fixture labels without leaking them", async () => {
    const store = new FakeMachineSecretStore({ tokens: new Map(), keys: new Map() });
    await expect(store.token("unknown")).rejects.toThrow("Connector input refused");
    for (const label of ["fixture:unknown", "env:SECRET", "/tmp/key", "https://fixture.invalid/key", "fixture:key\n"])
      await expect(store.key(label)).rejects.toThrow("Connector input refused");
  });
  it("rejects real labels and short fixture keys at creation", () => {
    for (const [label, bytes] of [["real:key", Buffer.alloc(32)], ["fixture:key", Buffer.alloc(31)]] as const)
      expect(() => new FakeMachineSecretStore({ tokens: new Map(), keys: new Map([[label, bytes]]) })).toThrow("Connector input refused");
  });
});
