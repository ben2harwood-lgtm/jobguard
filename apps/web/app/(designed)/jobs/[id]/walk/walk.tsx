"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WalkEntryCommand, WalkSessionCommand } from "@jobguard/api/workspace";
import { Card, Note, Tag } from "../../../designed-ui";
import { currentRoom, newEntry, validMeasurement, type EntryBody, type SessionView } from "./walk-state";

type Pending = ({ action: "start" } & WalkSessionCommand) | ({ action: "record" } & WalkEntryCommand);

export function Walk({ jobId }: { jobId: string }) {
  const router = useRouter();
  const endpoint = `/api/v2-backend/jobs/${encodeURIComponent(jobId)}/walk`;
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [room, setRoom] = useState("");
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const roomInput = useRef<HTMLInputElement>(null);
  // A ref closes the double-tap window before React commits the disabled controls.
  const sending = useRef(false);
  const session = sessions?.find(item => item.sessionId === selected);
  const entries = session?.entries ?? [];
  const activeRoom = currentRoom(entries);
  const unsent = Boolean(room.trim() || note.trim() || quantity.trim() || unit.trim());
  const blocked = busy || pending !== null;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("unavailable");
      const body: { sessions: SessionView[] } = await response.json();
      if (active) { setSessions(body.sessions); setSelected(body.sessions.at(-1)?.sessionId ?? ""); }
    }).catch(() => { if (active) setProblem("The walk could not open. Reload to try again."); });
    return () => { active = false; controller.abort(); };
  }, [endpoint]);

  useEffect(() => {
    if (!pending && !unsent) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending, unsent]);

  async function save(command: Pending) {
    if (sending.current) return;
    sending.current = true;
    setPending(command);
    setBusy(true);
    setProblem("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(command) });
      if (!response.ok) throw new Error("not saved");
      // Read the authoritative order and room links, including after an unknown outcome retry.
      const refreshed = await fetch(endpoint, { cache: "no-store" });
      if (!refreshed.ok) throw new Error("not read");
      const body: { sessions: SessionView[] } = await refreshed.json();
      setSessions(body.sessions);
      setSelected(command.sessionId);
      setPending(null);
    } catch {
      setProblem("Not saved yet. Retry with this page open. Unsaved entries do not survive a reload.");
    } finally { sending.current = false; setBusy(false); }
  }

  function start() {
    if (blocked || unsent) return;
    void save({ action: "start", version: "v2-walk-session-command.v1",
      sessionId: crypto.randomUUID(), deviceStartedAt: new Date().toISOString() });
  }

  function add(entry: EntryBody) {
    if (!session || blocked || sending.current) return;
    const command = newEntry(session.sessionId, entries, entry, crypto.randomUUID(), new Date().toISOString());
    void save({ action: "record", ...command });
  }

  const pendingEntry = pending?.action === "record" ? pending : null;
  const roomNames = [...new Set(entries.filter(entry => entry.kind === "room").map(entry => entry.room!))];
  const roomName = pendingEntry?.entry.kind === "room" ? pendingEntry.entry.room : activeRoom?.room;
  const roomEntries = entries.filter(entry => entry.link === "linked" && entry.linkedRoom === roomName);

  return <section aria-label="Walk the job" className="form">
    <h2>Walk the job</h2>
    <Note>Practice sandbox — synthetic data; nothing is sent or charged. Use only the supplied fictional job.</Note>
    <p>Online first. Saved entries are on the server. Dictate with your phone keyboard or type; JobGuard receives text only.</p>
    {problem && <p role="alert">{problem}</p>}
    {sessions === null ? <p role="status">{problem ? "Walk unavailable." : "Opening the walk…"}</p> : <>
      <div className="form-actions">
        {sessions.length > 0 && <label>Walk session<select value={selected} disabled={blocked || unsent}
          onChange={event => setSelected(event.target.value)}>
          {sessions.map((item, index) => <option key={item.sessionId} value={item.sessionId}>Walk {index + 1}</option>)}
        </select></label>}
        <button type="button" className="btn" disabled={blocked || unsent} onClick={start}>{session ? "Start another walk" : "Start a walk"}</button>
      </div>
      {pending?.action === "start" && <div role="status">{busy ? "Starting walk…" : "Not saved yet."}
        <button type="button" className="btn" disabled={busy} onClick={() => void save(pending)}>Retry</button></div>}
      {!session && !pending && <p>No rooms yet. Start a walk, then add the first room.</p>}
      {session && <>
        <Card title={roomName ?? "Choose the first room"}>
          <div className="card-body form">
            {roomNames.length > 0 && <label>Pick a room<select value="" disabled={blocked || unsent}
              onChange={event => { if (event.target.value) add({ kind: "room", room: event.target.value }); }}>
              <option value="">Choose a room</option>{roomNames.map(name => <option key={name}>{name}</option>)}
            </select></label>}
            <form className="form" onSubmit={event => { event.preventDefault(); if (room.trim()) { add({ kind: "room", room: room.trim() }); setRoom(""); } }}>
              <label>New room<input ref={roomInput} value={room} maxLength={80} disabled={blocked}
                onChange={event => setRoom(event.target.value)}/></label>
              <button className="btn primary" disabled={blocked || !room.trim() || Boolean(note.trim() || quantity || unit)}>Add room</button>
            </form>
            <button type="button" className="btn" disabled>Take photo</button>
            <p>Photos arrive in the next update</p>
            <form className="form" onSubmit={event => { event.preventDefault(); if (note.trim()) { add({ kind: "note", text: note.trim() }); setNote(""); } }}>
              <label>Note for {activeRoom?.room ?? "this room"}<textarea placeholder="Dictate or type what you see"
                maxLength={4000} disabled={blocked || !activeRoom} value={note} onChange={event => setNote(event.target.value)}/></label>
              <button className="btn primary" disabled={blocked || !activeRoom || !note.trim() || Boolean(room.trim())}>Add note</button>
            </form>
            <form className="form" onSubmit={event => { event.preventDefault(); if (validMeasurement(quantity) && unit.trim()) {
              add({ kind: "measurement", quantity, unit: unit.trim() }); setQuantity(""); setUnit("");
            } }}>
              <label>Quantity<input inputMode="decimal" value={quantity} disabled={blocked || !activeRoom}
                maxLength={40} onChange={event => setQuantity(event.target.value)}/></label>
              <label>Unit<input value={unit} maxLength={40} disabled={blocked || !activeRoom} onChange={event => setUnit(event.target.value)}/></label>
              {quantity && !validMeasurement(quantity) && <p>Use a positive quantity with up to six decimal places.</p>}
              <button className="btn primary" disabled={blocked || !activeRoom || !validMeasurement(quantity) || !unit.trim() || Boolean(room.trim())}>Add measurement</button>
            </form>
          </div>
        </Card>
        <Card title={`So far in ${roomName ?? "this room"}`}>
          {roomEntries.length === 0 && !pendingEntry && <p className="card-body">Nothing recorded here yet.</p>}
          {roomEntries.map(entry => <article className="card-body" key={entry.captureOrder}>
            <p>{entry.kind === "measurement" ? `${entry.quantity} ${entry.unit}` : entry.text}</p><Tag tone="green">Saved</Tag>
          </article>)}
          {pendingEntry && <article className="card-body" role="status">
            <p>{pendingEntry.entry.kind === "room" ? pendingEntry.entry.room : pendingEntry.entry.kind === "measurement"
              ? `${pendingEntry.entry.quantity} ${pendingEntry.entry.unit}` : pendingEntry.entry.kind === "note" ? pendingEntry.entry.text : "Photo"}</p>
            <Tag tone="amber">Not saved yet</Tag>{!busy && <button type="button" className="btn" onClick={() => void save(pendingEntry)}>Retry</button>}
          </article>}
        </Card>
        <Card title="Walk order">
          <ol aria-label="Saved walk entries">
            {entries.map(entry => <li key={entry.captureOrder} data-testid="walk-entry" className="card-body">
              <strong>{entry.captureOrder}. {entry.kind === "room" ? entry.room : entry.kind === "measurement" ? `${entry.quantity} ${entry.unit}` : entry.kind === "photo" ? "Photo record" : entry.text}</strong>
              {entry.kind !== "room" && <p>{entry.link === "linked" ? entry.linkedRoom : "Room link needs checking"}</p>}
              <p><time dateTime={entry.deviceCapturedAt}>{entry.deviceCapturedAt}</time> · phone time</p>
              <Tag tone="green">Saved</Tag>
            </li>)}
          </ol>
        </Card>
        <div className="form-actions">
          <button type="button" className="btn" disabled={blocked || unsent} onClick={() => roomInput.current?.focus()}>Next room</button>
          <button type="button" className="btn primary" disabled={blocked || unsent || !activeRoom}
            onClick={() => router.push(`/jobs/${encodeURIComponent(jobId)}/work`)}>Finish walk</button>
        </div>
        {unsent && <p>Add or clear your unsent room, note or measurement before leaving this room or finishing.</p>}
      </>}
    </>}
  </section>;
}
