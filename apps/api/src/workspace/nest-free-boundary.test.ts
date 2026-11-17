import { expect, it, vi } from "vitest";
import { JobWorkStateError } from "@jobguard/core";

// Next bundles this entrypoint. Loading Nest here pulls its CommonJS file-type
// resolver into webpack, whose conditions cannot resolve the ESM-only root.
vi.mock("@nestjs/common", () => { throw new Error("Web workspace must not load Nest"); });

it("loads the web workspace without Nest and preserves its shared failure responses", async () => {
  const workspace = await import("./index.js");
  expect(workspace.createWorkspaceApplication).toBeTypeOf("function");
  const closed = workspace.jobSourceFailure(new JobWorkStateError("POST_LOCK_WORK_REQUIRES_LINKED_JOB"));
  expect(closed).toMatchObject({ status: 422, body: {
    code: "POST_LOCK_WORK_REQUIRES_LINKED_JOB", environment: "synthetic_demo", realExternalActions: 0,
  } });
});

it.each([
  ["METER_PROJECTION_MISMATCH", "The jobs-on-the-go meter could not be verified. Nothing was changed."],
  ["METER_UPGRADE_REQUIRED", "Your Solo plan and grace place are full. Move to Builder before starting this site work."],
] as const)("preserves main's %s refusal without loading Nest", async (code, message) => {
  const { jobWorkStateFailure } = await import("./index.js");
  expect(jobWorkStateFailure(new JobWorkStateError(code))).toEqual({ status: 409, body: {
    code, message, environment: "synthetic_demo", realExternalActions: 0,
  } });
});
