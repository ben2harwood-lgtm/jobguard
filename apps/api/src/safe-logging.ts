import type { LoggerService } from "@nestjs/common";
import { Logger as WorkerLogger, type Task, type TaskList } from "graphile-worker";

// Arbitrary text cannot be made safe by guessing which words are customer names.
// Only these application-owned event labels may cross the logging boundary.
const safeEvents = new Set([
  "SERVER_START_FAILED", "WORKER_START_FAILED", "WORKER_TASK_FAILED",
  "outbox.queue_age", "outbox.failure", "outbox.retry", "outbox.unknown_outcome",
]);

export function redactLogValue(value: unknown): string | Record<string, string | number> {
  // Do not serialize objects, invoke getters/toJSON, or retain Error stacks/causes.
  if (typeof value === "string") return safeEvents.has(value) ? value : "[REDACTED]";
  if (typeof value === "object" && value !== null) {
    try {
      const event: unknown = Object.getOwnPropertyDescriptor(value, "event")?.value;
      if (typeof event !== "string" || !safeEvents.has(event)) return "[REDACTED]";
      const result: Record<string, string | number> = { event };
      for (const key of ["seconds", "attempt"]) {
        const metric: unknown = Object.getOwnPropertyDescriptor(value, key)?.value;
        if (typeof metric === "number" && Number.isFinite(metric) && metric >= 0) result[key] = metric;
      }
      return result;
    } catch { /* A hostile proxy is not a logging failure or a reason to expose it. */ }
  }
  return "[REDACTED]";
}

type Level = "log" | "error" | "warn" | "debug" | "verbose" | "fatal";
type Sink = (record: string, level: Level) => void;

export class RedactingLogger implements LoggerService {
  constructor(private readonly sink: Sink = (record, level) => {
    if (level === "error" || level === "fatal") console.error(record);
    else if (level === "warn") console.warn(record);
    else console.info(record);
  }) {}

  private write(level: Level, message: unknown): void {
    this.sink(JSON.stringify({ level, message: redactLogValue(message) }), level);
  }

  log(message: unknown, ..._details: unknown[]): void { this.write("log", message); }
  error(message: unknown, ..._details: unknown[]): void { this.write("error", message); }
  warn(message: unknown, ..._details: unknown[]): void { this.write("warn", message); }
  debug(message: unknown, ..._details: unknown[]): void { this.write("debug", message); }
  verbose(message: unknown, ..._details: unknown[]): void { this.write("verbose", message); }
  fatal(message: unknown, ..._details: unknown[]): void { this.write("fatal", message); }
}

export function redactingWorkerLogger(logger = new RedactingLogger()): WorkerLogger {
  // Scope and metadata can include payloads, URLs, database details and Error causes.
  return new WorkerLogger(() => (level, message) => {
    if (level === "error") logger.error(message);
    else if (level === "warning") logger.warn(message);
    else if (level === "debug") logger.debug(message);
    else logger.log(message);
  });
}

// Existing queue/startup contracts consume these exact, application-owned refusals.
// They are not free text and are still redacted by the console logger above.
const workerRefusals = new Set([
  "TERMS_RELATION_UNAVAILABLE", "SHADOW_TERMS_NOT_ACCEPTED",
  "FINAL_CHECK_FORBIDDEN", "INVALID_FINAL_CHECK_TASK", "QUEUE_UNAVAILABLE",
]);

export function redactedWorkerError(error: unknown, fallback: "WORKER_TASK_FAILED" | "WORKER_START_FAILED" = "WORKER_TASK_FAILED"): Error {
  let code = fallback === "WORKER_START_FAILED" ? "WORKER_START_FAILED" : "WORKER_TASK_FAILED";
  try {
    const message: unknown = error instanceof Error ? Object.getOwnPropertyDescriptor(error, "message")?.value : undefined;
    if (typeof message === "string" && workerRefusals.has(message)) code = message;
  } catch { /* Unknown errors, including hostile proxies, remain generic. */ }
  // Create a fresh error: no original stack, cause, database detail or payload.
  return Object.assign(new Error(code), { code });
}

export function redactingTasks(tasks: TaskList): TaskList {
  return Object.fromEntries(Object.entries(tasks).map(([name, task]) => {
    const safeTask: Task = async (payload, helpers) => {
      try { return await task?.(payload, helpers); }
      // Graphile also persists thrown messages in last_error. Do not attach the cause.
      catch (error) { throw redactedWorkerError(error); }
    };
    return [name, task ? safeTask : undefined];
  }));
}
