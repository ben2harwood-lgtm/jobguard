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
