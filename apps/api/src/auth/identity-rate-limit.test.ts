import { describe, expect, it, vi } from "vitest";
import { IdentityRepository } from "@jobguard/db";
import { PersistedAuthProvider } from "./persisted-auth-provider.js";

// Query responses are controlled here; real role/locking proof stays in identity.integration.test.ts.
function fixture(ipCount = 0, emailCount = 0, globalCount = 0) {
  const client = { query: vi.fn(async (sql: string, _values?: unknown[]) => ({ rows: [{ count:
    sql.includes("WHERE ip_digest=") ? ipCount : sql.includes("WHERE email=") ? emailCount : globalCount,
  }] })) };
  const repository = new IdentityRepository({ query: vi.fn() } as never);
  vi.spyOn(repository, "transaction").mockImplementation(work => work(client as never));
  vi.spyOn(repository, "lock").mockResolvedValue();
  vi.spyOn(repository, "latest").mockResolvedValue(undefined);
  const provider = new PersistedAuthProvider(repository, "fictional-key".repeat(4), undefined, "synthetic_demo", () => 1_000_000);
  return { client, repository, provider };
}
const input = { email: "builder@practice.invalid", purpose: "signin" as const, ip: "192.0.2.1" };
describe("persisted request limit decisions", () => {
  it.each([[10, 0, 10], [0, 10, 10], [0, 0, 100]])("refuses IP/email/global counts %j/%j/%j before recording or delivery", async (ip, email, global) => {
    const { client, provider } = fixture(ip, email, global);
    await expect(provider.requestCode(input)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(client.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
  });
  it("allows the last available slot and locks the global window before IP/email", async () => {
    const { client, repository, provider } = fixture(9, 9, 99);
    await expect(provider.requestCode(input)).resolves.toMatchObject({ accepted: true });
    expect(client.query.mock.calls[0]).toEqual(["SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["identity-request-global"]]);
    expect(client.query.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(repository.lock).mock.invocationCallOrder[0]!);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("WHERE email=$1 AND requested_at>$2"), [input.email, new Date(400_000)]);
  });
});
