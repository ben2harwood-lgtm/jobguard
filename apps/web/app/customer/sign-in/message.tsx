"use client";
import { useRef, useState } from "react";
import { jobSourceTextV1 } from "@jobguard/core";
export function CustomerMessage({ jobId }: { jobId: string }) {
  const [text, setText] = useState(""), [status, setStatus] = useState(""), [busy, setBusy] = useState(false);
  const pending = useRef<{version: string; jobId: string; commandId: string; text: string} | null>(null);
  async function send() {
    if (busy) return;
    if (!pending.current && !jobSourceTextV1.safeParse(text).success) { setStatus("Enter a message of up to 8,000 characters."); return; }
    pending.current ??= {version: "customer-portal-message.v1", jobId, commandId: crypto.randomUUID(), text};
    setBusy(true);
    try {
      const response = await fetch("/api/customer-portal/messages", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(pending.current), cache: "no-store"});
      const body = await response.json();
      if (response.ok) { setText(""); setStatus("Message saved for your builder with its evidence."); }
      else setStatus(body.code === "POST_LOCK_WORK_REQUIRES_LINKED_JOB" ? "This final account is locked. Ask your builder to start a linked job for this work." : "Message was refused. Check your sign-in and that the job is live.");
      pending.current = null;
    } catch { setStatus("The result is unknown. Retry the same message."); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="customer-message-title"><h2 id="customer-message-title">Message your builder</h2><p>Practice sandbox: use made-up information only. A message does not approve a quote, extra or price.</p>
    <label htmlFor="customer-message">Message</label><textarea id="customer-message" maxLength={8000} value={text} disabled={busy || !!pending.current} onChange={e => setText(e.target.value)}/>
    <button disabled={busy || (!pending.current && !text.trim())} onClick={() => void send()}>{pending.current ? "Retry the same message" : "Save message"}</button><p role="status">{status}</p></section>;
}
