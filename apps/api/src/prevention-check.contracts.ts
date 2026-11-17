import { z } from "zod";
export { preventionCommandV1, preventionCommandResultV1, preventionViewV1 } from "@jobguard/core";
export const preventionActionV1 = z.enum(["property", "company", "start_watch", "stop_watch", "evaluate_watch"]);
export function preventionHttpStatus(code: string): number {
  if (code === "NOT_FOUND") return 404;
  if (code === "FORBIDDEN" || code === "SYNTHETIC_ONLY") return 403;
  if (["REVISION_CONFLICT", "COMMAND_CONFLICT", "PARTIES_REQUIRED", "WATCH_NOT_STARTED", "WATCH_ALREADY_STARTED"].includes(code)) return 409;
  return 400;
}
