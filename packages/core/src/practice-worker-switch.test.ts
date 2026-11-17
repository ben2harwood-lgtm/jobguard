import { describe, expect, it } from "vitest";
import {
  PRACTICE_WORKER_SWITCH_WINDOW_MINUTES,
  PracticeWorkerSwitchError,
  practiceWorkerSwitchErrorCodes,
  practiceWorkerSwitchFailureV1,
  practiceWorkerSwitchHttpStatus,
  practiceWorkerSwitchOffV1,
  practiceWorkerSwitchOnV1,
  practiceWorkerSwitchStateV1,
} from "./practice-worker-switch.js";

const randomUUID = () => crypto.randomUUID();

const authorityFields = [
  "tenantId", "tenant_id", "requested_tenant_id", "membershipId", "workerMembershipId",
  "targetMembershipId", "ownerMembershipId", "actorMembershipId", "identityUserId",
  "sessionId", "session", "sessionRef", "digest", "sessionDigest", "role", "grantId",
  "environment", "marker", "markedAt", "startedAt", "expiresAt", "endedAt", "minutes",
  "window", "reason", "switchId", "other",
];
const commands = [
  { schema: practiceWorkerSwitchOnV1, version: "practice-worker-switch-on.v1" },
  { schema: practiceWorkerSwitchOffV1, version: "practice-worker-switch-off.v1" },
];
const state = {
  version: "practice-worker-switch-state.v1", environment: "synthetic_demo", realExternalActions: 0,
  state: "owner", switchId: null, workerMembershipId: null, startedAt: null, expiresAt: null,
  endedAt: null, endReason: null,
};

describe("practice worker switch public boundaries", () => {
  for (const command of commands) {
    it(`[PW21] ${command.version} accepts only the minimal versioned command`, () => {
      const body = { version: command.version, commandId: randomUUID() };
      expect(command.schema.parse(body)).toEqual(body);
      for (const invalid of [null, [], {}, { ...body, version: "v2" }, { ...body, commandId: "invalid" }, { version: command.version }]) {
        expect(command.schema.safeParse(invalid).success).toBe(false);
      }
    });
    it.each(authorityFields)(`[PW21] ${command.version} refuses authority field %s`, field => {
      expect(command.schema.safeParse({ version: command.version, commandId: randomUUID(), [field]: randomUUID() }).success).toBe(false);
    });
  }

  it("[PW23] the public state accepts the three states with nullable facts", () => {
    expect(practiceWorkerSwitchStateV1.parse(state)).toEqual(state);
    for (const value of ["acting", "unclosed"]) {
      const body = { ...state, state: value, switchId: randomUUID(), workerMembershipId: randomUUID(), startedAt: "2026-10-15T10:00:00.123456Z", expiresAt: "2026-10-15T10:30:00.123456Z" };
      expect(practiceWorkerSwitchStateV1.parse(body)).toEqual(body);
    }
    for (const endReason of ["switched_back", "expired"]) {
      const body = { ...state, switchId: randomUUID(), workerMembershipId: randomUUID(), startedAt: "2026-10-15T10:00:00.123456Z", expiresAt: "2026-10-15T10:30:00.123456Z", endedAt: "2026-10-15T10:15:00.123456Z", endReason };
      expect(practiceWorkerSwitchStateV1.parse(body)).toEqual(body);
    }
    expect(PRACTICE_WORKER_SWITCH_WINDOW_MINUTES).toBe(30);
  });

  it.each(["session", "sessionId", "sessionRef", "digest", "sessionDigest", "tenantId", "identityUserId", "email", "marker"])("[PW23] no public state carries %s", field => {
    expect(practiceWorkerSwitchStateV1.safeParse({ ...state, [field]: randomUUID() }).success).toBe(false);
  });

  it("[PW23] state fields reject invalid identities, times, versions and environment", () => {
    for (const changed of [
      { state: "unknown" }, { environment: "pilot_no_charge" }, { realExternalActions: 1 },
      { version: "v2" }, { switchId: "invalid" }, { workerMembershipId: "invalid" },
      { startedAt: "invalid" }, { expiresAt: "invalid" }, { endedAt: "invalid" }, { endReason: "other" },
      { startedAt: "2026-10-15T10:00:00Z" },
    ]) expect(practiceWorkerSwitchStateV1.safeParse({ ...state, ...changed }).success).toBe(false);
    for (const field of Object.keys(state)) {
      const incomplete: Record<string, unknown> = { ...state };
      delete incomplete[field];
      expect(practiceWorkerSwitchStateV1.safeParse(incomplete).success).toBe(false);
    }
  });

  it("[PW24] every closed failure has exactly its specified HTTP status", () => {
    const statuses = {
      UNAUTHENTICATED: 401, MODE_FORBIDDEN: 403, ORIGIN_FORBIDDEN: 403, SWITCH_FORBIDDEN: 403,
      INVALID_COMMAND: 400, NOT_FOUND: 404, SWITCH_OPEN: 409, NOT_ACTING: 409,
      COMMAND_CONFLICT: 409, SWITCH_UNAVAILABLE: 503,
    };
    expect([...practiceWorkerSwitchErrorCodes].sort()).toEqual(Object.keys(statuses).sort());
    for (const code of practiceWorkerSwitchErrorCodes) {
      const body = { version: "practice-worker-switch-error.v1", code };
      expect(practiceWorkerSwitchFailureV1.parse(body)).toEqual(body);
      expect(practiceWorkerSwitchHttpStatus(code)).toBe(statuses[code]);
      const error = new PracticeWorkerSwitchError(code);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("PracticeWorkerSwitchError");
      expect(error.message).toBe(code);
      expect(error.code).toBe(code);
    }
  });

  it("[PW23] failures expose only the version and the closed code", () => {
    const failure = { version: "practice-worker-switch-error.v1", code: "SWITCH_UNAVAILABLE" };
    for (const changed of [{ ...failure, detail: "private database diagnostic" }, { ...failure, code: "OTHER" }, { ...failure, version: "v2" }, { code: failure.code }, { version: failure.version }, null]) {
      expect(practiceWorkerSwitchFailureV1.safeParse(changed).success).toBe(false);
    }
  });
});
