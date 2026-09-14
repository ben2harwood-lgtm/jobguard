import "server-only";
import type { JobSummary } from "./contracts";

export const TENANTS = [
  { id: "11111111-1111-4111-8111-111111111111", name: "North & Sons" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Empty Workshop" },
] as const;
export const SYNTHETIC_SESSION = "synthetic-m1-session";
const jobs: readonly JobSummary[] = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: TENANTS[0].id, title: "Kitchen extension", customerLabel: "Synthetic customer · SE15", status: "live", document: { kind: "quote", reference: "Q-1007", delivery: "delivered" }, customerPayment: "not_due", pilotNoCharge: true, updatedLabel: "Updated today" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", tenantId: TENANTS[0].id, title: "Loft conversion", customerLabel: "Synthetic customer · N4", status: "quoting", document: { kind: "quote", reference: "Q-1008", delivery: "queued" }, customerPayment: "not_due", pilotNoCharge: true, updatedLabel: "Updated yesterday" },
  { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", tenantId: TENANTS[1].id, title: "Hidden tenant job", customerLabel: "Never disclose", status: "draft", document: { kind: "none", reference: null, delivery: "not_sent" }, customerPayment: "not_due", pilotNoCharge: true, updatedLabel: "Updated today" },
];

export function hasSyntheticSession(value: string | undefined) { return value === SYNTHETIC_SESSION; }
export function isMember(tenantId: string) { return TENANTS.some((tenant) => tenant.id === tenantId); }
export function tenantJobs(tenantId: string) {
  // Keep tenant filtering at the server boundary. Tenant IDs from URLs are never authority.
  return tenantId === TENANTS[1].id ? [] : jobs.filter((job) => job.tenantId === tenantId);
}
