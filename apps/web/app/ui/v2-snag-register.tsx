"use client";
// V2-G1 (Q53): the Snags screen under Job › Records, following the M3 mock.
import { useCallback, useEffect, useState } from "react";
import type { SnagRegister } from "@jobguard/api/workspace";
import { Card, Empty, Note, Tag } from "../(designed)/designed-ui";
import { agreedLine, checkedTag, checkerOption, fixedTag, samePerson, snagCheckerAlert, snagEmpty, snagFinalAccountNote,
  snagOwnerLine, snagPeople, snagProblemText, type RegisterPerson } from "./v2-snag-register-label";

type Snag = SnagRegister["snags"][number];
type Crew = SnagRegister["crew"][number];
const builder = "builder";
const toPerson = (value: string, crew: Crew[]): RegisterPerson | null => {
  if (value === builder) return { kind: "builder" };
  const row = crew.find(item => item.crewId === value);
  return row ? { kind: "crew", crewId: row.crewId, name: row.name, trade: row.trade } : null;
};
const wire = (person: RegisterPerson) => person.kind === "crew" ? { kind: "crew", crewId: person.crewId } : { kind: "builder" };

function SnagCard({ snag, crew, busy, send, photo }: { snag: Snag; crew: Crew[]; busy: boolean;
  send: (body: Record<string, unknown>) => Promise<boolean>; photo: (snagId: string) => Promise<void> }) {
  const [fixedBy, setFixedBy] = useState(""), [checkedBy, setCheckedBy] = useState(""), [note, setNote] = useState("");
  const { fixer, checker } = snagPeople(snag);
  const chosenChecker = toPerson(checkedBy, crew), isFixer = samePerson(fixer, chosenChecker);
  const event = (action: string, person: RegisterPerson) => send({ version: "v2-snag-event-command.v1", commandId: crypto.randomUUID(),
    snagId: snag.id, action, person: wire(person) });
  const people = [{ value: builder, name: "The builder" }, ...crew.map(row => ({ value: row.crewId, name: row.name }))];
  return <article aria-label={snag.title}><Card title={snag.title} sub={snagOwnerLine(snag)}
    {...(snag.overdue ? { action: <Tag tone="red">Overdue</Tag> } : {})}>
    <div className="card-body form">
      <p>{snag.photos.length ? `Photos: ${snag.photos.length}` : "No photo yet"}{" "}
        <button type="button" className="btn" disabled={busy || snag.photos.length >= 6} onClick={() => void photo(snag.id)}>Add a practice photo</button></p>
      <p><Tag tone={fixer ? "green" : "amber"}>{fixedTag(fixer)}</Tag> <Tag tone={checker ? "green" : "amber"}>{checkedTag(checker)}</Tag></p>
      {snag.agreed && snag.state !== "checked" && <p data-testid="snag-agreed">{agreedLine(snag.agreed.note)}</p>}
      <label>Owner<select value={snag.owner?.crewId ?? ""} disabled={busy} onChange={event => void send({ version: "v2-snag-owner-command.v1",
        commandId: crypto.randomUUID(), snagId: snag.id, crewId: event.target.value || null })}>
        <option value="">{snag.assigneeLabel ? `${snag.assigneeLabel} (typed name)` : "No crew owner"}</option>
        {crew.map(row => <option key={row.crewId} value={row.crewId}>{row.name} · {row.trade}</option>)}
      </select></label>
      {snag.state === "open" && <>
        <label>Who fixed it<select value={fixedBy} onChange={event => setFixedBy(event.target.value)}>
          <option value="">Choose who fixed it</option>{people.map(row => <option key={row.value} value={row.value}>{row.name}</option>)}
        </select></label>
        <button type="button" className="btn primary" disabled={busy || !fixedBy} onClick={() => {
          const person = toPerson(fixedBy, crew); if (person) void event("mark_fixed", person).then(ok => ok && setFixedBy(""));
        }}>Mark fixed</button>
      </>}
      {snag.state === "fixed" && <>
        <label>Checked by a second person<select value={checkedBy} onChange={event => setCheckedBy(event.target.value)}>
          <option value="">Choose who checked</option>
          {people.map(row => <option key={row.value} value={row.value}>{checkerOption(row.name, samePerson(fixer, toPerson(row.value, crew)))}</option>)}
        </select></label>
        {isFixer && <p role="alert">{snagCheckerAlert}</p>}
        <button type="button" className="btn primary" disabled={busy || !chosenChecker || isFixer} onClick={() => {
          if (chosenChecker) void event("mark_checked", chosenChecker).then(ok => ok && setCheckedBy(""));
        }}>Mark checked</button>
      </>}
      {snag.state !== "open" && <button type="button" className="btn" disabled={busy} onClick={() => void event("reopen", { kind: "builder" })}>Reopen</button>}
      {snag.state !== "checked" && (snag.agreed
        ? <button type="button" className="btn" disabled={busy} onClick={() => void send({ version: "v2-snag-agreed-command.v1",
          commandId: crypto.randomUUID(), snagId: snag.id, agreed: false, note: null })}>Clear agreed to leave open</button>
        : <><label>Agreed with the customer to leave open (note)<input maxLength={200} value={note} onChange={event => setNote(event.target.value)}/></label>
          <button type="button" className="btn" disabled={busy || !note.trim()} onClick={() => void send({ version: "v2-snag-agreed-command.v1",
            commandId: crypto.randomUUID(), snagId: snag.id, agreed: true, note: note.trim() }).then(ok => ok && setNote(""))}>Agreed to leave open at handover</button></>)}
      <p>{snagFinalAccountNote}</p>
    </div>
  </Card></article>;
}

export function SnagRegisterScreen({ jobId }: { jobId: string }) {
  const base = `/api/jobs/${encodeURIComponent(jobId)}`;
  const [register, setRegister] = useState<SnagRegister | null>(null), [problem, setProblem] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(""), [owner, setOwner] = useState(""), [typed, setTyped] = useState(""), [due, setDue] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`${base}/snag-register`, { cache: "no-store" });
    if (!response.ok) throw new Error();
    setRegister(await response.json() as SnagRegister);
  }, [base]);
  useEffect(() => { void load().catch(() => setProblem("Snags could not load. Sign in to the right practice firm and try again.")); }, [load]);

  async function call(path: string, body: Record<string, unknown>) {
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({})) as { code?: string } & Partial<SnagRegister>;
    if (!response.ok) { setNotice(snagProblemText(result.code)); if (response.status === 409) await load().catch(() => undefined); return null; }
    return result;
  }
  async function send(body: Record<string, unknown>) {
    setBusy(true); setNotice("");
    try { const result = await call(`${base}/snag-register`, body); if (result?.version === "v2-snag-register.v1") setRegister(result as SnagRegister); return !!result; }
    catch { setNotice("Result unknown. Reload before trying again."); return false; }
    finally { setBusy(false); }
  }
  async function add() {
    setBusy(true); setNotice("");
    try {
      const snagId = crypto.randomUUID(), crewOwner = register?.crew.find(row => row.crewId === owner);
      const added = await call(`${base}/snags`, { version: "snag.v1", action: "add", commandId: crypto.randomUUID(), snagId, title: title.trim(),
        ...(owner === "typed" && typed.trim() ? { assigneeLabel: typed.trim() } : {}), ...(due ? { dueOn: due } : {}) });
      if (added && crewOwner) await call(`${base}/snag-register`, { version: "v2-snag-owner-command.v1", commandId: crypto.randomUUID(), snagId, crewId: crewOwner.crewId });
      if (added) { setTitle(""); setOwner(""); setTyped(""); setDue(""); }
      await load();
    } catch { setNotice("Result unknown. Reload before trying again."); }
    finally { setBusy(false); }
  }
  async function photo(snagId: string) {
    setBusy(true); setNotice("");
    try {
      const path = `${base}/snags/${encodeURIComponent(snagId)}/photos`;
      const begun = await call(path, { version: "snag-photo.v1", action: "begin", commandId: crypto.randomUUID(), fixture: "completion-photo" }) as { uploadId?: string; objectVersionId?: string } | null;
      if (begun?.uploadId && begun.objectVersionId) await call(path, { version: "snag-photo.v1", action: "finalize", commandId: crypto.randomUUID(),
        uploadId: begun.uploadId, objectVersionId: begun.objectVersionId });
      await load();
    } catch { setNotice("Result unknown. Reload before trying again."); }
    finally { setBusy(false); }
  }

  if (problem) return <div role="alert"><Note tone="warning"><strong>{problem}</strong></Note></div>;
  if (!register) return <p>Loading snags…</p>;
  return <section aria-label="Snags" className="form" data-testid="snag-register">
    <p>Open {register.counts.open} · fixed {register.counts.fixed} · checked {register.counts.checked} · overdue {register.counts.overdue} · agreed to leave open {register.counts.agreed}</p>
    {notice && <p role="alert">{notice}</p>}
    {register.snags.length === 0 && <Card title="Snags"><Empty title="No snags" text={snagEmpty}/></Card>}
    {register.snags.map(snag => <SnagCard key={snag.id} snag={snag} crew={register.crew} busy={busy} send={send} photo={photo}/>)}
    <article aria-label="Record another snag"><Card title="Record another snag"><div className="card-body form">
      <label>What needs doing<input maxLength={200} value={title} onChange={event => setTitle(event.target.value)}/></label>
      <label>Owner<select value={owner} onChange={event => setOwner(event.target.value)}>
        <option value="">No owner yet</option>
        {register.crew.map(row => <option key={row.crewId} value={row.crewId}>{row.name} · {row.trade}</option>)}
        <option value="typed">Someone else (type a name)</option>
      </select></label>
      {owner === "typed" && <label>Their name<input maxLength={120} value={typed} onChange={event => setTyped(event.target.value)}/></label>}
      <label>Due<input type="date" value={due} onChange={event => setDue(event.target.value)}/></label>
      <button type="button" className="btn primary" disabled={busy || !title.trim()} onClick={() => void add()}>Add a snag</button>
    </div></Card></article>
  </section>;
}
