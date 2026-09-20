import{ValuePage}from"../../../ui/job-value";
export default async function Page({params}:{params:Promise<{id:string}>}){return <ValuePage jobId={(await params).id}/>}
