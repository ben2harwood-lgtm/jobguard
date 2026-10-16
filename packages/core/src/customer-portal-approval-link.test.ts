import { describe, expect, it } from "vitest";
import { assertCustomerPortalApprovalLinkReference, assertCustomerPortalApprovalLiveLinkDisabled, CUSTOMER_PORTAL_APPROVAL_LIVE_LINKS_ENABLED } from "./customer-portal-approval-link.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const reference = { version: "customer-portal-approval-link-reference.v1", id: id(1), tenantId: id(2), customerId: id(3), jobId: id(4), partyBindingId: id(5), credentialDigest: "a".repeat(64), grantRevision: 1, createdAt: "2026-10-16T12:00:00.000Z", expiresAt: "2026-10-16T12:30:00.000Z", revokedAt: null };
const presented = { linkId: id(1), tenantId: id(2), customerId: id(3), jobId: id(4), partyBindingId: id(5), credentialDigest: "a".repeat(64), grantRevision: 1 };
const now = new Date("2026-10-16T12:01:00.000Z");

describe("customer portal pure link reference; never authenticates a customer", () => {
  it("MP-09 validates reference binding without granting access", () => {
    expect(assertCustomerPortalApprovalLinkReference(reference, presented, now)).toBeUndefined();
  });
  it("MP-09 refuses forged expired revoked stale and future references including retries", () => {
    const invalid = [null, { ...reference, credentialDigest: "b".repeat(64) }, { ...reference, expiresAt: now.toISOString() }, { ...reference, revokedAt: "2026-10-16T12:00:30.000Z" }, { ...reference, grantRevision: 2 }, { ...reference, createdAt: "2026-10-16T12:02:00.000Z" }, { ...reference, expiresAt: reference.createdAt }];
    for (const value of invalid) for (let attempt = 0; attempt < 2; attempt++) expect(() => assertCustomerPortalApprovalLinkReference(value, presented, now)).toThrow("LINK_UNAVAILABLE");
    expect(() => assertCustomerPortalApprovalLinkReference(reference, presented, new Date("invalid"))).toThrow("LINK_UNAVAILABLE");
  });
  it("MP-13 and MP-14 expose only the exact customer job and party binding and refuse enumeration identically", () => {
    const refusals: unknown[] = [];
    for (const key of ["linkId", "tenantId", "customerId", "jobId", "partyBindingId", "credentialDigest", "grantRevision"]) {
      const changed = { ...presented, [key]: key === "grantRevision" ? 2 : key === "credentialDigest" ? "b".repeat(64) : id(9) };
      try { assertCustomerPortalApprovalLinkReference(reference, changed, now); } catch (error) { refusals.push(error); }
    }
    try { assertCustomerPortalApprovalLinkReference(null, presented, now); } catch (error) { refusals.push(error); }
    expect(refusals).toHaveLength(8);
    expect(refusals.map(error => ({ name: (error as Error).name, message: (error as Error).message }))).toEqual(Array.from({ length: 8 }, () => ({ name: "CustomerPortalApprovalError", message: "LINK_UNAVAILABLE" })));
  });
  it("MP-23 live links stay off for valid invalid and absent credentials in every deployment", () => {
    expect(CUSTOMER_PORTAL_APPROVAL_LIVE_LINKS_ENABLED).toBe(false);
    for (const value of [reference, null, { ...reference, enabled: true, environment: "synthetic_demo" }]) {
      expect(() => assertCustomerPortalApprovalLiveLinkDisabled(value)).toThrow("LINK_UNAVAILABLE");
    }
  });
});
