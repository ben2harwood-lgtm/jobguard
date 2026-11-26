"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WalkEntryCommand, WalkPhotoFilingCommand, WalkSessionCommand } from "@jobguard/api/workspace";
import { Card, Note, Tag } from "../../../designed-ui";
import { currentRoom, filingLabel, leavesWalk, needsRoom, roomSummaryEntries, newEntry, restoreEntry, validMeasurement, type EntryBody, type EntryView, type SessionView } from "./walk-state";

type Pending = ({ action: "start" } & WalkSessionCommand) | ({ action: "record" } & WalkEntryCommand) | ({ action: "file" } & WalkPhotoFilingCommand);

function PhotoRoomPicker({ entry, rooms, blocked, file }: {
  entry: EntryView; rooms: EntryView[]; blocked: boolean; file: (roomCaptureOrder: number) => void;
}) {
  const [roomOrder, setRoomOrder] = useState("");
  return <div className="form">
    <label>File under…<select value={roomOrder} disabled={blocked} onChange={event => setRoomOrder(event.target.value)}>
      <option value="">Choose a room</option>
      {rooms.map(room => <option key={room.captureOrder} value={room.captureOrder}>{room.room} (room {room.captureOrder})</option>)}
    </select></label>
    <button type="button" className="btn" disabled={blocked || !roomOrder} onClick={() => file(Number(roomOrder))}>File photo {entry.captureOrder}</button>
    {rooms.length === 0 && <p>Add a room before filing this photo.</p>}
  </div>;
}

export function Walk({ jobId }: { jobId: string }) {
  const router = useRouter();
  const endpoint = `/api/v2-backend/jobs/${encodeURIComponent(jobId)}/walk`;
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [movingPhoto, setMovingPhoto] = useState<number | null>(null);
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
    // Client-side navigation (job section buttons, links) fires no beforeunload, so ask before it unmounts the walk.
    const guard = (event: MouseEvent) => {
      if (!leavesWalk(event.target instanceof Element ? event.target : null)) return;
      if (window.confirm("This walk entry is not saved yet. Leave and lose it?")) return;
      event.preventDefault(); event.stopPropagation();
    };
    document.addEventListener("click", guard, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", guard, true); };
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
      // Version conflicts come back 409; a refused filing comes back 400.
      if ((response.status === 409 || response.status === 400) && (command.action === "record" || command.action === "file")) {
        const refused: { code?: string } = await response.json().catch(() => ({}));
        // A refused filing (room order not in this walk) can never succeed on retry either.
        if (refused.code === "WALK_VERSION_CONFLICT" || (command.action === "file" && refused.code === "WALK_PHOTO_REFUSED")) {
          // Another tab or phone got there first. Retrying can never succeed: reload the walk and drop the stale command.
          const refreshed = await fetch(endpoint, { cache: "no-store" });
          if (refreshed.ok) setSessions((await refreshed.json() as { sessions: SessionView[] }).sessions);
          setPending(null);
          if (command.action === "file") {
            setProblem(refused.code === "WALK_PHOTO_REFUSED" ? "That room is not in this walk. Choose a room again."
              : "Another device filed this photo first. Check its room, then file it again if it is wrong.");
            return;
          }
          const restored = restoreEntry(command.entry);
          if (restored?.room !== undefined) setRoom(restored.room);
          if (restored?.note !== undefined) setNote(restored.note);
          if (restored?.quantity !== undefined) setQuantity(restored.quantity);
          if (restored?.unit !== undefined) setUnit(restored.unit);
          setProblem("Another device saved to this walk first. Check the walk order, then add your entry again.");
          return;
        }
      }
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

  function file(entry: EntryView, roomCaptureOrder: number) {
    if (!session || blocked || sending.current) return;
    void save({ action: "file", version: "v2-walk-photo-filing-command.v1", sessionId: session.sessionId,
      commandId: crypto.randomUUID(), captureOrder: entry.captureOrder, roomCaptureOrder,
      expectedVersion: entry.filingVersion ?? 0,
      reason: entry.link === "no_room" ? "no_room" : entry.link === "waiting" ? "waiting" : "misfiled" });
  }
  const rooms = entries.filter(entry => entry.kind === "room");
  const tray = needsRoom(entries);
  // Keyed by walk too, so a room choice never carries over to another walk's photo with the same order.
  const picker = (entry: EntryView) => <PhotoRoomPicker key={`${session?.sessionId}:${entry.captureOrder}`} entry={entry} rooms={rooms} blocked={blocked || unsent}
    file={roomCaptureOrder => file(entry, roomCaptureOrder)}/>;

  const pendingEntry = pending?.action === "record" ? pending : null;
  const roomNames = [...new Set(entries.filter(entry => entry.kind === "room").map(entry => entry.room!))];
  const roomName = pendingEntry?.entry.kind === "room" ? pendingEntry.entry.room : activeRoom?.room;
  const roomEntries = roomSummaryEntries(entries, roomName);

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
      {pending?.action === "file" && <div role="status">{busy ? "Filing photo…" : "Not saved yet."}
        {!busy && <button type="button" className="btn" onClick={() => void save(pending)}>Retry</button>}</div>}
      {session && <>
        <Card title="Needs room">
          {tray.length === 0 ? <p className="card-body">Nothing waiting for a room.</p> : tray.map(entry =>
            <article key={entry.captureOrder} className="card-body" aria-label={`Photo ${entry.captureOrder} needs room`}>
              <strong>Photo {entry.captureOrder}</strong>
              <p>{filingLabel(entry)}</p>
              {entry.clock.flagged && <p>Phone time needs checking.</p>}
              {picker(entry)}
            </article>)}
        </Card>
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
              {entry.kind !== "room" && <p>{filingLabel(entry)}</p>}
              {entry.kind === "photo" && <>
                <button type="button" className="btn" disabled={blocked || unsent}
                  onClick={() => setMovingPhoto(movingPhoto === entry.captureOrder ? null : entry.captureOrder)}>Move to another room</button>
                {movingPhoto === entry.captureOrder && picker(entry)}
              </>}
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
