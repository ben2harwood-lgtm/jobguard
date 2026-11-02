import { expect, it, vi } from "vitest";
import { JobWorkStateError, LINKED_JOB_COPY } from "@jobguard/core";

// Next consumes this entire entry point. Nest's file validator contains a native
// require.resolve('file-type') that webpack cannot resolve through its ESM exports.
// A framework import here must fail rather than silently bundling that graph.
vi.mock("@nestjs/common", () => { throw new Error("Nest must stay outside the shared web workspace graph"); });

it("the real workspace loads without Nest and preserves both linked-job refusal paths", async () => {
  const workspace = await import("./index.js");
  const { jobWorkStateFailure } = await import("../job-work-state.failure.js");
  expect(workspace.createWorkspaceApplication).toBeTypeOf("function");
  const refusal = new JobWorkStateError("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  const expected = { status: 422, body: { code: refusal.code, message: LINKED_JOB_COPY, environment: "synthetic_demo", realExternalActions: 0 } };
  expect(jobWorkStateFailure(refusal)).toEqual(expected);
  expect(workspace.jobSourceFailure(refusal)).toEqual(expected);
});
