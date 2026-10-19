import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { PracticeAccessError, ReadinessRepository, WatchdogError } from "@jobguard/db";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PracticeAccess } from "./practice-access.js";
import { ReadinessController } from "./readiness.controller.js";

afterEach(() => vi.restoreAllMocks());

const jobId = randomUUID();
const command = (action: "plan" | "advance") => ({
  version: action === "plan" ? "readiness-plan.v1" : "readiness-clock.v1",
  commandId: randomUUID(), scenarioNow: "2026-03-27T09:00:00.000Z",
});
function authorized() {
  // Controller/schema unit test only: PostgreSQL authority is covered separately.
  vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({ context: {} } as never);
  return new ReadinessController({} as Pool);
}
async function failure(run: Promise<unknown>) {
  try { await run; throw new Error("Expected refusal"); }
  catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const typed = error as HttpException;
    return { status: typed.getStatus(), body: typed.getResponse() };
  }
}

describe("L067 api-file-readiness#1 typed controller refusals", () => {
  it.each(["plan", "advance"] as const)("L067 malformed readiness command is typed 400 (%s)", async action => {
    const controller = authorized();
    const record = vi.spyOn(ReadinessRepository.prototype, "record");
    const advance = vi.spyOn(ReadinessRepository.prototype, "advance");
    for (const raw of [null, {}, { ...command(action), commandId: "invalid" },
      { ...command(action), scenarioNow: "invalid" }, { ...command(action), tenantId: randomUUID() }]) {
      expect(await failure(controller[action](jobId, raw))).toEqual({ status: 400, body: { code: "INVALID_COMMAND" } });
    }
    expect(record).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
  });

  it.each(["plan", "advance"] as const)("L067 valid %s command reaches the repository unchanged", async action => {
    const controller = authorized(), input = command(action), result = { dueReviewDecisions: 0 };
    const repository = vi.spyOn(ReadinessRepository.prototype, action === "plan" ? "record" : "advance")
      .mockResolvedValue(result as never);
    expect(await controller[action](jobId, input)).toEqual(result);
    expect(repository).toHaveBeenCalledWith({}, jobId, input);
  });

  it.each(["JOB_NOT_LIVE", "IDEMPOTENCY_CONFLICT"] as const)("L067 preserves the typed %s conflict for the existing filter", async code => {
    const controller = authorized(), error = new WatchdogError(code);
    vi.spyOn(ReadinessRepository.prototype, "advance").mockRejectedValue(error);
    await expect(controller.advance(jobId, command("advance"))).rejects.toBe(error);
  });

  it.each(["plan", "advance"] as const)("L067 %s checks authority before malformed input or live state", async action => {
    const error = new PracticeAccessError("UNAUTHENTICATED");
    vi.spyOn(PracticeAccess.prototype, "job").mockRejectedValue(error);
    const record = vi.spyOn(ReadinessRepository.prototype, "record");
    const advance = vi.spyOn(ReadinessRepository.prototype, "advance");
    await expect(new ReadinessController({} as Pool)[action](jobId, {})).rejects.toBe(error);
    expect(record).not.toHaveBeenCalled(); expect(advance).not.toHaveBeenCalled();
  });

  it.each(["view", "plan", "advance"] as const)("L067 unknown %s failures remain server errors without database details", async action => {
    const controller = authorized();
    const method = action === "plan" ? "record" : action;
    vi.spyOn(ReadinessRepository.prototype, method).mockRejectedValue(
      Object.assign(new Error("internal database relation and parameter details"), { code: "23503" }));
    const run = action === "view" ? controller.view(jobId) : controller[action](jobId, command(action));
    expect(await failure(run)).toEqual({ status: 500, body: { code: "INTERNAL_ERROR" } });
  });
});
