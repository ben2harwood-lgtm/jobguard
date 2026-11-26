import type { WalkEntryCommand, WalkEntryView, WalkSession } from "@jobguard/api/workspace";

export type EntryView = Omit<WalkEntryView, "deviceCapturedAt" | "serverReceivedAt" | "photo"> & {
  deviceCapturedAt: string; serverReceivedAt: string;
};
export type SessionView = Omit<WalkSession, "deviceStartedAt" | "serverReceivedAt"> & {
  deviceStartedAt: string; serverReceivedAt: string; entries: EntryView[];
};
export type EntryBody = Exclude<WalkEntryCommand["entry"], { kind: "photo" }>;

export function nextCaptureOrder(entries: readonly Pick<EntryView, "captureOrder">[]) {
  return Math.max(0, ...entries.map(entry => entry.captureOrder)) + 1;
}

// Room identity follows capture order. Neither device nor receipt clocks choose it.
export function currentRoom(entries: readonly EntryView[]) {
  return entries.filter(entry => entry.kind === "room").sort((a, b) => b.captureOrder - a.captureOrder)[0] ?? null;
}

export function newEntry(sessionId: string, entries: readonly EntryView[], entry: EntryBody,
  commandId: string, deviceCapturedAt: string): WalkEntryCommand {
  return { version: "v2-walk-entry-command.v1", sessionId, commandId,
    captureOrder: nextCaptureOrder(entries), expectedVersion: 0, deviceCapturedAt, entry };
}

export function validMeasurement(quantity: string) {
  return quantity.length <= 40 && /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/u.test(quantity) && /[1-9]/u.test(quantity);
}

// Codex P2 4705257589: a refused slot is permanent, so the preserved content goes back into the form to resubmit.
// Codex P2 4711069734: only the rejected entry's own fields come back, so other unsent drafts stay.
export function restoreEntry(entry: WalkEntryCommand["entry"]): { room?: string; note?: string; quantity?: string; unit?: string } | null {
  return entry.kind === "room" ? { room: entry.room }
    : entry.kind === "note" ? { note: entry.text }
    : entry.kind === "measurement" ? { quantity: entry.quantity, unit: entry.unit }
    : null;
}

// Codex P2 4705257574: in-app links and the job section buttons leave the walk without a beforeunload.
export function leavesWalk(target: { closest(selector: string): unknown } | null) {
  return Boolean(target?.closest("a[href], nav button"));
}
