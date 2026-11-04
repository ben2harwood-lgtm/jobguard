import { z } from "zod";

/** Owner creation remains with the existing identity bootstrap policy. */
export const memberAdministrationV1 = z.discriminatedUnion("action", [
  z.object({ version: z.literal("member-administration.v1"), action: z.literal("remove"),
    requested_tenant_id: z.guid(), membershipId: z.guid() }).strict(),
  z.object({ version: z.literal("member-administration.v1"), action: z.literal("change_role"),
    requested_tenant_id: z.guid(), membershipId: z.guid(),
    role: z.enum(["admin", "estimator", "foreman", "operative", "finance", "read_only"]) }).strict(),
]);
export const memberAdministrationResultV1 = z.object({
  version: z.literal("member-administration-result.v1"), membershipId: z.guid(), auditId: z.guid(),
}).strict();
