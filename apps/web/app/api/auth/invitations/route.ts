import { identityApplication, identityCredentials, identityReply } from "../../../lib/identity-server";
export async function POST(request:Request) {return identityReply(async()=>identityApplication().invite(await request.json(),await identityCredentials(request)));}
