"use client";
import { useRef, useState, type FormEvent } from "react";
import type { ReplyLinkView } from "@jobguard/api/workspace";
import { Card, Head, Note } from "../../(designed)/designed-ui";

type Answer = { choice: string } | { other: string } | { deliveryDate: string } | { available: boolean } | { arrangement: string };
const who = { customer: "you", merchant: "your merchant", crew_member: "you" } as const;

function shown(answer: Record<string, string | boolean>) {
  if ("choice" in answer) return String(answer.choice);
  if ("deliveryDate" in answer) return new Date(`${answer.deliveryDate}T12:00:00Z`).toLocaleDateString("en-GB",
    { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
  if ("available" in answer) return answer.available ? "Yes, I can" : "No, I can't";
  return String(answer.arrangement);
}

function Problem({ children }: { children: React.ReactNode }) {
  return <div role="alert"><Note tone="warning">{children}</Note></div>;
}

export function ReplyView({ token, view, failure }: { token: string; view: ReplyLinkView | null; failure: "refused" | "problem" | null }) {
  const [pick, setPick] = useState("");
  const [other, setOther] = useState("");
  const [date, setDate] = useState("");
  const [text, setText] = useState("");
  const [sent, setSent] = useState<{ answer: Record<string, string | boolean>; current: boolean } | null>(null);
  const [error, setError] = useState<"refused" | "answered" | "invalid" | "problem" | null>(null);
  const [busy, setBusy] = useState(false);
  // One command id per answer, so a retried send records the answer once.
  const pending = useRef<{ key: string; commandId: string } | null>(null);

  const answer = (): Answer | null => {
    if (!view) return null;
    switch (view.kind) {
      case "customer_choice": return pick === "__other" ? (other.trim() ? { other: other.trim() } : null) : pick ? { choice: pick } : null;
      case "merchant_delivery_date": return date ? { deliveryDate: date } : null;
      case "crew_availability": return pick === "yes" ? { available: true } : pick === "no" ? { available: false } : null;
      case "access": return text.trim() ? { arrangement: text.trim() } : null;
    }
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = answer();
    if (!value || busy) return;
    const key = JSON.stringify(value);
    if (pending.current?.key !== key) pending.current = { key, commandId: crypto.randomUUID() };
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/v2/replies", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, version: "v2-fact-reply-link.v1", commandId: pending.current.commandId, answer: value }) });
      const body = await response.json() as { code?: string; current?: boolean };
      if (!response.ok) {
        setError(body.code === "REPLY_LINK_REFUSED" ? "refused" : body.code === "REPLY_ALREADY_ANSWERED" ? "answered"
          : body.code === "REPLY_ANSWER_INVALID" ? "invalid" : "problem");
        return;
      }
      setSent({ answer: value as Record<string, string | boolean>, current: body.current === true });
    } catch { setError("problem"); }
    finally { setBusy(false); }
  }

  const head = <Head kicker="QUESTION BY LINK · NO SIGN-IN" title="One question from your builder"
    text={`For ${view ? who[view.recipient] : "you"}. This link answers this one question only. Practice job: nothing real is sent.`}/>;

  let body: React.ReactNode;
  if (failure === "refused" || error === "refused") {
    body = <Problem><strong>This link has expired or was cancelled.</strong> Nothing was recorded. If you still want to answer, contact your builder.</Problem>;
  } else if (failure === "problem" || !view) {
    body = <Problem><strong>This page could not open.</strong> No answer has been sent. Try the link again later.</Problem>;
  } else if (sent) {
    body = <Card title={view.question}><div className="card-body" role="status"><Note><strong>Answer sent.</strong> You answered “{shown(sent.answer)}”. {sent.current
      ? "Thank you. You can close this page."
      : "The builder changed this question after sending the link, so they will check your answer before using it."}</Note></div></Card>;
  } else if (view.status === "answered" || error === "answered") {
    body = <Card title={view.question}><div className="card-body" role="status"><Note><strong>Already answered.</strong>{view.answer
      ? ` You answered “${shown(view.answer)}”.` : ""} Nothing more is needed. To change your answer, contact your builder.</Note></div></Card>;
  } else {
    const value = answer();
    body = <Card title={view.question}><div className="card-body form"><form className="form" onSubmit={submit}>
      {!view.current && <div role="status"><Note tone="warning"><strong>This question has changed since the link was sent.</strong> You can still answer. Your answer is kept and the builder checks it before using it.</Note></div>}
      {view.kind === "customer_choice" && <fieldset className="form"><legend>Choose one answer</legend>
        {view.options.map(option => <label key={option} className="checkrow">
          <input type="radio" name="answer" value={option} checked={pick === option} onChange={() => setPick(option)}/>{option}
        </label>)}
        {view.allowOther && <label className="checkrow"><input type="radio" name="answer" value="__other" checked={pick === "__other"}
          onChange={() => setPick("__other")}/>Something else</label>}
        {pick === "__other" && <label>Your answer<textarea maxLength={500} value={other} onChange={event => setOther(event.target.value)}/></label>}
      </fieldset>}
      {view.kind === "merchant_delivery_date" && <label>Delivery date<input type="date" required value={date} onChange={event => setDate(event.target.value)}/></label>}
      {view.kind === "crew_availability" && <fieldset className="form"><legend>Can you do it?</legend>
        <label className="checkrow"><input type="radio" name="answer" checked={pick === "yes"} onChange={() => setPick("yes")}/>Yes, I can</label>
        <label className="checkrow"><input type="radio" name="answer" checked={pick === "no"} onChange={() => setPick("no")}/>No, I can&apos;t</label>
      </fieldset>}
      {view.kind === "access" && <label>Your answer<textarea required maxLength={500} value={text} onChange={event => setText(event.target.value)}/></label>}
      {error === "invalid" && <Problem>That answer can&apos;t be used for this question. Check it and try again.</Problem>}
      {error === "problem" && <Problem><strong>Your answer was not sent.</strong> Try again in a moment.</Problem>}
      <div className="form-actions"><button className="btn primary" disabled={!value || busy}>{busy ? "Sending…" : "Send answer"}</button></div>
      <small>Your answer goes only to your builder, for this question only. You can answer once.</small>
    </form></div></Card>;
  }

  return <div className="jgd"><div className="rr-app rr-is-inner" data-persona="link">
    {/* Not rr-inner-content: that hides a leading page head, and this page has no other title. */}
    <main className="content" id="main" data-testid="reply-page"><div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 16px 32px" }}>{head}{body}</div></main>
  </div></div>;
}
