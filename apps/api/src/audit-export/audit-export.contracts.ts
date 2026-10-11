import { z } from "zod";
export { auditExportRequestV1, auditExportFileV1, auditExportPayloadV1 } from "@jobguard/db";
export const auditExportSessionV1 = z.string().uuid();
export const auditExportFailureV1 = z.object({ version: z.literal("audit-export-error.v1"), code: z.enum([
  "AUDIT_EXPORT_UNAUTHENTICATED", "AUDIT_EXPORT_FORBIDDEN", "AUDIT_EXPORT_MODE_HELD", "AUDIT_EXPORT_CHECKPOINT_REQUIRED", "AUDIT_EXPORT_INVALID_INPUT", "AUDIT_EXPORT_INVALID", "AUDIT_EXPORT_COMMAND_CONFLICT", "AUDIT_EXPORT_UNAVAILABLE",
]) }).strict();
