"use client";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type { CrewLinkTask, CrewLinkView } from "@jobguard/api/workspace";
import { Card, Empty, Head, Note, Tag } from "../../(designed)/designed-ui";
import { crewBlockedNote, crewBlockedReasons, crewChangedNote, crewKindLabel, crewPageHead, crewPageProblem, crewProofNote,
  crewReportedNote, crewSentNote, type CrewKind } from "../../ui/v2-crew-link-label";

type Sent = { taskKey: string; scopeItemId: string; kind: CrewKind; note: string };

function Problem({ children }: { children: ReactNode }) {
  return <div role="alert"><Note tone="warning">{children}</Note></div>;
}

function TaskCard({ task, disabled, send }: { task: CrewLinkTask; disabled: boolean;
  send: (task: CrewLinkTask, kind: CrewKind, note: string) => Promise<boolean> }) {
  const [form, setForm] = useState<"blocked" | "changed" | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const reset = () => { setForm(null); setReason(""); setNote(""); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form === "blocked" && reason && await send(task, "blocked", crewBlockedNote(reason, note))) reset();
    if (form === "changed" && note.trim() && await send(task, "changed", note.trim())) reset();
  }
  const latest = task.latest;
  return <Card title={task.title} {...(task.visit ? { sub: task.visit } : {})}
    {...(latest ? { action: <Tag tone={latest.kind === "done" ? "green" : latest.kind === "blocked" ? "amber" : "blue"}>{crewKindLabel(latest.kind)}</Tag> } : {})}>
    <div className="card-body form">
      {task.reported && <p role="status">{crewReportedNote(task.reported.kind)}{task.reported.note ? ` · ${task.reported.note}` : ""}</p>}
      <p><strong>What to do</strong> · {task.scope.description}{task.scope.quantity ? ` · ${task.scope.quantity} ${task.scope.unit ?? ""}` : ""}</p>
      {task.proofNeeded.length > 0 && <p><strong>Proof needed</strong> · {task.proofNeeded.join(", ")}. {crewProofNote}</p>}
      {form === null && <div className="form-actions">
        <button type="button" className="btn" disabled={disabled} onClick={() => setForm("blocked")}>Blocked</button>
        <button type="button" className="btn" disabled={disabled} onClick={() => setForm("changed")}>Changed</button>
        <button type="button" className="btn primary" disabled={disabled} onClick={() => void send(task, "done", "")}>Done</button>
      </div>}
      {form === "blocked" && <form className="form" onSubmit={submit} aria-label={`Blocked: ${task.title}`}>
        <label>Why is it blocked?<select value={reason} onChange={event => setReason(event.target.value)}>
          <option value="">Choose a reason</option>{crewBlockedReasons.map(row => <option key={row}>{row}</option>)}
        </select></label>
        <label>What would unblock it? (optional)<textarea maxLength={1900} value={note} onChange={event => setNote(event.target.value)}/></label>
        <div className="form-actions"><button type="button" className="btn" onClick={reset}>Cancel</button>
          <button className="btn primary" disabled={!reason || disabled}>Send blocked</button></div>
      </form>}
      {form === "changed" && <form className="form" onSubmit={submit} aria-label={`Changed: ${task.title}`}>
        <label>What changed on site?<textarea maxLength={2000} value={note} onChange={event => setNote(event.target.value)}/></label>
        <div role="status"><Note>{crewChangedNote}</Note></div>
        <div className="form-actions"><button type="button" className="btn" onClick={reset}>Cancel</button>
          <button className="btn primary" disabled={!note.trim() || disabled}>Send change note</button></div>
      </form>}
    </div>
  </Card>;
}

export function BriefView({ token, view, failure }: { token: string; view: CrewLinkView | null; failure: "refused" | "problem" | null }) {
  const [sent, setSent] = useState<Sent[]>([]);
  const [error, setError] = useState<"refused" | "changed" | "invalid" | "problem" | null>(null);
  const [busy, setBusy] = useState(false);
  // One command id per press until a response arrives, so a retried send records once.
  const pending = useRef<{ key: string; commandId: string } | null>(null);

  async function send(task: CrewLinkTask, kind: CrewKind, note: string) {
    if (!view?.brief || busy) return false;
    const key = JSON.stringify([task.scopeItemId, task.taskKey, kind, note]);
    if (pending.current?.key !== key) pending.current = { key, commandId: crypto.randomUUID() };
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/v2/brief", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "v2-crew-link-press.v1", token, commandId: pending.current.commandId,
          briefVersion: view.brief.version, scopeItemId: task.scopeItemId, taskKey: task.taskKey, kind, note }) });
      const body = await response.json().catch(() => ({})) as { code?: string };
      if (!response.ok) {
        // A refusal is final for this command; anything else keeps the id for a retry.
        if (response.status !== 503) pending.current = null;
        setError(body.code === "CREW_LINK_REFUSED" ? "refused" : body.code === "CREW_LINK_STALE" ? "changed"
          : body.code === "CREW_LINK_INVALID_COMMAND" ? "invalid" : "problem");
        return false;
      }
      pending.current = null;
      setSent(rows => [...rows, { taskKey: task.taskKey, scopeItemId: task.scopeItemId, kind, note }]);
      return true;
    } catch { setError("problem"); return false; }
    finally { setBusy(false); }
  }

  const head = view ? crewPageHead(view.trade, view.crewName) : { kicker: "MY BRIEF · BY LINK", title: "Your brief", text: "Practice job: nothing real is sent. No prices." };
  let body: ReactNode;
  if (failure === "refused" || error === "refused") body = <Problem><strong>{crewPageProblem.refused}</strong></Problem>;
  else if (failure === "problem" || !view) body = <Problem><strong>{crewPageProblem.problem}</strong></Problem>;
  else if (!view.brief || view.brief.tasks.length === 0) body = <Card title="My brief"><Empty title="No work for you yet" text={crewPageProblem.empty}/></Card>;
  else {
    const brief = view.brief;
    const changed = brief.changed || error === "changed";
    const title = (row: Sent) => brief.tasks.find(task => task.taskKey === row.taskKey && task.scopeItemId === row.scopeItemId)?.title ?? "";
    body = <div className="form">
      {changed && <div role="status"><Note tone="warning"><strong>{crewPageProblem.changed}</strong></Note></div>}
      <Card title={`${view.trade} brief`} sub={`Brief version ${brief.version}`}>
        <div className="card-body">
          <p><strong>Access</strong> · {brief.accessWindow}</p>
          {brief.proofNeeded.length > 0 && <p><strong>Proof needed</strong> · {brief.proofNeeded.join(", ")}</p>}
          <p>No prices.</p>
        </div>
      </Card>
      {error === "invalid" && <Problem>{crewPageProblem.invalid}</Problem>}
      {error === "problem" && <Problem><strong>{crewPageProblem.notSent}</strong></Problem>}
      {brief.tasks.map(task => <TaskCard key={`${task.scopeItemId}:${task.taskKey}`} task={task} disabled={changed || busy} send={send}/>)}
      <Card title="Your updates" sub="Each one goes to the builder, who confirms it.">
        {sent.length ? sent.map((row, index) => <article className="card-body" key={index} aria-label={`${crewKindLabel(row.kind)}: ${title(row)}`}>
          <div className="job-caption"><Tag tone={row.kind === "done" ? "green" : row.kind === "blocked" ? "amber" : "blue"}>{crewKindLabel(row.kind)}</Tag></div>
          <p>{title(row)}{row.note && ` · ${row.note}`}</p>
          <p role="status">{crewSentNote(row.kind)}</p>
        </article>) : <p className="card-body">No updates yet. Press Done, Blocked or Changed on a task.</p>}
      </Card>
    </div>;
  }

  return <div className="jgd"><div className="rr-app rr-is-inner" data-persona="link">
    <main className="content" id="main" data-testid="crew-brief-page"><div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 16px 32px" }}>
      <Head kicker={head.kicker} title={head.title} text={head.text}/>{body}
    </div></main>
  </div></div>;
}
