"use client";
import { useEffect, useState } from "react";
export default function CustomerSignin() {
  const [link, setLink] = useState<string[]>(), [message, setMessage] = useState("Open the link from your email to sign in."), [busy, setBusy] = useState(false);
  useEffect(() => {
    const parts = window.location.hash.slice(1).split("/");
    // Remove the bearer credential from browser history before any request or rendering.
    window.history.replaceState(null, "", "/customer/sign-in");
    if (parts.length === 4) { setLink(parts); setMessage("Sign in to this job. Your session lasts up to one hour."); }
  }, []);
  async function signin() {
    if (!link || busy) return;
    setBusy(true);
    try {
      const [tenantId, jobId, customerId, token] = link;
      const response = await fetch("/api/customer-portal/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: "customer-signin.v1", tenantId, jobId, customerId, token }), cache: "no-store" });
      setLink(undefined);
      setMessage(response.ok ? "You are signed in to this job." : "This link is unavailable. Ask your builder for a new one.");
    } catch { setMessage("Sign-in could not be confirmed. Ask your builder for a new link."); setLink(undefined); }
    finally { setBusy(false); }
  }
  async function signout() {
    try {
    const response = await fetch("/api/customer-portal/signout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: "customer-signout.v1" }), cache: "no-store" });
    setMessage(response.ok ? "You are signed out." : "Sign-out could not be confirmed. Close this browser session.");
    } catch { setMessage("Sign-out could not be confirmed. Close this browser session."); }
  }
  return <main><h1>Customer sign-in</h1><p>{message}</p>{link && <button onClick={() => void signin()} disabled={busy}>Sign in</button>}<button onClick={() => void signout()}>Sign out</button></main>;
}
