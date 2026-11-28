import { identityApplication, identityCredentials, identityReply } from "../../../lib/identity-server";
import { pilotIdentityRequest } from "../../../lib/pilot-identity-server";
export async function POST(request:Request) {
  if (process.env.JOBGUARD_ENV === "pilot_no_charge") return pilotIdentityRequest(request, async (app, credentials, reply) =>
    reply(await app.invite(await request.json(), credentials)));
  return identityReply(async()=>identityApplication().invite(await request.json(),await identityCredentials(request)));
}
