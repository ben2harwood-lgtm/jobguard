import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { EnterpriseIdentityRepository, SsoRepositoryError } from "./enterprise-identity-repository.js";

function fixture() {
  const query = vi.fn(async () => ({ rows: [] }));
  const repository = new EnterpriseIdentityRepository({ query } as unknown as Pool);
  const transaction = vi.spyOn(repository, "transaction").mockImplementation(async work => work({} as never));
  const connection = vi.spyOn(repository, "connection").mockImplementation(async (_client, id) => {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(id)) throw new Error("invalid UUID input");
    return {};
  });
  const audit = vi.spyOn(repository, "audit").mockResolvedValue(undefined);
  return { repository, query, transaction, connection, audit };
}

describe("LATER-B28 refusal boundary", () => {
  it.each(["-".repeat(36), "a".repeat(36), `${"a".repeat(35)}-`, "not-a-uuid", "admin"])(
    "FL52 36 hyphens preserves INVALID_SSO_INPUT: %s", async route => {
      const f = fixture();
      await expect(f.repository.refusal(route, "INVALID_SSO_INPUT")).resolves.toBeUndefined();
      expect(f.query).toHaveBeenCalledExactlyOnceWith(
        "INSERT INTO identity.sso_refusal_event(id,route_hash,code) VALUES($1,$2,$3)",
        [expect.any(String), createHash("sha256").update(route).digest("hex"), "INVALID_SSO_INPUT"],
      );
      expect(f.transaction).not.toHaveBeenCalled();
    },
  );
  it("FL52 legitimate connection refusals retain bootstrap recording and tenant audit", async () => {
    const f = fixture(), route = randomUUID().toUpperCase();
    await f.repository.refusal(route, "REQUEST_REFUSED");
    expect(f.query).toHaveBeenCalledOnce();
    expect(f.connection).toHaveBeenCalledExactlyOnceWith(expect.anything(), route);
    expect(f.audit).toHaveBeenCalledExactlyOnceWith(expect.anything(), route, "sso.refused", "identity:saml", "REQUEST_REFUSED");
  });
  it.each(["SSO_NOT_FOUND", "SSO_ROUTE_BLOCKED"])("FL52 %s keeps the bootstrap refusal", async code => {
    const f = fixture();
    f.connection.mockRejectedValue(new SsoRepositoryError(code));
    await expect(f.repository.refusal(randomUUID(), "INVALID_SSO_INPUT")).resolves.toBeUndefined();
    expect(f.query).toHaveBeenCalledOnce();
    expect(f.audit).not.toHaveBeenCalled();
  });
  it("FL52 unavailable refusal storage fails closed", async () => {
    const f = fixture();
    f.query.mockRejectedValue(new Error("database unavailable"));
    await expect(f.repository.refusal("-".repeat(36), "INVALID_SSO_INPUT")).rejects.toThrow("database unavailable");
    expect(f.transaction).not.toHaveBeenCalled();
  });
});
