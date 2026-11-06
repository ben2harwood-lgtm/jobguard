"use client";
import { useEffect, useState } from 'react';
type Notice={id:string;request_id:string;actor:string;ownerName:string;operation:string;created_at:string};
/** Owner-only server projection. Refusals never imply there are no emergency actions. */
export function EmergencyNotice({tenantId,csrfToken}:{tenantId:string;csrfToken:string}) {
 const [notices,setNotices]=useState<Notice[]|null>(null);
 useEffect(()=>{
  let current=true;setNotices(null);
  void fetch(`/api/auth/sso-required/emergency-notices?requested_tenant_id=${encodeURIComponent(tenantId)}`,{
   cache:'no-store',headers:{'x-csrf-token':csrfToken,'x-tenant-id':tenantId},
  }).then(async r=>{
   if(!r.ok)throw new Error('notice unavailable');
   const body:unknown=await r.json();
   if(!body||typeof body!=='object'||!('notices' in body)||!Array.isArray(body.notices))throw new Error('notice unavailable');
   if(current)setNotices(body.notices as Notice[]);
  }).catch(()=>{if(current)setNotices(null);});
  return()=>{current=false;};
 },[tenantId,csrfToken]);
 if(notices===null)return <p role="alert">Emergency access notices are unavailable for this session. An owner must check the security audit.</p>;
 if(notices.length===0)return null;
 return <aside role="alert" aria-label="Emergency access activity"><h2>Emergency access activity</h2>
  <p>Emergency access requires two other owners. Access lasts one hour. Every action is recorded in the security audit.</p>
  <ul>{notices.map(n=><li key={n.id}>{n.operation} — owner {n.ownerName} — request {n.request_id} — {n.created_at}</li>)}</ul>
 </aside>;
}
