import "server-only";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {BillingApplication,billingHttpFailure} from "@jobguard/api/workspace";
import {syntheticPool} from "../../../../../lib/synthetic-server";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
 const headers={"cache-control":"no-store"};
 try{const {id}=await context.params;return NextResponse.json(await new BillingApplication(syntheticPool()).read((await cookies()).get("jg_session")?.value,id),{headers});}
 catch(e){const f=billingHttpFailure(e);return NextResponse.json(f.body,{status:f.status,headers});}
}
