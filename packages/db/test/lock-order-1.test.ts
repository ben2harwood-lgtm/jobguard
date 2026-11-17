import { describe, expect, it } from "vitest";
import { WorkOrderError } from "@jobguard/core";
import { workOrderFailure } from "../src/work-order-repository.js";

describe("LOCK-ORDER-1 retryable work-order failures", () => {
  it.each(["40P01", "40001"])("[LOCK-ORDER-1(b)] maps SQLSTATE %s to STALE_REVISION without database details", code => {
    const result = workOrderFailure({ code, message: "internal database detail", detail: "internal arguments" });
    expect(result).toBeInstanceOf(WorkOrderError);
    expect(result.code).toBe("STALE_REVISION");
    expect(result.message).toBe("STALE_REVISION");
    expect(result).not.toHaveProperty("detail");
  });

  it("[LOCK-ORDER-1(b)] preserves typed domain refusals", () => {
    const refusal = new WorkOrderError("NOT_FOUND");
    expect(workOrderFailure(refusal)).toBe(refusal);
  });

  it("[LOCK-ORDER-1(b)] keeps unrelated infrastructure failures unavailable", () => {
    expect(workOrderFailure({ code: "08006" }).code).toBe("DATABASE_UNAVAILABLE");
  });
});
