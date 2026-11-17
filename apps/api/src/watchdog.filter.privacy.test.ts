import { WatchdogError } from "@jobguard/db";
import { describe, expect, it, vi } from "vitest";
import { WatchdogExceptionFilter } from "./watchdog.filter.js";

describe("watchdog refusal confidentiality", () => {
  it.each([
    ["WD1", "JOB_NOT_FOUND", 404],
    ["WD2", "JOB_NOT_LIVE", 409],
    ["WD3", "IDEMPOTENCY_CONFLICT", 409],
  ] as const)("%s: %s exposes only its stable code despite attached diagnostics", (_case, code, status) => {
    const error = Object.assign(new WatchdogError(code), {
      message: "Synthetic internal diagnostic: another tenant's job is live",
      stack: "Synthetic private database stack",
      cause: new Error("Synthetic private original command details"),
      tenantId: "11111111-1111-4111-8111-111111111111",
      jobId: "33333333-3333-4333-8333-333333333333",
      jobStatus: "live",
      originalResult: { amountPence: 12345, evidencePresent: true },
    });
    const json = vi.fn();
    const setStatus = vi.fn(() => ({ json }));
    const host = { switchToHttp: () => ({ getResponse: () => ({ status: setStatus }) }) };

    new WatchdogExceptionFilter().catch(error, host as never);

    expect(setStatus).toHaveBeenCalledOnce();
    expect(setStatus).toHaveBeenCalledWith(status);
    expect(json).toHaveBeenCalledOnce();
    expect(json.mock.calls).toStrictEqual([[{ code }]]);
  });
});
