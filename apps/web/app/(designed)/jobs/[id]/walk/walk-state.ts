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

// B1C: clock warnings remain visible even after an explicit filing.
export function needsRoom(entries: readonly EntryView[]) {
  return entries.filter(entry => entry.kind === "photo" &&
    (entry.link === "no_room" || entry.link === "waiting" || entry.clock.flagged));
}

// B1C: a photo filed under a room belongs to that room's summary, like a linked one.
export function roomSummaryEntries(entries: readonly EntryView[], roomName: string | null | undefined) {
  return entries.filter(entry => (entry.link === "linked" || entry.link === "filed") && entry.linkedRoom === roomName);
}

export function filingLabel(entry: EntryView) {
  return entry.link === "filed"
    ? `Filed under ${entry.linkedRoom} (taken in ${entry.originalLinkedRoom ?? "no room"})`
    : entry.link === "linked" ? entry.linkedRoom ?? "Room link needs checking" : "Room link needs checking";
}
