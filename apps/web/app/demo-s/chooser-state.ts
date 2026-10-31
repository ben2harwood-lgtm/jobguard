import { smallBuilderDemoHttpCommandV1, type SmallBuilderDemoHttpCommand } from "@jobguard/core";
// Only lifecycle intent is stored. The server checks current company membership before any replay.
export function pendingKey(tenantId: string, membershipId: string) { return `demo-s.pending.v1:${tenantId}:${membershipId}`; }
export function readPending(value: string | null): SmallBuilderDemoHttpCommand | null {
  try { const parsed = smallBuilderDemoHttpCommandV1.safeParse(JSON.parse(value ?? "null")); return parsed.success ? parsed.data : null; }
  catch { return null; }
}
export function demoLink(tenantId: string, runId: string, snapshotId?: string) {
  return `/demo-s?${new URLSearchParams({ tenantId, runId, ...(snapshotId ? { snapshotId } : {}) })}`;
}
export const journeyChoices = [
  { scenario: "core-1000", journey: "DEMO-J1", title: "Core £1,000 job", reason: "The separate core-1000 guide is available. Selection-linked launch and end-to-end completion are not ready yet." },
  { scenario: "recovery-18800", journey: "DEMO-J2", title: "Recovery £18,800 job", reason: "The guided recovery journey, collection, refund and money reconciliation bindings are not ready yet." },
  { scenario: "shadow-30000", journey: "DEMO-J3", title: "Final Check £30,000 job", reason: "Available through the final-account lock. Customer approval and later steps are not ready yet." },
  { scenario: "meter", journey: "DEMO-J4", title: "Jobs-on-the-go meter", reason: "Reference producer previews are available after saving. Persisted billing and trial journeys are not ready yet." },
  { scenario: "trial", journey: "DEMO-J5", title: "First-job trial", reason: "The guided trial, identity, card setup and reference clock bindings are not ready yet." },
] as const;
export const meterProfiles = [
  "DM-01 · Solo across twelve months", "DM-02 · Builder across twelve months",
  "DM-03 · Builder eight places", "DM-04 · Eighth place for half a month",
  "DM-05 · Builder twelve places", "DM-06 · Solo five places", "DM-07 · Solo grace place",
  "DM-08 · Upgrade during the month", "DM-09 · Eighth place for one day",
  "DM-10 · Builder 13–17 places and track review", "DM-11 · Sustained use above seven",
  "DM-12 · Lifecycle and grouping", "DM-13 · Capacity and concurrent admissions",
] as const;

// Enable only journeys whose real guide and result reader exist in this checkout.
export function journeyAvailable(scenario: string) { return scenario === "shadow-30000"; }
