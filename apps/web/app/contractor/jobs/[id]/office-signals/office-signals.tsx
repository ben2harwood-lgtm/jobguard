"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
const resultSchema = z.object({items:z.array(z.object({promptId:z.guid(),variationId:z.guid(),recordedAt:z.iso.datetime({offset:true})}).strict()),nextCursor:z.guid().nullable()}).strict();
type Result = z.infer<typeof resultSchema>;
export function OfficeSignals({jobId}:{jobId:string}) {
 const [result,setResult]=useState<Result|null>(null),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(true),[after,setAfter]=useState<string|undefined>();
 useEffect(()=>{
  const controller=new AbortController();
  setResult(null);setError(null);setLoading(true);
  void (async()=>{
   try {
    const response=await fetch(`/api/contractor/jobs/${encodeURIComponent(jobId)}/office-signals${after?`?after=${encodeURIComponent(after)}`:""}`,{cache:"no-store",signal:controller.signal});
    if(!response.ok)throw new Error(response.status===404?"Job not found.":"Office matches are unavailable. Try again later.");
    const value=resultSchema.parse(await response.json());
    if(!controller.signal.aborted)setResult(value);
   }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error&&cause.message==="Job not found."?cause.message:"Office matches are unavailable. Try again later.");}
   finally{if(!controller.signal.aborted)setLoading(false);}
  })();
  return ()=>controller.abort();
 },[jobId,after]);
 return <main style={{maxWidth:720,margin:"0 auto",padding:20,overflowWrap:"anywhere"}}>
  <h1>Office entry matches</h1>
  <p>An office entry matches a possible extra. These matches are advisory and add no fee.</p>
  {loading&&<p role="status">Loading office matches…</p>}
  {error&&<p role="alert">{error}</p>}
  {result&&<>
   {result.items.length===0?<p>No office entry matches recorded.</p>:<ul>{result.items.map(item=><li key={`${item.promptId}:${item.variationId}`}>
    <p>Office entry {item.variationId} matches possible extra {item.promptId}.</p>
    <p>Recorded <time dateTime={item.recordedAt}>{item.recordedAt}</time>. Advisory only. This adds no fee.</p>
   </li>)}</ul>}
   <nav aria-label="Office matches pages" style={{display:"flex",gap:12}}>
    {after&&<button style={{minHeight:44,minWidth:44}} onClick={()=>setAfter(undefined)}>First page</button>}
    {result.nextCursor&&<button style={{minHeight:44,minWidth:44}} onClick={()=>setAfter(result.nextCursor!)}>Next page</button>}
   </nav>
  </>}
 </main>;
}
