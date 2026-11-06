import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { identityStatus } from "@jobguard/api/identity";
import { z } from "zod";
import { readMerchantDeliveryRecord } from "../../../../lib/merchant-reliability-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
 try {
  const id = (await params).id;
  if (!z.guid().safeParse(id).success || new URL(request.url).search ||
   ["x-tenant-id","x-actor-id","x-session-id"].some(name=>request.headers.has(name))) {
   return NextResponse.json({version:"merchant-record-error.v1",code:"INVALID_INPUT"},{status:400,headers});
  }
  const result = await readMerchantDeliveryRecord((await cookies()).get("jobguard_session")?.value,request.headers.get("origin"),id);
  return NextResponse.json(result,{headers});
 } catch(error) {
  const failure = identityStatus(error);
  return NextResponse.json({version:"merchant-record-error.v1",code:failure.code},{status:failure.status,headers});
 }
}
