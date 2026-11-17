import { identityApplication, identityReply } from "../../../lib/identity-server";
export async function POST(request:Request) {
  // Fail-closed shared web bucket; do not trust arbitrary forwarded IP headers.
  return identityReply(()=>request.json().then(raw=>identityApplication().request(raw,"web-bootstrap",request.headers.get("origin")??undefined)));
}
