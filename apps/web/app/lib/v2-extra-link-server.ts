import "server-only";
import { cookies } from "next/headers";
import { V2CustomerExtraLinkApplication } from "@jobguard/api/workspace";
import { assertExtraLinkMode } from "@jobguard/db";
import { syntheticPool } from "./synthetic-server";

export const extraLinkHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
export async function extraLinkApplication() {
  assertExtraLinkMode();
  return new V2CustomerExtraLinkApplication(syntheticPool(), (await cookies()).get("jg_session")?.value);
}
export function extraLinkFailure() {
  return Response.json({ code: "LINK_UNAVAILABLE" }, { status: 404, headers: extraLinkHeaders });
}
export function extraLinkOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new Error("LINK_UNAVAILABLE");
}
