import { z } from "zod";

/** Versioned schemas for every authentication input boundary. */
export const challengeRequestV1 = z.object({
  email: z.email({ error: "Invalid email" }).max(320),
  purpose: z.enum(["signup", "signin", "invitation"]),
  invitationId: z.guid({ error: "Invalid uuid" }).optional(),
  ip: z.string().min(1).max(64),
}).strict();

export const verifyCodeV1 = z.object({
  email: z.email({ error: "Invalid email" }).max(320),
  purpose: z.enum(["signup", "signin", "invitation"]),
  invitationId: z.guid({ error: "Invalid uuid" }).optional(),
  code: z.string().regex(/^\d{8}$/u),
}).strict();

export const tenantRequestCredentialsV1 = z.object({
  sessionToken: z.string().min(32).optional(),
  requestedTenantId: z.guid({ error: "Invalid uuid" }).optional(),
  tenantHeader: z.guid({ error: "Invalid uuid" }).optional(),
  csrfToken: z.string().min(24).optional(),
  origin: z.url({ error: "Invalid url" }).optional(),
}).strict();
