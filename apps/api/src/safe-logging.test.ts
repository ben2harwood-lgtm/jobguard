import "reflect-metadata";
import { afterEach, expect, it, vi } from "vitest";
import { ConsoleLogger, Logger, type ArgumentsHost, HttpException } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import type { JobHelpers } from "graphile-worker";
import type { Pool } from "pg";
import { IdentityRepository } from "@jobguard/db";
import { IdentityApplication } from "./auth/identity.application.js";
import { IdentityController } from "./auth/identity.controller.js";
import { PersistedAuthProvider } from "./auth/persisted-auth-provider.js";
import { FixtureIdentityEmail } from "./auth/identity-email.js";
import { redactLogValue, RedactingLogger, redactingTasks, redactingWorkerLogger, redactedWorkerError } from "./safe-logging.js";

const privateValues = [
  "https://example.invalid/accept/one-time-link-123?token=once-secret",
  "session-secret-987", "csrf-secret-654", "refresh-secret-321",
  "jane.synthetic@example.invalid", "+44 7700 900123", "Jane Synthetic Customer",
];
const privateText = privateValues.join(" | ");

function assertPrivateValuesAbsent(value: string) {
  for (const secret of privateValues) expect(value).not.toContain(secret);
}

afterEach(() => { Logger.overrideLogger(new ConsoleLogger()); vi.restoreAllMocks(); });

it("redacts bare text, structured/nested data, Error details and every logger argument", () => {
  const records: string[] = [];
  for (const method of ["info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(record => { records.push(String(record)); });
  }
  const logger = new RedactingLogger();
  const serialize = vi.fn(() => privateText);
  const error = Object.assign(new Error(privateText, { cause: new Error(privateText) }), {
    token: privateText, toJSON: serialize,
  });
  const hostile = { get event() { throw new Error(privateText); }, toJSON: serialize };
  for (const value of [...privateValues, error, { nested: { email: privateText } }, hostile]) {
    for (const method of ["log", "error", "warn", "debug", "verbose", "fatal"] as const) {
      logger[method](value, privateText, error.stack, { cause: error });
    }
  }
  logger.log("outbox.retry", privateText);
  logger.log({ event: "outbox.queue_age", seconds: 12, attempt: 2, actionId: privateText, toJSON: serialize });
  expect(records.length).toBeGreaterThan(0);
  assertPrivateValuesAbsent(records.join("\n"));
  expect(records.at(-1)).toBe('{"level":"log","message":{"event":"outbox.queue_age","seconds":12,"attempt":2}}');
  expect(serialize).not.toHaveBeenCalled();
  expect(redactLogValue(new Proxy({}, { getOwnPropertyDescriptor() { throw error; } }))).toBe("[REDACTED]");
  expect(redactLogValue({ event: privateText, seconds: 1 })).toBe("[REDACTED]");
  expect(redactLogValue({ event: "outbox.retry", seconds: Infinity, attempt: privateText })).toEqual({ event: "outbox.retry" });
});

it("uses Nest's real default exception path without emitting database error details", () => {
  const records: string[] = [];
  Logger.overrideLogger(new RedactingLogger(record => records.push(record)));
  const reply = vi.fn();
  const adapter = { isHeadersSent: () => false, reply };
  const host = { getArgByIndex: () => ({}) } as unknown as ArgumentsHost;
  const filter = new BaseExceptionFilter(adapter as never);
  filter.catch(Object.assign(new Error(privateText), { detail: privateText, query: privateText }), host);
  expect(reply).toHaveBeenCalledWith({}, { statusCode: 500, message: "Internal server error" }, 500);
  expect(records).toHaveLength(1);
  assertPrivateValuesAbsent(JSON.stringify({ records, response: reply.mock.calls }));
});

it("runs failing sign-in request/verify commands and captures only safe logs and thrown messages", async () => {
  const records: string[] = [];
  const logger = new RedactingLogger(record => records.push(record));
  // Inject a database outage at the existing repository seam; no database/network is used.
  const repository = new IdentityRepository({} as Pool);
  vi.spyOn(repository, "transaction").mockRejectedValue(new Error(privateText));
  const provider = new PersistedAuthProvider(repository, "synthetic-test-key".repeat(3));
  const controller = new IdentityController(() => new IdentityApplication(provider, "https://example.invalid"));
  const req = { headers: { origin: "https://example.invalid", cookie: `jobguard_session=${privateValues[1]}`, "x-csrf-token": privateValues[2] }, ip: "192.0.2.1" };
  const cookie = vi.fn();
  for (const command of [
    () => controller.request({ version: "identity-request.v1", email: privateValues[4], purpose: "signin" }, req),
    () => controller.verify({ version: "identity-verify.v1", email: privateValues[4], purpose: "signin", code: "12345678" }, req, { cookie }),
  ]) {
    const error: unknown = await command().catch(error => error);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getResponse()).toEqual({ code: "IDENTITY_UNAVAILABLE" });
    logger.error(error, req);
    assertPrivateValuesAbsent(String(error));
  }
  expect(repository.transaction).toHaveBeenCalledTimes(2);
  expect(cookie).not.toHaveBeenCalled();
  assertPrivateValuesAbsent(records.join("\n"));
});

it("redacts failing worker commands before logging and Graphile last_error persistence", async () => {
  const records: string[] = [];
  const workerLogger = redactingWorkerLogger(new RedactingLogger(record => records.push(record)));
  const tasks = redactingTasks({
    invalid_email: async payload => { await new FixtureIdentityEmail().deliver(payload); },
    adapter_failure: async () => { throw Object.assign(new Error(privateText), { detail: privateText }); },
    success: async () => undefined,
  });
  for (const name of ["invalid_email", "adapter_failure"]) {
    const error: unknown = await Promise.resolve(tasks[name]!(Object.fromEntries([[privateText, privateText]]), {} as JobHelpers)).catch(error => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("WORKER_TASK_FAILED");
    expect((error as Error).cause).toBeUndefined();
    assertPrivateValuesAbsent(String(error));
    workerLogger.scope({ jobId: privateText }).error(`Failed ${privateText}: ${String(error)}`, { error, payload: privateText });
  }
  await expect(tasks.success!({}, {} as JobHelpers)).resolves.toBeUndefined();
  expect(records).toHaveLength(2);
  assertPrivateValuesAbsent(records.join("\n"));
});

it.each([
  "TERMS_RELATION_UNAVAILABLE", "SHADOW_TERMS_NOT_ACCEPTED", "FINAL_CHECK_FORBIDDEN",
  "INVALID_FINAL_CHECK_TASK", "QUEUE_UNAVAILABLE",
])("preserves the fixed %s refusal without its private diagnostics", async code => {
  const original = Object.assign(new Error(code, { cause: new Error(privateText) }), {
    stack: privateText, detail: privateText, payload: privateText,
  });
  const tasks = redactingTasks({ refuse: async () => { throw original; } });
  const error: unknown = await Promise.resolve(tasks.refuse!({}, {} as JobHelpers)).catch(error => error);
  expect(error).toMatchObject({ message: code, code });
  expect(error).not.toBe(original);
  expect((error as Error).cause).toBeUndefined();
  assertPrivateValuesAbsent(JSON.stringify(error) + (error as Error).stack);
  const records: string[] = [];
  new RedactingLogger(record => records.push(record)).error(error);
  expect(records).toEqual(['{"level":"error","message":"[REDACTED]"}']);
  expect(redactedWorkerError(original, "WORKER_START_FAILED")).toMatchObject({ message: code, code });
  // Even a known refusal with appended data is never passed through.
  expect(redactedWorkerError(new Error(`${code}: ${privateText}`))).toMatchObject({ message: "WORKER_TASK_FAILED" });
});

it("sanitizes startup failures and does not read arbitrary message getters", () => {
  const message = vi.fn(() => privateText);
  const original = Object.defineProperty(new Error(), "message", { get: message });
  for (const error of [original, new Error(privateText), privateText, null,
    new Proxy(new Error(), { getOwnPropertyDescriptor() { throw new Error(privateText); } })]) {
    const safe = redactedWorkerError(error, "WORKER_START_FAILED");
    expect(safe).toMatchObject({ message: "WORKER_START_FAILED", code: "WORKER_START_FAILED" });
    expect(safe.cause).toBeUndefined();
    assertPrivateValuesAbsent(JSON.stringify(safe) + safe.stack);
  }
  expect(message).not.toHaveBeenCalled();
});
