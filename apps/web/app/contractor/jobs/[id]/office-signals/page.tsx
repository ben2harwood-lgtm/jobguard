import { OfficeSignals } from "./office-signals";
export default async function Page({params}:{params:Promise<{id:string}>}) {
 return <OfficeSignals jobId={(await params).id}/>;
}
