import { z } from "zod";
export { contractorCustomerLinkV1, contractorPartyResultV1, contractorResidentReadV1 } from "@jobguard/core";
export const contractorPartiesPrincipalV1 = z.object({ version: z.literal("contractor-principal.v1"), sessionId: z.string().uuid() }).strict();
export const contractorPartiesFailureV1 = z.object({ version: z.literal("contractor-parties-error.v1"), code: z.string(), recoverable: z.boolean() }).strict();
