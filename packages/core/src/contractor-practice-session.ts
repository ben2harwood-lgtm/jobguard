import { z } from "zod";
/** Documentation ceiling only; PostgreSQL owns every session deadline. */
export const CONTRACTOR_PRACTICE_SESSION_CEILING_DAYS = 7;
export const contractorPracticeSessionRevokeV1 = z.object({ version: z.literal("contractor-practice-session-revoke.v1") }).strict();
export const contractorPracticeSessionRevokedV1 = z.object({
 version: z.literal("contractor-practice-session-revoked.v1"), environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0), revokedAt: z.string().datetime({ precision: 6 }),
}).strict();
export const contractorPracticeSessionErrorCodes = ["UNAUTHENTICATED", "MODE_FORBIDDEN", "ORIGIN_FORBIDDEN", "INVALID_COMMAND", "PRACTICE_SESSION_UNAVAILABLE"] as const;
export type ContractorPracticeSessionErrorCode = typeof contractorPracticeSessionErrorCodes[number];
export const contractorPracticeSessionFailureV1 = z.object({ version: z.literal("contractor-practice-session-error.v1"), code: z.enum(contractorPracticeSessionErrorCodes) }).strict();
export class ContractorPracticeSessionError extends Error {
 constructor(readonly code: ContractorPracticeSessionErrorCode) { super(code); this.name = "ContractorPracticeSessionError"; }
}
export function contractorPracticeSessionHttpStatus(code: ContractorPracticeSessionErrorCode): number {
 return { UNAUTHENTICATED: 401, MODE_FORBIDDEN: 403, ORIGIN_FORBIDDEN: 403, INVALID_COMMAND: 400, PRACTICE_SESSION_UNAVAILABLE: 503 }[code];
}
