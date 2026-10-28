import { describe, expect, it } from "vitest";
import { EnterpriseFeeError } from "@jobguard/core";
import { EnterpriseFeeRepository, enterpriseFeeDatabaseFailure, enterpriseFeeDeriveCommandV1 } from "./enterprise-fee-repository.js";

describe("ENT-7a enterprise fee repository boundary", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("accepts only the strict derive command: no amount, rate, origin or allocation can be supplied", () => {
    const ok = { version: "enterprise-fee-derive.v1", commandId: id, agreementVersionId: id, period: "2026-10" };
    expect(enterpriseFeeDeriveCommandV1.safeParse(ok).success).toBe(true);
    for (const extra of [{ cumulativeFeePence: 1 }, { rate: "1/10" }, { contributions: [] }]) expect(enterpriseFeeDeriveCommandV1.safeParse({ ...ok, ...extra }).success).toBe(false);
    for (const period of ["2026-13", "1999-12", "2026-1", "26-10"]) expect(enterpriseFeeDeriveCommandV1.safeParse({ ...ok, period }).success).toBe(false);
  });
  it("maps database refusals to public codes and treats anything else as an unknown outcome", () => {
    const code = (e: unknown) => { try { enterpriseFeeDatabaseFailure(e); } catch (x) { return (x as EnterpriseFeeError).code; } };
    expect(code({ message: "FEE_NOT_FOUND" })).toBe("FEE_NOT_FOUND");
    expect(code({ message: "permission denied", code: "42501" })).toBe("EXTRA_FORBIDDEN");
    expect(code({ message: "duplicate", code: "23505" })).toBe("COMMAND_CONFLICT");
    expect(code(new Error("connection reset"))).toBe("OUTCOME_UNKNOWN");
  });
  it("refuses malformed input before any database call", async () => {
    const repo = new EnterpriseFeeRepository({ connect: () => { throw new Error("must not connect"); } } as never);
    await expect(repo.derive({} as never, "not-a-uuid", {})).rejects.toMatchObject({ code: "INVALID_FEE_INPUT" });
    await expect(repo.read({} as never, id, "nope")).rejects.toMatchObject({ code: "INVALID_FEE_INPUT" });
  });
});
