import "reflect-metadata";
import type { ArgumentsHost } from "@nestjs/common";
import { PracticeAccessError } from "@jobguard/db";
import { expect, it, vi } from "vitest";
import { PracticeErrorsFilter } from "./practice-errors.filter.js";

it.each([
  ["UNAUTHENTICATED", 401],
  ["NOT_FOUND", 404],
  ["SYNTHETIC_MODE_REQUIRED", 403],
] as const)("PE1: %s serializes only its code with status %i despite private diagnostics", (code, expectedStatus) => {
  const privateDetails = {
    tenantId: "18000000-0000-4000-8000-000000000001",
    jobId: "18000000-0000-4000-8000-000000000002",
    evidenceId: "18000000-0000-4000-8000-000000000003",
    diagnostic: "Fictional private job evidence; synthetic test data only",
  };
  const toJSON = vi.fn(() => privateDetails);
  const error = Object.assign(new PracticeAccessError(code), {
    ...privateDetails,
    message: privateDetails.diagnostic,
    stack: `Error: ${privateDetails.diagnostic}`,
    cause: new Error(privateDetails.diagnostic),
    toJSON,
  });

  let serialized: string | undefined;
  const json = vi.fn((body: unknown) => {
    serialized = JSON.stringify(body);
  });
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;

  new PracticeErrorsFilter().catch(error, host);

  expect(status.mock.calls).toStrictEqual([[expectedStatus]]);
  // Check both the object handed to JSON and the bytes a serializer produces.
  expect.soft(json.mock.calls).toStrictEqual([[{ code }]]);
  expect.soft(serialized).toBe(JSON.stringify({ code }));
  expect.soft(toJSON).not.toHaveBeenCalled();
});
