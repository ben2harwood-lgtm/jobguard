import { describe, expect, it } from "vitest";
import { foldWalkEntries, walkPhotoFilingCommandV1, type WalkEntryRevision, type WalkPhotoFiling } from "../src/v2-walk-repository.js";

const now = new Date("2026-11-25T18:00:00.000Z");
const sessionId = "11111111-1111-4111-8111-111111111111";
function entry(captureOrder: number, room: string | null): WalkEntryRevision & { photoState: null; photoVerifiedAt: null } {
  return { sessionId, captureOrder, commandId: "22222222-2222-4222-8222-222222222222", expectedVersion: 0,
    version: 1, kind: room ? "room" : "photo", room, text: null, quantity: null, unit: null,
    photoId: room ? null : "33333333-3333-4333-8333-333333333333", actorMembershipId: "actor",
    deviceCapturedAt: now, serverReceivedAt: now, photoState: null, photoVerifiedAt: null };
}
const filing = (roomCaptureOrder: number, version = 1): WalkPhotoFiling => ({ sessionId, captureOrder: 1,
  roomCaptureOrder, version, expectedVersion: version - 1, commandId: "44444444-4444-4444-8444-444444444444",
  reason: "no_room", actorMembershipId: "actor", serverReceivedAt: now });

describe("B1C walk filing fold", () => {
  it("keeps unfiled behaviour byte-for-byte with an empty filing list", () => {
    const entries = [entry(1, null), entry(2, "Hall"), entry(4, null)];
    expect(foldWalkEntries(entries, [])).toEqual(foldWalkEntries(entries));
    expect(foldWalkEntries(entries).map(row => row.link)).toEqual(["no_room", "room", "waiting"]);
  });
  it("files a no-room photo under Hall and preserves the original", () => {
    const entries = [entry(1, null), entry(2, "Hall")];
    const original = structuredClone(entries);
    expect(foldWalkEntries(entries, [filing(2)])[0]).toMatchObject({ link: "filed", linkedRoom: "Hall",
      roomCaptureOrder: 2, originalRoomCaptureOrder: null, originalLinkedRoom: null, filingVersion: 1 });
    expect(entries).toEqual(original);
  });
  it("takes the latest filing regardless of input order", () => {
    const rows = foldWalkEntries([entry(1, null), entry(2, "Hall"), entry(3, "Kitchen")], [filing(3, 2), filing(2)]);
    expect(rows[0]).toMatchObject({ linkedRoom: "Kitchen", filingVersion: 2, originalRoomCaptureOrder: null });
  });
  it("keeps a filing when a delayed capture-order room arrives", () => {
    const photo = entry(3, null);
    const filed = { ...filing(4), captureOrder: 3 };
    expect(foldWalkEntries([photo, entry(4, "Hall")], [filed])[0]?.link).toBe("filed");
    expect(foldWalkEntries([entry(1, "Kitchen"), entry(2, "Study"), photo, entry(4, "Hall")], [filed])[2])
      .toMatchObject({ link: "filed", linkedRoom: "Hall", originalRoomCaptureOrder: 2, originalLinkedRoom: "Study" });
  });
  it("uses a strict command boundary without client actor or clock authority", () => {
    const command = { ...filing(2), version: "v2-walk-photo-filing-command.v1" };
    delete (command as Partial<typeof command>).actorMembershipId;
    delete (command as Partial<typeof command>).serverReceivedAt;
    expect(walkPhotoFilingCommandV1.safeParse(command).success).toBe(true);
    expect(walkPhotoFilingCommandV1.safeParse({ ...command, actorMembershipId: "forged" }).success).toBe(false);
    expect(walkPhotoFilingCommandV1.safeParse({ ...command, expectedVersion: -1 }).success).toBe(false);
  });
});
