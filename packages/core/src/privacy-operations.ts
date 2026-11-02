import { z } from "zod";
const base = { version: z.literal("privacy-command.v1"), commandId: z.string().uuid() };
const target = { requestId: z.string().uuid(), expectedRevision: z.number().int().safe().nonnegative() };
/** No contact details, tenant selector, policy override or caller-supplied instruction actor. */
export const privacyCommandV1 = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("open"), subjectId: z.string().uuid(), operation: z.enum(["access", "export", "delete"]) }).strict(),
  z.object({ ...base, ...target, action: z.literal("instruct"), instructionRef: z.string().uuid(), instructionHash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
  z.object({ ...base, ...target, action: z.literal("execute") }).strict(),
]);
export type PrivacyCommand = z.infer<typeof privacyCommandV1>;
export const privacyQueryV1 = z.object({ version: z.literal("privacy-query.v1"), requestId: z.string().uuid() }).strict();
export const privacyErrorCodes = ["PRIVACY_DISABLED", "PRIVACY_INVALID", "PRIVACY_FORBIDDEN", "PRIVACY_NOT_FOUND", "PRIVACY_CONFLICT", "PRIVACY_INSTRUCTION_REQUIRED", "PRIVACY_UNAVAILABLE"] as const;
export class PrivacyOperationsError extends Error {
  constructor(readonly code: typeof privacyErrorCodes[number]) { super(code); }
}
