"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { FactReplyView } from "@jobguard/api/workspace";

type Fact = FactReplyView["facts"][number];
type Answer = { other: string } | { deliveryDate: string } | { available: boolean } | { arrangement: string };
const version = "v2-fact-reply-command.v1";

function answerText(answer: Record<string, unknown>) {
  if ("choice" in answer) return String(answer.choice);
  if ("other" in answer) return String(answer.other);
  if ("deliveryDate" in answer) return `Delivery ${String(answer.deliveryDate)}`;
  if ("available" in answer) return answer.available ? "Available" : "Not available";
  return String(answer.arrangement);
}

function ownerLabel(fact: Fact) {
  return fact.owner.kind === "customer" ? "the customer" : "name" in fact.owner ? fact.owner.name : "you";
}

// V2 practice: ask the customer, merchant or crew one open question by link, paste a reply
// heard by phone, and apply a reply to the fact. Links go only to the local catcher.
export function V2FactReplies({ jobId }: { jobId: string }) {
  const [view, setView] = useState<FactReplyView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ factId: string; path: string } | null>(null);
  const pending = useRef<{ key: string; commandId: string } | null>(null);
  const path = `/api/jobs/${jobId}/fact-replies`;

  const load = useCallback(async () => {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error("load");
      // A reload after a refused press keeps that press's message on screen.
      setView(await response.json() as FactReplyView);
    } catch { setError("Replies are unavailable. Reload to try again."); }
  }, [path]);
  useEffect(() => { void load(); }, [load]);

  async function send(body: Record<string, unknown>, failure: string) {
    // The same press retried keeps its command id, so it has one effect.
    const key = JSON.stringify(body);
    if (pending.current?.key !== key) pending.current = { key, commandId: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ version, ...("replyId" in body ? {} : { commandId: pending.current.commandId }), ...body }) });
      const result = await response.json() as { code?: string; replyPath?: string };
      if (!response.ok) {
        setError(result.code === "REPLY_OUT_OF_DATE" ? "That reply is out of date: the question or recipient changed. It was not applied."
          : result.code?.includes("VERSION_CONFLICT") ? "This question changed in the meantime. Check it and try again." : failure);
        await load();
        return null;
      }
      pending.current = null;
      await load();
      return result;
    } catch { setError(failure); return null; }
    finally { setBusy(false); }
  }

  const open = view?.facts.filter(fact => (fact.status === "open" || fact.status === "out_of_date") && fact.owner.kind !== "builder") ?? [];
  const replies = view?.replies ?? [];
  return <section aria-labelledby="fact-replies-heading" className="card" data-testid="v2-fact-replies">
    <h2 id="fact-replies-heading">Replies received: apply?</h2>
    <p>Practice sandbox: fictional contacts only. Links go to the local catcher; nothing real is sent.</p>
    {error && <p role="alert">{error}</p>}
    {!view && !error && <p>Loading replies…</p>}
    {view && <>
      {replies.length === 0 ? <p>No replies yet.</p> : <ul aria-label="Replies">{replies.map(reply => {
        const fact = view.facts.find(entry => entry.id === reply.factId);
        return <li key={reply.id}>
          <p><strong>{fact?.detail && "question" in fact.detail ? fact.detail.question : fact && "item" in fact.detail ? fact.detail.item
            : fact && "need" in fact.detail ? fact.detail.need : "Question"}</strong></p>
          <p>Reply: “{answerText(reply.answer)}” · {reply.source === "reply_link" ? "by link" : "pasted by you"}</p>
          {reply.status === "ready" && fact && <button type="button" disabled={busy} onClick={() => void send(
            { action: "apply", replyId: reply.id, expectedFactVersion: reply.factVersion }, "Could not apply the reply. Reload and check it.")}>
            Apply this reply</button>}
          {reply.status === "out_of_date" && <p>Out of date: the question or recipient changed after it was asked. Not applied.</p>}
          {reply.status === "applied" && <p>Applied to the question.</p>}
        </li>;
      })}</ul>}
      <h3>Ask by link</h3>
      {open.length === 0 ? <p>No open questions waiting on someone else.</p> : open.map(fact =>
        <FactAsk key={fact.id} fact={fact} view={view} busy={busy} link={link?.factId === fact.id ? link.path : null}
          send={send} shown={path => setLink(path ? { factId: fact.id, path } : null)}/>)}
    </>}
  </section>;
}

function FactAsk({ fact, view, busy, link, send, shown }: { fact: Fact; view: FactReplyView; busy: boolean; link: string | null;
  send: (body: Record<string, unknown>, failure: string) => Promise<{ replyPath?: string } | null>; shown: (path: string | null) => void }) {
  const [options, setOptions] = useState("");
  const [allowOther, setAllowOther] = useState(false);
  const [email, setEmail] = useState("");
  const [pasted, setPasted] = useState("");
  const question = "question" in fact.detail ? fact.detail.question : "item" in fact.detail ? fact.detail.item : fact.detail.need;
  const role = fact.owner.kind;
  const recipient = role === "merchant" || role === "crew_member"
    ? view.recipients.find(entry => entry.current && entry.role === role && "name" in fact.owner && entry.displayName === fact.owner.name)
    : undefined;
  const requests = view.requests.filter(request => request.factId === fact.id);
  const labels = options.split("\n").map(line => line.trim()).filter(Boolean);
  const choice = fact.kind === "customer_choice";

  async function ask() {
    const result = await send({ action: "request", factId: fact.id, expectedFactVersion: fact.version,
      recipient: role === "customer" ? { kind: "customer" } : { kind: "recorded", recipientId: recipient!.id },
      options: choice ? labels : null, allowOther: choice && allowOther, expiresInDays: 14 }, "Could not send the link. Check the options and try again.");
    shown(result?.replyPath ?? null);
  }
  function paste() {
    const answer: Answer | null = !pasted.trim() ? null : fact.kind === "customer_choice" ? { other: pasted.trim() }
      : fact.kind === "merchant_delivery_date" ? { deliveryDate: pasted.trim() }
        : fact.kind === "crew_availability" ? { available: pasted.trim().toLowerCase().startsWith("y") } : { arrangement: pasted.trim() };
    if (answer) void send({ action: "paste", factId: fact.id, expectedFactVersion: fact.version, answer },
      "Could not save the pasted reply. Check it and try again.").then(saved => { if (saved) setPasted(""); });
  }

  return <article aria-label={`Ask: ${question}`} style={{ minWidth: 0, marginBottom: 16 }}>
    <p><strong>{question}</strong> · waiting on {ownerLabel(fact)}</p>
    {requests.map(request => <p key={request.id}>Link to {request.contactEmail}: {request.status === "open" && !request.current ? "out of date" : request.status}
      {request.status === "open" && <> <button type="button" disabled={busy} onClick={() => void send({ action: "cancel", requestId: request.id },
        "Could not cancel the link. Reload and check it.")}>Cancel link</button></>}</p>)}
    {link && <p role="status">Link sent to the local catcher. Practice only: <a href={link} target="_blank" rel="noreferrer">open the reply page</a>.</p>}
    {(role === "merchant" || role === "crew_member") && (recipient
      ? <p>Contact: {recipient.contactEmail} · Recorded by you</p>
      : <form onSubmit={event => { event.preventDefault(); void send({ action: "record_recipient", role, merchantId: null,
          displayName: "name" in fact.owner ? fact.owner.name : null, contactEmail: email.trim().toLowerCase(), correctsId: null },
        "Could not record the contact. Practice uses invented .invalid addresses only.").then(saved => { if (saved) setEmail(""); }); }}>
        <label>Practice email for {ownerLabel(fact)} <input type="email" required value={email} onChange={event => setEmail(event.target.value)}
          placeholder="name@jobguard-v2.invalid"/></label> <button type="submit" disabled={busy}>Record contact</button>
      </form>)}
    {choice && <>
      <label>Answer options, one per line (2 to 6)<textarea value={options} onChange={event => setOptions(event.target.value)} rows={3}/></label>
      <label><input type="checkbox" checked={allowOther} onChange={event => setAllowOther(event.target.checked)}/> Allow “Something else”</label>
    </>}
    {(role === "customer" || recipient) && <button type="button" disabled={busy || (choice && (labels.length < 2 || labels.length > 6))}
      onClick={() => void ask()}>Send link to {role === "customer" ? view.customer.email ?? "the customer" : recipient!.contactEmail}</button>}
    <form onSubmit={event => { event.preventDefault(); paste(); }}>
      <label>Paste a reply you got by phone or WhatsApp{fact.kind === "merchant_delivery_date" ? " (date, YYYY-MM-DD)"
        : fact.kind === "crew_availability" ? " (yes or no)" : ""} <input value={pasted} onChange={event => setPasted(event.target.value)}/></label>
      {" "}<button type="submit" disabled={busy || !pasted.trim()}>Save pasted reply</button>
    </form>
  </article>;
}
