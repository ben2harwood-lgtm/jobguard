import { cookies } from "next/headers";
import { identityApplication, identityReply } from "../../../lib/identity-server";
export async function GET() {return identityReply(async()=>identityApplication().session((await cookies()).get("jobguard_session")?.value));}
