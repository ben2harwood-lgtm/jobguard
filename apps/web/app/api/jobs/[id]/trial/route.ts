import { trialReply } from "../../../../lib/trial-server";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return trialReply(request,(await params).id,"read");}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return trialReply(request,(await params).id,"command");}
