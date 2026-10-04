import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PracticeFeedApplication, PracticeFeedApplicationError } from "./practice-feed.application.js";
import { PracticeFeedController } from "./practice-feed.controller.js";

afterEach(() => vi.restoreAllMocks());
const session = randomUUID(), job = randomUUID();
const outcome = async (promise: Promise<unknown>) => {
  try { await promise; } catch (error) { expect(error).toBeInstanceOf(HttpException); return { status: (error as HttpException).getStatus(), body: (error as HttpException).getResponse() }; }
  throw new Error("Expected rejection");
};

describe("PracticeFeedController", () => {
  it("answers a successful command with 200, exactly as the in-process Next route does", () => {
    expect(Reflect.getMetadata("__httpCode__", PracticeFeedController.prototype.post)).toBe(200);
  });
  it("passes only the session cookie and path job to the shared application", async () => {
    const view = vi.spyOn(PracticeFeedApplication.prototype, "view").mockResolvedValue({} as never);
    const command = vi.spyOn(PracticeFeedApplication.prototype, "command").mockResolvedValue({} as never);
    const controller = new PracticeFeedController({} as Pool), request = { headers: { cookie: `unrelated=value; jg_session=${session}` } };
    await controller.get(request, job, { limit: "1" });
    expect(view).toHaveBeenCalledWith(session, job, { version: "practice-feed-query.v1", limit: "1" });
    const body = { action: "disconnect" };
    await controller.post(request, job, body);
    expect(command).toHaveBeenCalledWith(session, job, body);
  });
  it("refuses a client-supplied tenant header before any application call", async () => {
    const view = vi.spyOn(PracticeFeedApplication.prototype, "view").mockResolvedValue({} as never);
    const result = await outcome(new PracticeFeedController({} as Pool).get({ headers: { cookie: `jg_session=${session}`, "x-tenant-id": randomUUID() } }, job, {}));
    expect(result).toEqual({ status: 403, body: { version: "practice-feed-error.v1", code: "TENANT_FORBIDDEN" } });
    expect(view).not.toHaveBeenCalled();
  });
  it.each([
    ["UNAUTHENTICATED", 401], ["SYNTHETIC_ONLY", 403], ["INVALID_COMMAND", 400], ["PRACTICE_FEED_STALE_REVISION", 409], ["PRACTICE_FEED_MOVEMENT_NOT_SETTLED", 409], ["PRACTICE_FEED_FORBIDDEN", 403],
  ] as const)("maps %s to HTTP %i without leaking internals", async (code, status) => {
    vi.spyOn(PracticeFeedApplication.prototype, "command").mockRejectedValue(code === "UNAUTHENTICATED" || code === "SYNTHETIC_ONLY" || code === "INVALID_COMMAND"
      ? new PracticeFeedApplicationError(code) : Object.assign(new Error("secret detail"), { code }));
    expect(await outcome(new PracticeFeedController({} as Pool).post({ headers: { cookie: `jg_session=${session}` } }, job, {}))).toEqual({ status, body: { version: "practice-feed-error.v1", code } });
  });
  it("redacts an unknown database failure", async () => {
    vi.spyOn(PracticeFeedApplication.prototype, "view").mockRejectedValue(new Error("password=hunter2"));
    expect(await outcome(new PracticeFeedController({} as Pool).get({ headers: { cookie: `jg_session=${session}` } }, job, {}))).toEqual({ status: 503, body: { version: "practice-feed-error.v1", code: "DATABASE_UNAVAILABLE" } });
  });
});
