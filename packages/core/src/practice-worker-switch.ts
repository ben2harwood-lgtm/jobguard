import { z } from "zod";

/** Documentation only; PostgreSQL owns the fixed switch window. */
export const PRACTICE_WORKER_SWITCH_WINDOW_MINUTES = 30;

export const practiceWorkerSwitchOnV1 = z.object({
  version: z.literal("practice-worker-switch-on.v1"),
  commandId: z.guid({ error: "Invalid uuid" }),
}).strict();

export const practiceWorkerSwitchOffV1 = z.object({
  version: z.literal("practice-worker-switch-off.v1"),
  commandId: z.guid({ error: "Invalid uuid" }),
}).strict();

/** Public facts only. Session row numbers and authority stay server-side. */
export const practiceWorkerSwitchStateV1 = z.object({
  version: z.literal("practice-worker-switch-state.v1"),
  environment: z.literal("synthetic_demo"),
  realExternalActions: z.literal(0),
  state: z.enum(["owner", "acting", "unclosed"]),
  switchId: z.guid({ error: "Invalid uuid" }).nullable(),
  workerMembershipId: z.guid({ error: "Invalid uuid" }).nullable(),
  startedAt: z.iso.datetime({ precision: 6, error: "Invalid datetime" }).nullable(),
  expiresAt: z.iso.datetime({ precision: 6, error: "Invalid datetime" }).nullable(),
  endedAt: z.iso.datetime({ precision: 6, error: "Invalid datetime" }).nullable(),
  endReason: z.enum(["switched_back", "expired"]).nullable(),
}).strict();

export const practiceWorkerSwitchErrorCodes = [
  "UNAUTHENTICATED", "MODE_FORBIDDEN", "ORIGIN_FORBIDDEN", "SWITCH_FORBIDDEN",
  "INVALID_COMMAND", "NOT_FOUND", "SWITCH_OPEN", "NOT_ACTING", "COMMAND_CONFLICT",
  "SWITCH_UNAVAILABLE",
] as const;

export type PracticeWorkerSwitchErrorCode = typeof practiceWorkerSwitchErrorCodes[number];

export const practiceWorkerSwitchFailureV1 = z.object({
  version: z.literal("practice-worker-switch-error.v1"),
  code: z.enum(practiceWorkerSwitchErrorCodes),
}).strict();

export class PracticeWorkerSwitchError extends Error {
  constructor(readonly code: PracticeWorkerSwitchErrorCode) {
    super(code);
    this.name = "PracticeWorkerSwitchError";
  }
}

export function practiceWorkerSwitchHttpStatus(code: PracticeWorkerSwitchErrorCode): number {
  return {
    UNAUTHENTICATED: 401, MODE_FORBIDDEN: 403, ORIGIN_FORBIDDEN: 403, SWITCH_FORBIDDEN: 403,
    INVALID_COMMAND: 400, NOT_FOUND: 404, SWITCH_OPEN: 409, NOT_ACTING: 409,
    COMMAND_CONFLICT: 409, SWITCH_UNAVAILABLE: 503,
  }[code];
}
