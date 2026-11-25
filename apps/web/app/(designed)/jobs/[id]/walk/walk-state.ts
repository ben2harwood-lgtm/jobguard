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
