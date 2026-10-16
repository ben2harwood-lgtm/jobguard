import { z } from "zod";
import { CustomerPortalApprovalError } from "./customer-portal-approval.js";

const uuid = z.string().uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.number().int().safe().positive();
const timestamp = z.string().datetime();

/** Pure stored-reference contract. No raw credential, issuance, delivery or identity verification. */
export const customerPortalApprovalLinkReferenceV1 = z.object({
  version: z.literal("customer-portal-approval-link-reference.v1"), id: uuid,
  tenantId: uuid, customerId: uuid, jobId: uuid, partyBindingId: uuid,
  credentialDigest: digest, grantRevision: revision, createdAt: timestamp,
  expiresAt: timestamp, revokedAt: timestamp.nullable(),
}).strict();
const presentedV1 = z.object({
  linkId: uuid, tenantId: uuid, customerId: uuid, jobId: uuid, partyBindingId: uuid,
  credentialDigest: digest, grantRevision: revision,
}).strict();

/** This is not authentication. A future server must independently verify identity and digest. */
export function assertCustomerPortalApprovalLinkReference(stored: unknown, presented: unknown, now: Date): void {
  const reference = customerPortalApprovalLinkReferenceV1.safeParse(stored);
  const request = presentedV1.safeParse(presented);
  const unavailable = () => { throw new CustomerPortalApprovalError("LINK_UNAVAILABLE"); };
  if (!reference.success || !request.success || !(now instanceof Date) || !Number.isFinite(now.getTime())) return unavailable();
  const link = reference.data, binding = request.data;
  if (link.id !== binding.linkId || link.tenantId !== binding.tenantId || link.customerId !== binding.customerId ||
      link.jobId !== binding.jobId || link.partyBindingId !== binding.partyBindingId ||
      link.credentialDigest !== binding.credentialDigest || link.grantRevision !== binding.grantRevision ||
      link.revokedAt !== null || Date.parse(link.createdAt) > now.getTime() || Date.parse(link.expiresAt) <= now.getTime()) return unavailable();
}

/** Founder-held live authentication: there is intentionally no enabling option. */
export const CUSTOMER_PORTAL_APPROVAL_LIVE_LINKS_ENABLED = false as const;
export function assertCustomerPortalApprovalLiveLinkDisabled(_request: unknown): never {
  throw new CustomerPortalApprovalError("LINK_UNAVAILABLE");
}
