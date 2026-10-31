import { FirstJobTrial } from "../../../ui/first-job-trial";
export default async function TrialPage({params}:{params:Promise<{id:string}>}){return <FirstJobTrial jobId={(await params).id}/>;}
