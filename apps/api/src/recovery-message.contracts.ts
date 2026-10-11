import { z } from "zod";
export {
  recoveryMessageCommandV1, recoveryMessagePreviewCommandV1, recoveryMessageOutcomesV1, recoveryMessageRecipientV1,
  type RecoveryMessageCommand, type RecoveryMessagePreviewCommand,
} from "@jobguard/core";

/** Path identifiers are plain UUIDs; the tenant, actor, mode and authority are never request fields. */
export const recoveryMessageIdV1 = z.string().uuid();
export const RECOVERY_MESSAGE_RESPONSE_VERSION = "recovery-message-response.v1" as const;

/**
 * Replay contract — Ben's Command Center decision, 7 October 2026: CURRENT state.
 * POST /recovery-cases/:id/messages and POST /recovery-cases/:id/messages/:messageId/commands
 * (also exposed at the same /api/... Next routes) return the current RecoveryMessageState for the case after
 * recognising an identical command ID/payload. They do not return a saved first-response snapshot.
 * This applies to preview, approve, advance, revoke (cancel approval), and reconcile, including replay after
 * delivery, cancellation, retry or a replacement preview. `messages` retains the addressed message's history;
 * `latest` can identify a later replacement. Replays recheck access and must not duplicate approval/delivery.
 * A reused ID with a different action, actor, case, message or payload returns RECOVERY_MESSAGE_COMMAND_CONFLICT.
 */
export const RECOVERY_MESSAGE_REPLAY_RESULT = "current_state" as const;
