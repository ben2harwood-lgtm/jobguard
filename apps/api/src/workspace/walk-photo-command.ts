import { z } from "zod";

/** V2-B1E: "Take photo" on the walk. The photo id is the command id, so a retry can't add a second upload. */
export const walkPhotoCommandV1 = z.strictObject({
  version: z.literal("v2-walk-photo-command.v1"),
  commandId: z.uuid().transform(value => value.toLowerCase()),
  fixture: z.enum(["completion-photo", "j3-drainage-photo"]),
});
export type WalkPhotoCommand = z.input<typeof walkPhotoCommandV1>;
