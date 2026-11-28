import { AuthError } from "@jobguard/api/identity";
import { CrewContactError, type CrewContactCommand } from "@jobguard/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { enforcePracticePair } from "../../../lib/linked-practice-entry";
import { hasSyntheticSession, practiceFailure, syntheticPool } from "../../../lib/synthetic-server";
import { isTrustedBrowserOrigin } from "../../contractor/origin";
import { workspaceApplication } from "../../../lib/workspace-server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

function failure(code: string, status: number) {
  return NextResponse.json({ code }, { status, headers });
}

const statuses: Record<CrewContactError["code"], number> = {
  CREW_CONTACT_INVALID: 400, CREW_CONTACT_VERSION_CONFLICT: 409, CREW_CONTACT_COMMAND_CONFLICT: 409,
  CREW_CONTACT_EDITOR_REQUIRED: 403,
};

function refusal(error: unknown) {
  if (error instanceof CrewContactError) {
    return failure(error.code === "CREW_CONTACT_EDITOR_REQUIRED" ? "FORBIDDEN" : error.code, statuses[error.code]);
  }
  if (error instanceof AuthError) {
    return error.code === "UNAUTHENTICATED" ? failure("UNAUTHENTICATED", 401) : failure("FORBIDDEN", 403);
  }
  return practiceFailure(error) ?? failure("CREW_CONTACT_UNAVAILABLE", 503);
}

// A linked practice session must also carry its exact browser pairing, before any read or write.
async function signedIn() {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") return failure("NOT_FOUND", 404);
  const sessionId = (await cookies()).get("jg_session")?.value;
  if (!hasSyntheticSession(sessionId)) return failure("UNAUTHENTICATED", 401);
  try {
    await enforcePracticePair(syntheticPool(), sessionId);
  } catch (error) {
    return refusal(error);
  }
  return null;
}

// V2-C3C-UI, V2 only. The signed-in firm's crew records (the current revision of each).
// Row security keeps every other firm's records out of the list.
export async function GET() {
  const refused = await signedIn();
  if (refused) return refused;
  try {
    const crew = await (await workspaceApplication()).crewContacts.list({ version: "crew-contact-query.v1" });
    return NextResponse.json({ crew }, { headers });
  } catch (error) {
    return refusal(error);
  }
}

// One crew-contact.v1 command, passed to CrewContactApplication.record unchanged: a commandId
// replays, expectedRevision guards a correction, and the made-up phone and .invalid email rules apply.
export async function POST(request: Request) {
  const refused = await signedIn();
  if (refused) return refused;
  // Rule 21: configured origins only, never the request URL or forwarded headers.
  if (!isTrustedBrowserOrigin(request)) return failure("ORIGIN_FORBIDDEN", 403);
  let body: unknown;
  try { body = await request.json(); } catch { return failure("CREW_CONTACT_INVALID", 400); }
  try {
    const contact = await (await workspaceApplication()).crewContacts.record(body as CrewContactCommand);
    return NextResponse.json(contact, { status: 201, headers });
  } catch (error) {
    return refusal(error);
  }
}
