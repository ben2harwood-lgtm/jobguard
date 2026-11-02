import { describe, expect, it } from "vitest";
import type { JobWorkStateEvent } from "@jobguard/core";
import { workStateView } from "./job-work-state-view";

const jobId = "00000000-0000-4000-8000-000000000001";
let next = 0;
function event(kind: JobWorkStateEvent["kind"], sequence: number, extra: Partial<JobWorkStateEvent> = {}): JobWorkStateEvent {
 return { version: "job-work-state-event.v1", id: `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`, jobId, sequence, kind,
  factAt: "2026-10-28T09:00:00.000000Z", recordedAt: "2026-10-28T09:00:00.000000Z", sourceReceiptId: null, commandId: null,
  predecessorId: null, closeReason: null, closeNote: null, ...extra };
}

describe("workStateView", () => {
 it("starts at revision 0 with nothing outstanding", () => {
  expect(workStateView({ jobId, events: [], links: [], lock: null })).toMatchObject({ revision: 0, closedEventId: null, finishedMarkerId: null, locked: false });
 });
 it("adds only outgoing links to the latest sequence, in any event order", () => {
  const view = workStateView({ jobId, events: [event("finished_on_site", 3), event("site_activity", 1)], links: [{ predecessorJobId: jobId }, { predecessorJobId: "other" }], lock: null });
  expect(view.revision).toBe(4);
  expect(view.events.map(e => e.sequence)).toEqual([1, 3]);
 });
 it("an uncancelled finish is the outstanding marker; a cancellation naming it clears it", () => {
  const finish = event("finished_on_site", 1);
  expect(workStateView({ jobId, events: [finish], links: [], lock: null }).finishedMarkerId).toBe(finish.id);
  expect(workStateView({ jobId, events: [finish, event("finished_cancelled", 2, { predecessorId: finish.id })], links: [], lock: null }).finishedMarkerId).toBeNull();
 });
 it("the latest close is current until a reopen follows it", () => {
  const close = event("closed", 1, { closeReason: "abandoned", closeNote: "Fictional" });
  expect(workStateView({ jobId, events: [close], links: [], lock: { id: "lock" } })).toMatchObject({ closedEventId: close.id, locked: true });
  expect(workStateView({ jobId, events: [close, event("reopened", 2, { predecessorId: close.id })], links: [], lock: null }).closedEventId).toBeNull();
 });
});
