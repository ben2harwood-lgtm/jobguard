import { cookies } from "next/headers";
import { identityApplication, identityReply } from "../../../lib/identity-server";
import { pilotIdentityRequest } from "../../../lib/pilot-identity-server";
export async function GET(request: Request) {
  if (process.env.JOBGUARD_ENV === "pilot_no_charge") return pilotIdentityRequest(request, async (app, credentials, reply) =>
    reply(await app.session(credentials.sessionToken)));
  return identityReply(async()=>identityApplication().session((await cookies()).get("jobguard_session")?.value));
}
