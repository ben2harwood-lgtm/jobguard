import { identityApplication, identityClientAddress, identityReply } from "../../../lib/identity-server";
export async function POST(request:Request) {
  return identityReply(()=>request.json().then(raw=>identityApplication().request(raw,identityClientAddress(request),request.headers.get("origin")??undefined)));
}
