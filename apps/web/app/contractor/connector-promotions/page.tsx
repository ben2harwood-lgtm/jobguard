"use client";
import React, { useEffect, useState } from "react";
type Event = { namespace: string; eventId: string; kind: string; subject: string; revision: number; document: string | null; result: Record<string,unknown> | null; hold: string | null };
const endpoint = "/api/contractor/work-order-imports/connector-promotions";
export default function Page() {
  const [events,setEvents] = useState<Event[]>([]), [message,setMessage] = useState("Loading staged events…"), [busy,setBusy] = useState(false);
  async function load() {
    const response = await fetch(endpoint,{cache:"no-store"});
    if (!response.ok) throw new Error("Staged events are unavailable. Check your session, import permission and generated work-order setup.");
    setEvents(await response.json() as Event[]); setMessage("Staged events loaded");
  }
  useEffect(() => { void load().catch(error => setMessage((error as Error).message)); },[]);
  async function promote(event: Event) {
    setBusy(true);
    try {
      const response = await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({version:"connector-promotion.v1",namespace:event.namespace,eventId:event.eventId})});
      if (!response.ok) throw new Error("Promotion refused. Check the fixture label, current session and permission.");
      await load(); setMessage("Promotion recorded");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <main style={{maxWidth:760,margin:"auto",padding:16,overflowWrap:"anywhere"}}>
    <h1>Staged connector events</h1>
    <p>Practice sandbox — synthetic data; nothing is sent or charged</p>
    <p>Promote a fixture using your current import permission. Work orders use the existing generated demo setup.</p>
    <p role="status">{message}</p>
    {events.map(event => <article key={`${event.namespace}/${event.eventId}`} style={{border:"1px solid",padding:12,marginBottom:16}}>
      <h2>{event.kind === "work_order" ? "Work order" : event.kind === "materials_issue" ? "Materials issue" : "Billing status"}</h2>
      <p>{event.eventId} · revision {event.revision}</p><p>{event.document ?? event.subject}</p>
      {event.hold ? <p>Held: invoice composition is required. Billing remains staged.</p> : event.result ? <p>Promoted</p>
        : <button disabled={busy} onClick={() => void promote(event)}>Promote {event.kind === "work_order" ? "work order" : "materials issue"}</button>}
    </article>)}
  </main>;
}
