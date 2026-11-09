import { NextResponse } from "next/server";
/** Retired one-owner switch. Do not parse input, prove a mailbox or construct a service. */
export async function POST(_request:Request) {
 return NextResponse.json({code:"SSO_EMERGENCY_REFUSED"},{status:403,headers:{"Cache-Control":"no-store"}});
}
