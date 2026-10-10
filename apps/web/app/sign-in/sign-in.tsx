"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
type Session={principal:{id:string};memberships:{id:string;tenantId:string;role:string;name:string}[]};
// What an accepted invitation did to this browser's sign-in: nobody was signed in ("new"), the business was added to the
// account that was already signed in ("added"), or verification signed this browser in as a different account ("switched").
type Accepted="new"|"added"|"switched";
const field={display:"block",width:"100%",minHeight:44,marginBottom:16,boxSizing:"border-box" as const};
export function IdentitySignIn() {
  const[email,setEmail]=useState("builder@practice.invalid"),[purpose,setPurpose]=useState("signup"),[invitationId,setInvitationId]=useState(""),[code,setCode]=useState(""),[fixtureCode,setFixtureCode]=useState(""),[requested,setRequested]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[session,setSession]=useState<Session|null>(null),[checking,setChecking]=useState(true),[invitationLink,setInvitationLink]=useState(false),[accepted,setAccepted]=useState<Accepted|null>(null);
  const errorRef=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{const id=new URLSearchParams(location.search).get("invitationId");if(id){setInvitationId(id);setPurpose("invitation");setInvitationLink(true);}void fetch("/api/auth/session",{cache:"no-store"}).then(async r=>{if(r.ok)setSession(await r.json() as Session);else if(r.status!==401)setError("Identity storage is unavailable. Try again.");}).catch(()=>setError("Identity storage is unavailable. Try again.")).finally(()=>setChecking(false));},[]);
  useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
  async function submit(event:FormEvent,verify:boolean) {
    event.preventDefault();setBusy(true);setError("");
    try {
      const response=await fetch(`/api/auth/${verify?"verify":"request"}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({version:verify?"identity-verify.v1":"identity-request.v1",email,purpose,...(invitationId?{invitationId}:{}),...(verify?{code}:{})})});
      const body=await response.json() as {code?:string;fixtureCode?:string};
      if(!response.ok)throw new Error(body.code??"IDENTITY_UNAVAILABLE");
      if(verify){const current=await fetch("/api/auth/session",{cache:"no-store"});if(!current.ok)throw new Error("IDENTITY_UNAVAILABLE");const next=await current.json() as Session;setSession(next);setCode("");setFixtureCode("");setRequested(false);if(purpose==="invitation"){setAccepted(!session?"new":session.principal.id===next.principal.id?"added":"switched");history.replaceState(null,"","/sign-in");}}
      else {setRequested(true);setFixtureCode(body.fixtureCode??"");}
    }catch(e){const reason=(e as Error).message;setError(reason==="INVALID_CODE"?"That code is invalid or expired. Request another code.":reason==="RATE_LIMITED"?"Please wait before requesting another code.":reason==="IDENTITY_ROUTE_BLOCKED"?"Use a supplied fictional .invalid address. Real identity email is blocked pending D04.":"Identity storage is unavailable. Your sign-in has not completed.");}
    finally{setBusy(false);}
  }
  return <main style={{maxWidth:480,margin:"32px auto",padding:20,boxSizing:"border-box",overflowWrap:"anywhere"}}>
    <h1>Entered-code sign-in</h1><p>Use the supplied fictional address. Do not enter real names or email addresses.</p>
    {error&&<p role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}
    {checking?<p role="status">Checking your persisted session…</p>:<>
      {session&&<section aria-label="Verified account"><h2>Signed in</h2><p>Identity: <span data-testid="identity-id">{session.principal.id}</span></p>{session.memberships.map(m=><article key={m.id}><h3>{m.name}</h3><p>Role: {m.role}</p><p data-testid="identity-tenant">{m.tenantId}</p><p>Membership: {m.id}</p></article>)}{accepted==="new"&&<p role="status">Invitation accepted. Your memberships above are current.</p>}{accepted==="added"&&<p role="status">Invitation accepted. The invited business is now one of this account's memberships above.</p>}{accepted==="switched"&&<p role="status">Invitation accepted. This browser is now signed in as the invited address, which is a different account from the one you were using. The memberships above belong to that account; sign in with your previous address to return to the other one.</p>}<p>Your verified account is persisted. Business workflows remain in the practice sandbox.</p><a href="/">Open practice Jobs</a></section>}
      {(!session||(invitationLink&&!accepted))&&<section aria-label={session?"Accept an invitation":"Sign in"}>
      {session&&<><h2>Accept an invitation</h2><p>You are signed in. Verifying signs this browser in as the address the invitation was sent to. If that is the address you are signed in with, the invited business is added to this account. If it is a different address, this browser switches to that other account and signs this one out here.</p><p>Enter the address the invitation was sent to and the code sent to it.</p></>}
      <form onSubmit={e=>void submit(e,false)}>
        <label htmlFor="identity-email">Fictional email address</label><input id="identity-email" type="email" autoComplete="email" style={field} value={email} onChange={e=>{setEmail(e.target.value);setRequested(false);setFixtureCode("");}} required/>
        {!session&&<><label htmlFor="identity-purpose">Sign-in purpose</label><select id="identity-purpose" style={field} value={purpose} onChange={e=>{setPurpose(e.target.value);setRequested(false);setFixtureCode("");}}><option value="signup">Create a new business</option><option value="signin">Sign in</option><option value="invitation">Accept an invitation</option></select></>}
        {!session&&purpose==="invitation"&&<p>Enter the address the invitation was sent to. Verifying the code signs you in as that address.</p>}{purpose==="invitation"&&<><label htmlFor="identity-invitation">Invitation reference</label><input id="identity-invitation" style={field} value={invitationId} onChange={e=>setInvitationId(e.target.value)} required/></>}
        <button className="primary" style={field} disabled={busy} type="submit">{requested?"Request another code":"Request code"}</button>
      </form>
      {requested&&<form onSubmit={e=>void submit(e,true)}><p role="status">If eligible, you can verify the requested code.</p>{fixtureCode&&<p>Fixture transport code: <output data-testid="fixture-code">{fixtureCode}</output>. Nothing was emailed.</p>}<label htmlFor="identity-code">Eight-digit code</label><input id="identity-code" style={field} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" minLength={8} maxLength={8} value={code} onChange={e=>setCode(e.target.value)} required/><button className="primary" style={field} type="submit" disabled={busy}>Verify code</button></form>}
      </section>}
    </>}
  </main>;
}
