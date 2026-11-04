import CustomerStages from "../../stages";
export const dynamic = "force-dynamic";
export const metadata = {title:"Customer job",referrer:"no-referrer"};
export default async function CustomerJob({params}: {params: Promise<{jobId:string}>}) {
  const {jobId} = await params;
  return <main><CustomerStages jobId={jobId}/><a href="/customer/sign-in">Customer sign-in and sign-out</a></main>;
}
