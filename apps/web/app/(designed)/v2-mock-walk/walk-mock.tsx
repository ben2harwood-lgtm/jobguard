"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Card, Empty, Head, Note, Shell, Tag } from "../designed-ui";
import { dictated, job, nextPhoto, notes as fixtureNotes, photos as fixturePhotos, rooms, type ItemStatus, type Room, type WalkNote, type WalkPhoto } from "./fixture";

const screens = ["Walk", "Check the walk"] as const;
type Screen = (typeof screens)[number];
const states: Record<Screen, readonly string[]> = {
  Walk: ["Example", "Microphone refused", "Camera refused", "No signal", "Empty", "Problem"],
  "Check the walk": ["Example", "After a move", "Empty", "Problem"],
};

type Move = { from: Room | null; to: Room };
type Photo = WalkPhoto & { moves: Move[] };

const offlineNoteId = "n-offline";
const isRoom = (value: unknown): value is Room => rooms.some(room => room === value);

function Status({ status }: { status: ItemStatus }) {
  return status === "saved" ? <Tag tone="green">Saved</Tag> : <Tag tone="amber">Not saved yet</Tag>;
}

function PhotoCard({ photo, children }: { photo: Photo; children?: ReactNode }) {
  return <article className="photo-card" aria-label={photo.label}>
    <img src={photo.src} alt={photo.label}/>
    <div className="photo-copy">
      <strong>{photo.label}</strong>
      <p>{photo.order === null ? "Imported · not part of the walk order" : `Photo ${photo.order} in the walk`}</p>
      {children}
    </div>
  </article>;
}

type Drafts = Partial<Record<Room, string>>;

function Walk({ notes, photos, room, setRoom, offline, micRefused, cameraRefused, addNote, takePhoto, finish, drafts, setDrafts }: {
  notes: WalkNote[]; photos: Photo[]; room: Room; setRoom: (room: Room) => void; offline: boolean; micRefused: boolean; cameraRefused: boolean;
  addNote: (text: string) => void; takePhoto: () => void; finish: () => void;
  drafts: Drafts; setDrafts: (update: (rows: Drafts) => Drafts) => void;
}) {
  // Each room keeps its own unsent draft, held above this screen so switching room, state or screen
  // never refiles or drops typed or dictated words.
  const [dictatedIn, setDictatedIn] = useState<Partial<Record<Room, boolean>>>({});
  const draft = drafts[room] ?? "";
  const fromDictation = dictatedIn[room] ?? false;
  const setDraft = (text: string) => setDrafts(rows => ({ ...rows, [room]: text }));
  const setFromDictation = (value: boolean) => setDictatedIn(rows => ({ ...rows, [room]: value }));
  const index = rooms.indexOf(room);
  const roomNotes = notes.filter(note => note.room === room);
  const roomPhotos = photos.filter(photo => photo.room === room && photo.order !== null).sort((a, b) => a.order! - b.order!);
  const pending = notes.filter(note => note.status === "pending").length + photos.filter(photo => photo.status === "pending").length;
  const unsent = rooms.filter(name => drafts[name]?.trim());

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    addNote(draft.trim());
    setDraft("");
    setFromDictation(false);
  }

  return <div className="form">
    <Card title={room} sub={`Room ${index + 1} of ${rooms.length}`}
      action={pending ? <Tag tone="amber">{pending} not saved yet</Tag> : <Tag tone="green">All saved</Tag>}>
      <div className="card-body form">
        {offline && <div role="status"><Note tone="warning"><strong>No signal.</strong> New notes and photos are not saved yet and wait on this phone. Everything marked Saved is safe on the server.</Note></div>}
        {micRefused && <div role="status"><Note tone="warning"><strong>Microphone not allowed.</strong> Type your notes instead. Nothing else changes.</Note></div>}
        {cameraRefused && <div role="status"><Note tone="warning"><strong>Camera not allowed.</strong> Notes still work. To take photos, allow the camera in your phone settings.</Note></div>}
        <label>Current room<select value={room} onChange={event => { if (isRoom(event.target.value)) setRoom(event.target.value); }}>
          {rooms.map(name => <option key={name}>{name}</option>)}
        </select></label>
        <div className="form-actions"><button type="button" className="btn primary" disabled={cameraRefused} onClick={takePhoto}>Take photo</button></div>
        <form className="form" onSubmit={submit}>
          <label>{`Note for ${room}`}<textarea value={draft} placeholder="Dictate or type what you see" onChange={event => setDraft(event.target.value)}/></label>
          {fromDictation && <p role="status">Words from dictation. Check and edit them before adding.</p>}
          <div className="form-actions">
            <button type="button" className="btn" disabled={micRefused} onClick={() => { setDraft(dictated[room]); setFromDictation(true); }}>Dictate</button>
            <button className="btn primary" disabled={!draft.trim()}>Add note</button>
          </div>
          <p>Speech is turned into words on this phone. No audio is uploaded or kept.</p>
        </form>
      </div>
    </Card>
    <Card title={`So far in ${room}`} sub={`${roomNotes.length} notes · ${roomPhotos.length} photos`}>
      {!roomNotes.length && !roomPhotos.length && <p className="card-body">Nothing yet for {room}. Take a photo or add a note.</p>}
      {roomNotes.map(note => <article className="card-body" key={note.id}>
        <p>{note.text}</p>
        <div className="job-caption"><Status status={note.status}/></div>
      </article>)}
      {roomPhotos.map(photo => <PhotoCard key={photo.id} photo={photo}><div className="job-caption"><Status status={photo.status}/></div></PhotoCard>)}
    </Card>
    <div className="card-body form">
      <div className="form-actions">
        <button type="button" className="btn" disabled={index === rooms.length - 1} onClick={() => setRoom(rooms[index + 1]!)}>Next room</button>
        <button type="button" className="btn primary" disabled={pending > 0 || unsent.length > 0} onClick={finish}>Finish walk</button>
      </div>
      {pending > 0 && <p>Finish the walk once every item is saved.</p>}
      {unsent.length > 0 && <p>Add or clear the unsent note in {unsent.join(" and ")} before you finish.</p>}
    </div>
  </div>;
}

function MoveForm({ photo, move, cancel }: { photo: Photo; move: (to: Room) => void; cancel: () => void }) {
  const choices = rooms.filter(room => room !== photo.room);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const to = new FormData(event.currentTarget).get("to");
    if (isRoom(to)) move(to);
  }
  return <form className="form" onSubmit={submit}>
    <label>Move to<select name="to" defaultValue={choices[0]}>{choices.map(room => <option key={room}>{room}</option>)}</select></label>
    <div className="form-actions"><button type="button" className="btn" onClick={cancel}>Cancel</button>
      <button className="btn primary">Move in preview</button></div>
  </form>;
}

function History({ photo }: { photo: Photo }) {
  if (!photo.moves.length) return null;
  return <>
    <div className="job-caption"><Tag tone="blue">Corrected</Tag></div>
    {photo.original && <p>Original link: {photo.original} (photo {photo.order} in the walk). Kept in the history.</p>}
    {photo.moves.map((move, position) => <p key={position}>{move.from ? `Moved from ${move.from} to ${move.to}` : `Assigned from Needs room to ${move.to}`}</p>)}
  </>;
}

function CheckWalk({ notes, photos, move, keep, confirmed, confirm }: {
  notes: WalkNote[]; photos: Photo[]; move: (id: string, to: Room) => void; keep: (id: string) => void; confirmed: boolean; confirm: () => void;
}) {
  const [moving, setMoving] = useState<string | null>(null);
  const tray = photos.filter(photo => photo.room === null);
  const unclear = photos.filter(photo => photo.unclear).length;
  const pending = notes.filter(note => note.status === "pending").length + photos.filter(photo => photo.status === "pending").length;
  const blockers = [
    tray.length ? `${tray.length} photo${tray.length === 1 ? "" : "s"} still need a room` : "",
    unclear ? `${unclear} unclear link${unclear === 1 ? "" : "s"} to check` : "",
    pending ? `${pending} item${pending === 1 ? "" : "s"} not saved yet` : "",
  ].filter(Boolean);

  function actions(photo: Photo) {
    if (confirmed) return null;
    return moving === photo.id
      ? <MoveForm photo={photo} move={to => { move(photo.id, to); setMoving(null); }} cancel={() => setMoving(null)}/>
      : <div className="form-actions">
        <button type="button" className="btn small" aria-label={`Move photo ${photo.label}`} onClick={() => setMoving(photo.id)}>Move photo</button>
        {photo.unclear && photo.room && <button type="button" className="btn small" aria-label={`Keep ${photo.label} in ${photo.room}`} onClick={() => keep(photo.id)}>Keep in {photo.room}</button>}
      </div>;
  }

  return <div className="form">
    <div role="status"><Note>Photos link to the room that was open when they were taken, in walk order. Clock times and photo details never choose the room.</Note></div>
    {rooms.map(room => {
      const roomNotes = notes.filter(note => note.room === room);
      const roomPhotos = photos.filter(photo => photo.room === room).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      return <Card key={room} title={room} sub={`${roomNotes.length} notes · ${roomPhotos.length} photos`}>
        {!roomNotes.length && !roomPhotos.length && <p className="card-body">Nothing filed under {room}.</p>}
        {roomNotes.map(note => <article className="card-body" key={note.id}>
          <p>{note.text}</p>
          <div className="job-caption"><Status status={note.status}/></div>
        </article>)}
        {roomPhotos.map(photo => <PhotoCard key={photo.id} photo={photo}>
          {photo.unclear && <><div className="job-caption"><Tag tone="amber">Check room</Tag></div><p>{photo.unclear}</p></>}
          {photo.imported && <p>Imported. Not linked by the walk.</p>}
          <History photo={photo}/>
          {actions(photo)}
        </PhotoCard>)}
      </Card>;
    })}
    <Card title="Needs room" sub="Imported photos stay here, unlinked, until you choose a room.">
      {tray.length ? tray.map(photo => <PhotoCard key={photo.id} photo={photo}>{actions(photo)}</PhotoCard>)
        : <p className="card-body">Nothing waiting for a room.</p>}
    </Card>
    <div className="card-body form">
      {confirmed
        ? <div role="status"><Note><strong>Walk confirmed in this preview.</strong> Mock only. Nothing has been saved or sent.</Note></div>
        : <>
          <div className="form-actions"><button type="button" className="btn primary" disabled={blockers.length > 0} onClick={confirm}>Confirm walk</button></div>
          {blockers.length > 0 && <p>Before you confirm: {blockers.join(" · ")}.</p>}
        </>}
    </div>
  </div>;
}

export function WalkMock() {
  const [screen, setScreen] = useState<Screen>("Walk");
  const [view, setView] = useState("Example");
  const [room, setRoom] = useState<Room>("Kitchen");
  const [notes, setNotes] = useState<WalkNote[]>(fixtureNotes);
  const [photos, setPhotos] = useState<Photo[]>(() => fixturePhotos.map(photo => ({ ...photo, moves: [] })));
  const [count, setCount] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [drafts, setDrafts] = useState<Drafts>({});
  const offline = screen === "Walk" && view === "No signal";
  const status: ItemStatus = offline ? "pending" : "saved";

  function movePhoto(id: string, to: Room) {
    setPhotos(rows => rows.map(photo => photo.id === id ? { ...photo, room: to, unclear: undefined, moves: [...photo.moves, { from: photo.room, to }] } : photo));
  }

  function choose(nextScreen: Screen, nextView: string) {
    // Leaving "No signal" stands for the signal coming back: what waited on the phone is now sent.
    if (offline && !(nextScreen === "Walk" && nextView === "No signal")) {
      setNotes(rows => rows.map(note => ({ ...note, status: "saved" })));
      setPhotos(rows => rows.map(photo => ({ ...photo, status: "saved" })));
    }
    if (nextScreen === "Walk" && nextView === "No signal" && !notes.some(note => note.id === offlineNoteId)) {
      setNotes(rows => [...rows, { id: offlineNoteId, room, text: "Customer wants the tiles to stop short of the window sill.", status: "pending" }]);
    }
    if (nextScreen === "Check the walk" && nextView === "After a move") {
      const misfiled = photos.find(photo => photo.id === "p2");
      if (misfiled && !misfiled.moves.length) movePhoto("p2", "Kitchen");
    }
    setScreen(nextScreen);
    setView(nextView);
  }

  function takePhoto() {
    const next = count + 1;
    const order = Math.max(0, ...photos.map(photo => photo.order ?? 0)) + 1;
    setCount(next);
    setPhotos(rows => [...rows, { id: `new-${next}`, ...nextPhoto[room], label: `${nextPhoto[room].label} (${next})`, room, original: room, order, status, moves: [] }]);
  }

  return <Shell workspace={null} title={job.title} subtitle={job.site} active="jobs" staticChrome>
    <nav className="job-tabs" aria-label="Job sections">
      <button type="button" disabled>Jobs</button>
      <button type="button" className="active" aria-current="page" disabled>New</button>
    </nav>
    <Head kicker="JOBS / NEW" title="Walk mock-up" text="Fictional job · Changes only last in this preview. No camera, microphone or upload is used."/>
    <nav className="job-tabs" aria-label="Walk screens">
      {screens.map(name => <button key={name} type="button" className={name === screen ? "active" : ""} aria-current={name === screen ? "page" : undefined}
        onClick={() => choose(name, "Example")}>{name}</button>)}
    </nav>
    <div className="form"><label>Preview state<select value={view} onChange={event => choose(screen, states[screen].find(state => state === event.target.value) ?? "Example")}>
      {states[screen].map(state => <option key={state}>{state}</option>)}
    </select></label></div>
    <div className="divider"/>
    {view === "Empty"
      ? <Card title={screen}>{screen === "Walk"
        ? <Empty title="No rooms yet" text="Rooms appear here once the walk starts. Nothing has been recorded for this job."/>
        : <Empty title="No walk to check yet" text="Do the walk first. Imported photos will wait here for a room."/>}</Card>
      : view === "Problem"
        ? <div role="alert"><Note tone="warning"><strong>{screen} could not open.</strong> Nothing you saved has changed. Choose Example to try again.</Note></div>
        : screen === "Walk"
          ? <Walk notes={notes} photos={photos} room={room} setRoom={setRoom} offline={offline}
              micRefused={view === "Microphone refused"} cameraRefused={view === "Camera refused"}
              addNote={text => setNotes(rows => [...rows, { id: `note-${rows.length + 1}`, room, text, status }])}
              takePhoto={takePhoto} finish={() => choose("Check the walk", "Example")} drafts={drafts} setDrafts={setDrafts}/>
          : <CheckWalk notes={notes} photos={photos} move={movePhoto} confirmed={confirmed} confirm={() => setConfirmed(true)}
              keep={id => setPhotos(rows => rows.map(photo => photo.id === id ? { ...photo, unclear: undefined } : photo))}/>}
  </Shell>;
}
