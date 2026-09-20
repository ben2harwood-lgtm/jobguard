import{cookies}from"next/headers";import{NextResponse}from"next/server";
import{hasSyntheticSession}from"../../../../../../../lib/synthetic-server";
import{workspaceApplication}from"../../../../../../../lib/workspace-server";
import{receiptHttpError}from"../../../../../../../lib/receipt-http-error";
export async function POST(request:Request,{params}:{params:Promise<{id:string;invoiceId:string}>}){
 if(!hasSyntheticSession((await cookies()).get("jg_session")?.value))return NextResponse.json({code:"UNAUTHENTICATED"},{status:401});
 try{const{id,invoiceId}=await params;return NextResponse.json(await workspaceApplication().customerInvoice.reverseReceipt(id,{...await request.json(),invoiceId}),{headers:{"Cache-Control":"no-store"}});}
 catch(error){const result=receiptHttpError(error,true);return NextResponse.json({code:result.code},{status:result.status});}
}
