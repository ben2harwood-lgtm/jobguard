import { z } from "zod";
export {
  recoveryFollowUpCommandV1, recoveryFollowUpScheduleCommandV1, recoveryFollowUpStateV1, RECOVERY_FOLLOW_UP_RESPONSE_VERSION,
  type RecoveryFollowUpCommand, type RecoveryFollowUpScheduleCommand, type RecoveryFollowUpStateShape,
} from "@jobguard/core";

/** Path identifiers are plain UUIDs; the tenant, actor, mode and authority are never request fields. */
export const recoveryFollowUpIdV1 = z.string().uuid();

/**
 * Replay contract (the same current-state contract M4-5-S fixed on 7 October 2026):
 * GET/POST /recovery-cases/:id/follow-ups and POST /recovery-cases/:id/follow-ups/:followUpId/commands return the CURRENT
 * RecoveryFollowUpState for the case after recognising an identical command ID and payload. They never return a saved first-response snapshot.
 * That holds for schedule, advance_time, open_review, approve_reminder and cancel. A reused ID with a different action, actor, case,
 * follow-up or payload, or one an M4-5-S message command already used, returns RECOVERY_FOLLOW_UP_COMMAND_CONFLICT. Replays recheck access.
 * Revoking, delivering or checking a reminder after its approval is the M4-5-S message command route, unchanged.
 */
export const RECOVERY_FOLLOW_UP_REPLAY_RESULT = "current_state" as const;
