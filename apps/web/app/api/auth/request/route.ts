import { identityApplication, identityClientAddress, identityReply } from "../../../lib/identity-server";
import { pilotIdentityRequest } from "../../../lib/pilot-identity-server";
export async function POST(request:Request) {
  if (process.env.JOBGUARD_ENV === "pilot_no_charge") return pilotIdentityRequest(request, async (app, credentials, reply) =>
    reply(await app.request(await request.json(), identityClientAddress(request), credentials.origin, credentials)));
  return identityReply(()=>request.json().then(raw=>identityApplication().request(raw,identityClientAddress(request),request.headers.get("origin")??undefined)));
}
