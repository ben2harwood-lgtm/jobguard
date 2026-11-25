"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import type { FridayCommand, FridayContent, FridaySnapshot } from "@jobguard/api/workspace";
import { Card, Head, Note, Shell, Tag } from "../../../designed-ui";

const notice = "Practice sandbox — synthetic data; nothing is sent or charged";
const empty = { thisWeek: "No work scheduled this week.", nextWeek: "Nothing planned for next week yet." };
function thisMonday() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
export function FridayUpdateScreen({ jobId }: { jobId: string }) {
  const [week, setWeek] = useState(thisMonday);
  const [snapshot, setSnapshot] = useState<FridaySnapshot | null>(null);
  const [csrf, setCsrf] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState<FridayContent>({ schema: "friday-content.v1", thisWeek: [], nextWeek: [], photos: [] });
  const [lines, setLines] = useState({ thisWeek: "", nextWeek: "" });
  const pending = useRef<FridayCommand | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const url = `/api/jobs/${jobId}/friday-update`;
  useEffect(() => {
    let current = true;
    setBusy(true); setError(""); setSnapshot(null); setEditing(false); setPreview(false); pending.current = null;
    fetch(`${url}?week=${week}`, { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Update unavailable. Check that you are signed in to the practice workspace.");
      const data = await response.json();
      if (current) { setSnapshot(data.snapshot); setCsrf(data.csrfToken); }
    }).catch(cause => { if (current) setError(cause.message); }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [url, week]);
  async function run(action: "prepare" | "edit" | "send") {
    setBusy(true); setError("");
    const base = { schema: "friday-command.v1" as const, commandId: crypto.randomUUID(), week,
      expectedVersion: snapshot?.sequence ?? 0, clientCreatedAt: new Date().toISOString() };
    const command: FridayCommand = action === "edit" ? { ...base, action, content: draft }
      : action === "send" ? { ...base, action, contentHash: snapshot!.contentHash } : { ...base, action };
    // Keep the same identity after a transport error, including an unknown outcome.
    const input = pending.current ?? command;
    pending.current = input;
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify(input) });
      if (!response.ok) {
        pending.current = null;
        throw new Error(response.status === 409 ? "This update changed. Reload to review the current version." : "Update refused. Check the week starts on Monday and leave amounts out of the text.");
      }
      setSnapshot((await response.json()).snapshot); setEditing(false); pending.current = null;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Update unavailable. Retry the same action."); }
    finally { setBusy(false); }
  }
  function beginEdit() {
    setDraft(snapshot!.content);
    setLines({ thisWeek: snapshot!.content.thisWeek.join("\n"), nextWeek: snapshot!.content.nextWeek.join("\n") });
    setEditing(true); setPreview(false);
  }
  function change(key: "thisWeek" | "nextWeek", text: string) {
    setLines(value => ({ ...value, [key]: text }));
    setDraft(value => ({ ...value, [key]: text.split("\n").map(row => row.trim()).filter(Boolean) }));
  }
  return <Shell workspace={null} title="Friday update" subtitle="Customer update" active="jobs">
    <Head kicker="Customer update" title="Friday update" text="Review the scheduled work and edit the wording to say what actually happened."/>
    <div className="form" data-testid="friday-update">
      <Note>{notice}</Note>
      <a className="btn" href={`/jobs/${jobId}/overview`}>Back to job</a>
      <label>Week starting Monday<input type="date" value={week} disabled={busy || !!pending.current} onChange={event => setWeek(event.target.value)}/></label>
      {error && <div ref={errorRef} tabIndex={-1} role="alert"><Note tone="warning">{error}</Note></div>}
      {preview ? <Card title="Your Friday update" sub={`Week of ${week}`}><div className="card-body form"><button className="btn" onClick={() => setPreview(false)}>Back to editing</button></div></Card> : <Card title="Friday update" sub={snapshot ? `Week of ${week} · to ${snapshot.recipient}` : `Week of ${week}`}
        action={<Tag tone={snapshot?.sentAt ? "green" : "amber"}>{snapshot?.sentAt ? "Sent to practice inbox" : "Not sent"}</Tag>}>
        <div className="card-body form">
          <p>Nothing is sent until you press Send. Practice inbox only.</p>
          <p>The plan shows scheduled work, not completion. Check and edit the wording before sending.</p>
          <p>Diary notes are not included because customer visibility is not recorded.</p>
          {!snapshot && <button className="btn primary" disabled={busy} onClick={() => void run("prepare")}>Prepare update</button>}
          {snapshot && <>
            <p>Version {snapshot.contentVersion}</p>
            <div className="form-actions">
              <button className="btn" disabled={busy || editing || !!pending.current} onClick={() => setPreview(value => !value)}>{preview ? "Back to editing" : "Preview as the customer sees it"}</button>
              <button className="btn" disabled={busy || editing || !!pending.current} onClick={beginEdit}>Edit text</button>
              <button className="btn primary" disabled={busy || editing || !!snapshot.sentAt} onClick={() => void run("send")}>Send update</button>
            </div>
            {snapshot.sentAt && <p role="status">Version {snapshot.contentVersion} sent to the practice inbox. Sending this version again adds nothing.</p>}
          </>}
        </div>
      </Card>}
      {snapshot && <>
        {(["thisWeek", "nextWeek"] as const).map(key => <Fragment key={key}><Card title={key === "thisWeek" ? "This week" : "Next week"}>
          <div className="card-body">
            {editing ? <label>{key === "thisWeek" ? "This week text" : "Next week text"}<textarea disabled={busy || !!pending.current} value={lines[key]} onChange={event => change(key, event.target.value)} maxLength={12000}/></label>
              : snapshot.content[key].length ? <ul>{snapshot.content[key].map((line, index) => <li key={index}>{line}</li>)}</ul> : <p>{empty[key]}</p>}
          </div>
        </Card>{key === "thisWeek" && <Card title="Photos"><p className="card-body">No photos this week.</p></Card>}</Fragment>)}
        {editing && <div className="form-actions"><button className="btn" disabled={busy || !!pending.current} onClick={() => setEditing(false)}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={() => void run("edit")}>Save text</button></div>}
      </>}
    </div>
  </Shell>;
}
