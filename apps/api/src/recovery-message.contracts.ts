import { z } from "zod";
export {
  recoveryMessageCommandV1, recoveryMessagePreviewCommandV1, recoveryMessageOutcomesV1, recoveryMessageRecipientV1,
  type RecoveryMessageCommand, type RecoveryMessagePreviewCommand,
} from "@jobguard/core";

/** Path identifiers are plain UUIDs; the tenant, actor, mode and authority are never request fields. */
export const recoveryMessageIdV1 = z.string().uuid();
export const RECOVERY_MESSAGE_RESPONSE_VERSION = "recovery-message-response.v1" as const;
