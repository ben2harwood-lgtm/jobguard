import type { JobWorkStateEvent } from "@jobguard/core";

type WorkStateRead = { jobId: string; events: JobWorkStateEvent[]; links: { predecessorJobId: string }[]; lock: { id: string } | null };
export type CloseReason = "cancelled_by_customer" | "abandoned" | "completed_outside_jobguard" | "other";

export const workEventLabels: Readonly<Record<JobWorkStateEvent["kind"], string>> = {
 first_site_evidence: "First site evidence", site_activity: "Site activity", finished_on_site: "Finished on site",
 finished_cancelled: "Finished on site cancelled", closed: "Job closed", reopened: "Job reopened", resumed: "Site work resumed",
};
export const closeReasonLabels: Readonly<Record<CloseReason, string>> = {
 cancelled_by_customer: "Cancelled by the customer", abandoned: "Abandoned",
 completed_outside_jobguard: "Completed outside JobGuard", other: "Other",
};

/** Mirrors the server's revision (latest event sequence plus outgoing links) and its marker/close predecessors. The server still decides. */
export function workStateView(read: WorkStateRead) {
 const events = [...read.events].sort((a, b) => a.sequence - b.sequence);
 const revision = (events.at(-1)?.sequence ?? 0) + read.links.filter(link => link.predecessorJobId === read.jobId).length;
 const lastClose = events.filter(event => event.kind === "closed" || event.kind === "reopened").at(-1);
 const closedEventId = lastClose?.kind === "closed" ? lastClose.id : null;
 const marker = events.filter(event => event.kind === "finished_on_site").at(-1);
 const finishedMarkerId = marker && !events.some(event => event.kind === "finished_cancelled" && event.predecessorId === marker.id) ? marker.id : null;
 return { events, revision, closedEventId, finishedMarkerId, locked: read.lock !== null };
}
