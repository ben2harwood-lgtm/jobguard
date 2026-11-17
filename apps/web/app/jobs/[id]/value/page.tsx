import { cookies } from "next/headers";
import { ValuePage } from "../../../ui/job-value";
import { JobMappedValue } from "../../../ui/mapped-value-receipt";
export default async function Page({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 // An owner launching from the practice chooser holds both sessions; practice jobs read as practice.
 const jar=await cookies();
 if(jar.get("jobguard_session")&&!jar.get("jg_session"))return <main className="workspace-page"><p><a href="/value">Back to business value</a></p><JobMappedValue jobId={id}/></main>;
 return <><JobMappedValue jobId={id}/><ValuePage jobId={id}/></>;
}
