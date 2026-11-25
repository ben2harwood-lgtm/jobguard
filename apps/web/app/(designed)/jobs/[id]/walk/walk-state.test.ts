import { describe, expect, it } from "vitest";
import { currentRoom, newEntry, nextCaptureOrder, validMeasurement, type EntryView } from "./walk-state";

const row = (captureOrder: number, room: string, deviceCapturedAt: string) =>
  ({ captureOrder, room, kind: "room", deviceCapturedAt } as EntryView);
describe("B1B device capture order", () => {
  it("starts at one and resumes after the largest saved slot, independent of clocks", () => {
    const entries = [row(3, "Hall", "2000-01-01"), row(1, "Kitchen", "2099-01-01")];
    expect(nextCaptureOrder([])).toBe(1);
    expect(nextCaptureOrder(entries)).toBe(4);
    expect(currentRoom(entries)?.room).toBe("Hall");
    expect(entries[0]?.captureOrder).toBe(3);
    const command = newEntry("session", entries, { kind: "note", text: "Check tiles" }, "command", "phone-clock");
    expect(command).toEqual({ version: "v2-walk-entry-command.v1", sessionId: "session", commandId: "command",
      captureOrder: 4, expectedVersion: 0, deviceCapturedAt: "phone-clock", entry: { kind: "note", text: "Check tiles" } });
  });
  it.each(["0", "-1", "01", "1e2", "1.1234567", "NaN", " 1", "1."])("refuses invalid quantity %s", value => {
    expect(validMeasurement(value)).toBe(false);
  });
  it.each(["1", "14.5", "0.000001", "1.123456"])("keeps exact quantity %s", value => {
    expect(validMeasurement(value)).toBe(true);
  });
});
