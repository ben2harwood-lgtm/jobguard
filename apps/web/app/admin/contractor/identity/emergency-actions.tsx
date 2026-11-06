"use client";
import { useState } from 'react';
import { EmergencyNotice } from './emergency-notice';
const field={display:'block',width:'100%',minHeight:44,marginBottom:12,boxSizing:'border-box' as const};
async function digest(value:string) {
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
export function EmergencyActions({tenantId,csrfToken}:{tenantId:string;csrfToken:string}) {
 const [requestId,setRequestId]=useState(''),[reason,setReason]=useState(''),[tokenHash,setTokenHash]=useState('');
 const [target,setTarget]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[revision,setRevision]=useState(0);
 async function act(operation:string) {
  if(busy)return;setBusy(true);setStatus('Checking emergency action…');
  try {
   const id=operation==='request'?crypto.randomUUID():requestId;
   const hash=operation==='open'?await digest(crypto.randomUUID()+crypto.randomUUID()):tokenHash;
   const command={version:'emergency.v1',operation,requestId:id,
    ...(operation==='request'?{reasonHash:await digest(reason)}:{}),
    ...(['open','inspect','revoke_member'].includes(operation)?{tokenHash:hash}:{}),
    ...(operation==='revoke_member'?{targetMembershipId:target}:{})};
   const response=await fetch(`/api/auth/sso-required/emergency-actions/${operation}`,{method:'POST',cache:'no-store',
    headers:{'content-type':'application/json','x-csrf-token':csrfToken,'x-tenant-id':tenantId},
    body:JSON.stringify({version:'emergency-route.v1',requested_tenant_id:tenantId,command})});
   const body=await response.json();
   if(!response.ok)throw new Error('Emergency action refused. Check the request, approvals and your current owner session.');
   setRequestId(id);if(operation==='request')setTokenHash('');if(operation==='open')setTokenHash(hash);
   setStatus(operation==='inspect'?`Single sign-on required: ${body.required===true?'On':body.required===false?'Off':'Unknown'}`:
    `${operation} recorded${body.expiresAt?`; expires ${body.expiresAt}`:''}.`);
   setRevision(n=>n+1);
  }catch(error){setStatus(error instanceof Error?error.message:'Emergency action could not be confirmed.');}
  finally{setBusy(false);}
 }
 return <section aria-label="Restricted emergency access">
  <h2>Restricted emergency access</h2>
  <p>Practice only. A current owner session and two other named owners are required. Approvals last 15 minutes; access lasts one hour. This cannot turn company sign-in off. Reloading loses the emergency capability.</p>
  <label>Emergency reason<input style={field} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy} /></label>
  <button style={field} disabled={busy||reason.trim().length<20} onClick={()=>void act('request')}>Request emergency access</button>
  <label>Emergency request ID<input style={field} value={requestId} onChange={e=>{setRequestId(e.target.value);setTokenHash('');}} disabled={busy} /></label>
  <p>Share this request ID with two other owners. Each approves using their own signed-in session.</p>
  <button style={field} disabled={busy||!requestId} onClick={()=>void act('approve')}>Approve emergency request</button>
  <button style={field} disabled={busy||!requestId||!!tokenHash} onClick={()=>void act('open')}>Open emergency access</button>
  <button style={field} disabled={busy||!tokenHash} onClick={()=>void act('inspect')}>Inspect sign-in requirement</button>
  <label>Non-owner membership ID<input style={field} value={target} onChange={e=>setTarget(e.target.value)} disabled={busy} /></label>
  <button style={field} disabled={busy||!tokenHash||!target} onClick={()=>void act('revoke_member')}>Revoke non-owner access</button>
  {status&&<p role="status">{status}</p>}
  <EmergencyNotice key={revision} tenantId={tenantId} csrfToken={csrfToken} />
 </section>;
}
