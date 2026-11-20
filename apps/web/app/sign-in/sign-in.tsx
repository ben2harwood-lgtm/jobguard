"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FirmDetailsScreen } from "../firm-details/firm-details";
type Session={csrfToken:string;principal:{id:string};memberships:{id:string;tenantId:string;role:string;name:string}[]};
// What an accepted invitation did to this browser's sign-in: nobody was signed in ("new"), the business was added to the
// account that was already signed in ("added"), or verification signed this browser in as a different account ("switched").
type Accepted="new"|"added"|"switched";
const field={display:"block",width:"100%",minHeight:44,marginBottom:16,boxSizing:"border-box" as const};
export function IdentitySignIn({ embedded = false }: { embedded?: boolean }) {
  const[email,setEmail]=useState("builder@practice.invalid"),[purpose,setPurpose]=useState("signup"),[invitationId,setInvitationId]=useState(""),[code,setCode]=useState(""),[fixtureCode,setFixtureCode]=useState(""),[requested,setRequested]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[session,setSession]=useState<Session|null>(null),[checking,setChecking]=useState(true),[invitationLink,setInvitationLink]=useState(false),[accepted,setAccepted]=useState<Accepted|null>(null);
  const errorRef=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{const id=new URLSearchParams(location.search).get("invitationId");if(id){setInvitationId(id);setPurpose("invitation");setInvitationLink(true);}void fetch("/api/auth/session",{cache:"no-store"}).then(async r=>{if(r.ok)setSession(await r.json() as Session);else if(r.status!==401)setError("Identity storage is unavailable. Try again.");}).catch(()=>setError("Identity storage is unavailable. Try again.")).finally(()=>setChecking(false));},[]);
  useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
  // A session may be signed out or switched in another tab while this form is open.
  useEffect(()=>{
    if(!session)return;
    let active=true, latest=0;
    async function refresh() {
      if(document.visibilityState==="hidden")return;
      const request=++latest;setChecking(true);
      try {
        const response=await fetch("/api/auth/session",{cache:"no-store"});
        const next=response.ok?await response.json() as Session:null;
        if(active&&request===latest){setSession(next);if(!response.ok&&response.status!==401)setError("Identity storage is unavailable. Try again.");}
      }catch{if(active&&request===latest){setSession(null);setError("Identity storage is unavailable. Try again.");}}
      finally{if(active&&request===latest)setChecking(false);}
    }
    window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
    return ()=>{active=false;window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
  },[session?.csrfToken]);
  async function enterPractice(current: Session) {
    if(current.memberships.length!==1||current.memberships[0]!.role!=="owner") {
      setError("Your practice firm needs exactly one current owner membership. No business has been selected.");return;
    }
    const response=await fetch("/api/auth/practice",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":current.csrfToken},body:JSON.stringify({version:"linked-practice-company.v1",action:"enter"})});
    if(!response.ok)throw new Error("PRACTICE_ENTRY_REFUSED");
    location.assign("/practice-company");
  }
  async function openJobs() {
    setBusy(true);setError("");
    try {await enterPractice(session!);}catch{setError("Your jobs could not be opened. Sign in again or use Open my jobs to re-enter your current practice firm. Your previous jobs have not been deleted.");}
    finally{setBusy(false);}
  }
  async function submit(event:FormEvent,verify:boolean) {
    event.preventDefault();setBusy(true);setError("");
    try {
      const response=await fetch(`/api/auth/${verify?"verify":"request"}`,{method:"POST",headers:{"content-type":"application/json",...(session?{"x-csrf-token":session.csrfToken}:{})},body:JSON.stringify({version:verify?"identity-verify.v1":"identity-request.v1",email,purpose,...(invitationId?{invitationId}:{}),...(verify?{code}:{})})});
      const body=await response.json() as {code?:string;fixtureCode?:string};
      if(!response.ok)throw new Error(body.code??"IDENTITY_UNAVAILABLE");
      if(verify){const current=await fetch("/api/auth/session",{cache:"no-store"});if(!current.ok)throw new Error("IDENTITY_UNAVAILABLE");const next=await current.json() as Session;setSession(next);setCode("");setFixtureCode("");setRequested(false);if(purpose==="invitation"){setAccepted(!session?"new":session.principal.id===next.principal.id?"added":"switched");history.replaceState(null,"","/sign-in");}else if(!embedded){await enterPractice(next);}}
      else {setRequested(true);setFixtureCode(body.fixtureCode??"");}
    }catch(e){
      const reason=(e as Error).message;
      const messages:Record<string,string>={
        PRACTICE_ENTRY_REFUSED:"Your account is verified, but practice entry could not be confirmed. Use Open my jobs to recover your current firm. Your previous jobs have not been deleted.",
        INVALID_CODE:"That code is invalid or expired. Request another code.",
        RATE_LIMITED:"Please wait before requesting another code.",
        IDENTITY_ROUTE_BLOCKED:"Use a supplied fictional .invalid address. Real identity email is blocked pending D04.",
        INVALID_AUTH_INPUT:"Check the email address and invitation reference, then submit again.",
        ORIGIN_FORBIDDEN:"Your sign-in has not completed. Reload this page or close it and open JobGuard again.",
      };
      setError(Object.hasOwn(messages,reason)?messages[reason]!:"Identity storage is unavailable. Your sign-in has not completed.");
    }
    finally{setBusy(false);}
  }
  async function signout() {
    setBusy(true);setError("");
    try {
      const response=await fetch("/api/auth/signout",{method:"POST",headers:{"x-csrf-token":session!.csrfToken}});
      if(!response.ok)throw new Error("Sign out failed");
      setSession(null);setAccepted(null);setInvitationLink(false);setInvitationId("");setPurpose("signin");setRequested(false);setCode("");setFixtureCode("");if(embedded)location.assign("/sign-in");
    }catch{setError("Sign out could not complete. Try again.");}
    finally{setBusy(false);}
  }
  return <main style={{maxWidth:480,margin:"32px auto",padding:20,boxSizing:"border-box",overflowWrap:"anywhere"}}>
    <h1>Sign in to JobGuard</h1><p>Use the supplied fictional address. Do not enter real names or email addresses.</p>
    {error&&<p role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}
    {checking?<p role="status">Checking your persisted session…</p>:<>
      {session&&<section aria-label="Verified account"><h2>You're signed in.</h2>{session.memberships.map(m=><article key={m.id}><h3>{m.name}</h3><p>{m.role === "read_only" ? "Read only" : m.role.charAt(0).toUpperCase()+m.role.slice(1)}</p></article>)}<details><summary>Technical details</summary><p>Identity: <span data-testid="identity-id">{session.principal.id}</span></p>{session.memberships.map(m=><div key={m.id}><p data-testid="identity-tenant">{m.tenantId}</p><p>Membership: {m.id}</p></div>)}</details>{accepted==="new"&&<p role="status">Invitation accepted. Your memberships above are current.</p>}{accepted==="added"&&<p role="status">Invitation accepted. The invited business is now one of this account's memberships above.</p>}{accepted==="switched"&&<p role="status">Invitation accepted. This browser is now signed in as the invited address, which is a different account from the one you were using. The memberships above belong to that account; sign in with your previous address to return to the other one.</p>}<p>This is a practice version: made-up jobs only, nothing is sent or charged.</p>{!busy&&session.memberships.length===1&&session.memberships[0]!.role==="owner"&&<section className="practice-firm-profile" aria-label="Name your practice business">
        <h2>Name your practice business</h2><p>Use made-up business details only. The trading name does not rename your sign-in business or membership.</p>
        <style>{`.practice-firm-profile fieldset{min-width:0;margin:0}.practice-firm-profile label{display:block;margin-bottom:12px}.practice-firm-profile input{display:block;box-sizing:border-box;width:100%;min-height:44px}.practice-firm-profile button,.practice-firm-profile a{min-height:44px}.practice-firm-profile a{display:inline-flex;align-items:center}`}</style>
        <FirmDetailsScreen key={`${session.principal.id}:${session.memberships[0]!.id}`}/>
      </section>}<p>{session.memberships.length===1&&session.memberships[0]!.role==="owner"?<button type="button" style={{minHeight:44}} disabled={busy} onClick={()=>void openJobs()}>Open my jobs</button>:<span>Your practice firm needs exactly one current owner membership. No business has been selected.</span>}</p><p><a href="/plans">See plans and prices</a></p><button type="button" style={{minHeight:44}} disabled={busy} onClick={()=>void signout()}>Sign out</button></section>}
      {(!session||(invitationLink&&!accepted))&&<section aria-label={session?"Accept an invitation":"Sign in"}>
      {session&&<><h2>Accept an invitation</h2><p>You are signed in. Verifying signs this browser in as the address the invitation was sent to. If that is the address you are signed in with, the invited business is added to this account. If it is a different address, this browser switches to that other account and signs this one out here.</p><p>Enter the address the invitation was sent to and the code sent to it.</p></>}
      <form onSubmit={e=>void submit(e,false)}>
        <label htmlFor="identity-email">Fictional email address</label><input id="identity-email" type="email" autoComplete="email" style={field} value={email} onChange={e=>{setEmail(e.target.value);setRequested(false);setFixtureCode("");}} required/>
        {!session&&<><label htmlFor="identity-purpose">What do you want to do?</label><select id="identity-purpose" style={field} value={purpose} onChange={e=>{setPurpose(e.target.value);setRequested(false);setFixtureCode("");}}><option value="signup">Start a new business</option><option value="signin">Sign in to my business</option><option value="invitation">I've been invited</option></select></>}
        {!session&&purpose==="invitation"&&<p>Enter the address the invitation was sent to. Verifying the code signs you in as that address.</p>}{purpose==="invitation"&&<><label htmlFor="identity-invitation">Invitation reference</label><input id="identity-invitation" style={field} value={invitationId} onChange={e=>setInvitationId(e.target.value)} required/></>}
        <button className="primary" style={field} disabled={busy} type="submit">{requested?"Request another code":"Request code"}</button>
      </form>
      {requested&&<form onSubmit={e=>void submit(e,true)}><p role="status">If eligible, you can verify the requested code.</p>{fixtureCode&&<p>Practice code: <output data-testid="fixture-code">{fixtureCode}</output> — nothing was emailed.</p>}<label htmlFor="identity-code">Eight-digit code</label><input id="identity-code" style={field} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" minLength={8} maxLength={8} value={code} onChange={e=>setCode(e.target.value)} required/><button className="primary" style={field} type="submit" disabled={busy}>Verify code</button></form>}
      </section>}
    </>}
  </main>;
}
