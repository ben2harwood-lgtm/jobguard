import "server-only";
import { cookies } from "next/headers";
import { ChangeDraftApplication } from "@jobguard/api/workspace";
import { assertExtraLinkMode } from "@jobguard/db";
import { extraLinkHeaders, extraLinkOrigin } from "./v2-extra-link-server";
import { syntheticPool } from "./synthetic-server";

export const changeDraftHeaders = extraLinkHeaders;
export const changeDraftOrigin = extraLinkOrigin;
export async function changeDraftApplication() {
  assertExtraLinkMode();
  return new ChangeDraftApplication(syntheticPool(), (await cookies()).get("jg_session")?.value);
}

const statuses: Record<string, number> = {
  CHANGE_DRAFT_INVALID_COMMAND: 400, CHANGE_DRAFT_INVALID_QUANTITY: 422, CHANGE_DRAFT_NO_CHANGE: 422,
  CHANGE_DRAFT_LINE_UNPRICED: 422, CHANGE_DRAFT_FORBIDDEN: 403, CHANGE_DRAFT_LINE_NOT_FOUND: 404,
  CHANGE_DRAFT_TASK_NOT_FOUND: 404, CHANGE_DRAFT_NOT_FOUND: 404, CHANGE_DRAFT_COMMAND_CONFLICT: 409,
  CHANGE_DRAFT_VERSION_CONFLICT: 409, CHANGE_DRAFT_NOT_APPROVED: 409,
};
/** A practice-access refusal, wrong mode or wrong origin is one 404; a draft refusal names its code; anything else is 503. */
export function changeDraftFailure(error: unknown) {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && statuses[code]) return Response.json({ code }, { status: statuses[code], headers: changeDraftHeaders });
  if (error instanceof Error && ["LINK_UNAVAILABLE", "NOT_FOUND", "UNAUTHENTICATED", "SYNTHETIC_MODE_REQUIRED", "FORBIDDEN"]
    .some(name => error.message === name || code === name)) {
    return Response.json({ code: "NOT_FOUND" }, { status: 404, headers: changeDraftHeaders });
  }
  return Response.json({ code: "CHANGE_DRAFT_UNAVAILABLE" }, { status: 503, headers: changeDraftHeaders });
}
