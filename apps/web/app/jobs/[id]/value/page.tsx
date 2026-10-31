import { cookies } from "next/headers";
import { ValuePage } from "../../../ui/job-value";
import { JobMappedValue } from "../../../ui/mapped-value-receipt";
export default async function Page({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if((await cookies()).get("jobguard_session"))return <main className="workspace-page"><p><a href="/value">Back to business value</a></p><JobMappedValue jobId={id}/></main>;
 return <><JobMappedValue jobId={id}/><ValuePage jobId={id}/></>;
}
