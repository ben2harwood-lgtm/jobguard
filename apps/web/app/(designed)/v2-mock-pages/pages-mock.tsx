"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Card, Empty, Head, Note, Shell, Tag } from "../designed-ui";
import {
  blockedReasons, briefs, builder, customer, firm, job, jobPhotos, photos as fixturePhotos, questions, rams as fixtureRams, ramsWording,
  tilerTasks, update as fixtureUpdate, week, type BriefTask, type Photo, type RamsSection, type UpdateSection,
} from "./fixture";

const screens = ["Friday update", "Reply page", "RAMS draft", "My brief"] as const;
type Screen = (typeof screens)[number];
const states: Record<Screen, readonly string[]> = {
  "Friday update": ["Example", "Customer message", "Empty", "Problem"],
  "Reply page": ["Example", "Merchant question", "Already answered", "Question changed", "Link expired", "Empty", "Problem"],
  "RAMS draft": ["Example", "Signed", "Empty", "Problem"],
  "My brief": ["Example", "Blocked", "Changed", "No signal", "Empty", "Problem"],
};
// Pages opened by link (customer, merchant, trade) have no JobGuard menus and no sign-in.
const byLink = (screen: Screen, view: string) => screen === "Reply page" || screen === "My brief" || (screen === "Friday update" && view === "Customer message");

function Controls({ screen, view, choose }: { screen: Screen; view: string; choose: (screen: Screen, view: string) => void }) {
  return <>
    <nav className="job-tabs" aria-label="Mock-up pages">
      {screens.map(name => <button key={name} type="button" className={name === screen ? "active" : ""} aria-current={name === screen ? "page" : undefined}
        onClick={() => choose(name, "Example")}>{name}</button>)}
    </nav>
    <div className="form"><label>Preview state<select value={view} onChange={event => choose(screen, states[screen].find(state => state === event.target.value) ?? "Example")}>
      {states[screen].map(state => <option key={state}>{state}</option>)}
    </select></label></div>
    <div className="divider"/>
  </>;
}

function LinkPage({ controls, kicker, title, text, children }: { controls: ReactNode; kicker: string; title: string; text: string; children: ReactNode }) {
  return <div className="rr-app rr-is-inner" data-persona="link">
    <main className="content" id="main">
      <div className="rr-inner-content">
        {controls}
        <Head kicker={kicker} title={title} text={text}/>
        {children}
      </div>
    </main>
  </div>;
}

function Problem({ children }: { children: ReactNode }) {
  return <div role="alert"><Note tone="warning">{children}</Note></div>;
}

function PhotoCard({ photo, children }: { photo: Photo; children?: ReactNode }) {
  return <article className="photo-card" aria-label={photo.label}>
    <img src={photo.src} alt={photo.label}/>
    <div className="photo-copy"><strong>{photo.label}</strong>{children}</div>
  </article>;
}

function Lines({ lines, empty }: { lines: string[]; empty: string }) {
  return lines.length ? <ul className="card-body">{lines.map(line => <li key={line}><p>{line}</p></li>)}</ul> : <p className="card-body">{empty}</p>;
}

function EditLines({ label, lines, save, cancel }: { label: string; lines: string[]; save: (lines: string[]) => void; cancel: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save(String(new FormData(event.currentTarget).get("lines")).split("\n").map(line => line.trim()).filter(Boolean));
  }
  return <form className="card-body form" onSubmit={submit}>
    <label>{label}<textarea name="lines" defaultValue={lines.join("\n")}/></label>
    <small>One line per item. Leave it empty to show the section’s empty wording.</small>
    <div className="form-actions"><button type="button" className="btn" onClick={cancel}>Cancel</button><button className="btn primary">Save in preview</button></div>
  </form>;
}

// ---------- K3 Friday update ----------

type Sent = { version: number; sentVersion: number | null };

function UpdateSections({ sections, photos }: { sections: UpdateSection[]; photos: Photo[] }) {
  const [done, ...rest] = sections;
  const visible = photos.filter(photo => photo.customerVisible);
  return <>
    {done && <Card title={done.title}><Lines lines={done.lines} empty={done.empty}/></Card>}
    <Card title="Photos">
      {visible.length ? visible.map(photo => <PhotoCard key={photo.id} photo={photo}/>) : <p className="card-body">No photos this week.</p>}
    </Card>
    {rest.map(section => <Card key={section.key} title={section.title}><Lines lines={section.lines} empty={section.empty}/></Card>)}
  </>;
}

function FridayUpdate({ sections, setSections, photos, setPhotos, sent, setSent, preview }: {
  sections: UpdateSection[]; setSections: (rows: UpdateSection[]) => void; photos: Photo[]; setPhotos: (rows: Photo[]) => void;
  sent: Sent; setSent: (sent: Sent) => void; preview: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const isSent = sent.sentVersion === sent.version;
  const changed = () => { if (isSent) setSent({ ...sent, version: sent.version + 1 }); };
  const visible = photos.filter(photo => photo.customerVisible);

  return <div className="form">
    <Card title="Friday update" sub={`${week} · to ${customer}`}
      action={isSent ? <Tag tone="green">Sent in preview · version {sent.version}</Tag> : <Tag tone="amber">Not sent · version {sent.version}</Tag>}>
      <div className="card-body form">
        <div role="status"><Note>Built from the job diary, the plan, your open questions and photos marked customer-visible. <strong>No prices, private notes or hidden checks are included.</strong></Note></div>
        <p>Nothing is sent until you press Send. Practice workspace: it goes to the practice inbox only, never to a real customer.</p>
        <div className="form-actions">
          <button type="button" className="btn" onClick={preview}>Preview as the customer sees it</button>
          <button type="button" className="btn primary" disabled={isSent} onClick={() => setSent({ ...sent, sentVersion: sent.version })}>Send update</button>
        </div>
        {isSent && <div role="status"><Note><strong>Version {sent.version} sent in this preview.</strong> Mock only. Nothing left this page. Sending the same version again adds nothing; an edit makes a new version.</Note></div>}
      </div>
    </Card>
    {sections.map(section => <Card key={section.key} title={section.title}
      action={editing === section.key ? undefined : <button type="button" className="btn small" aria-label={`Edit ${section.title}`} onClick={() => setEditing(section.key)}>Edit</button>}>
      {editing === section.key
        ? <EditLines label={section.title} lines={section.lines} cancel={() => setEditing(null)}
            save={lines => { setSections(sections.map(row => row.key === section.key ? { ...row, lines } : row)); setEditing(null); changed(); }}/>
        : <Lines lines={section.lines} empty={section.empty}/>}
      {section.key === "decisions" && <p className="card-body">From your open questions for the customer. Each one links to a reply page.</p>}
      {section.key === "buy" && <p className="card-body">Customer-supplied items from the buying list, with the date they are needed on site.</p>}
    </Card>)}
    <Card title="Photos in this update" sub="Only photos marked customer-visible. Private photos are never included.">
      {visible.length ? visible.map(photo => <PhotoCard key={photo.id} photo={photo}>
        <div className="job-caption"><Tag tone="blue">Customer-visible</Tag></div>
        <div className="form-actions"><button type="button" className="btn small" aria-label={`Hide ${photo.label} from the customer`}
          onClick={() => { setPhotos(photos.map(row => row.id === photo.id ? { ...row, customerVisible: false } : row)); changed(); }}>Hide from customer</button></div>
      </PhotoCard>) : <p className="card-body">No customer-visible photos this week. The update says “No photos this week”.</p>}
      <p className="card-body">Photos are checked again at the moment you send, so a photo you hide is left out even after the update was prepared.</p>
    </Card>
  </div>;
}

function CustomerMessage({ sections, photos }: { sections: UpdateSection[]; photos: Photo[] }) {
  return <div className="form">
    <Card title="Your Friday update" sub={`${firm} · 24 Rowan Close · ${week}`}>
      <p className="card-body">Hello Alex, here is this week’s update on your kitchen splashback and hall.</p>
    </Card>
    <UpdateSections sections={sections} photos={photos}/>
    <p className="card-body">Questions? Reply to this message or call {firm}.</p>
  </div>;
}

// ---------- E2 reply page ----------

type Kind = "customer" | "merchant";

function ReplyPage({ kind, mode, answers, answer }: {
  kind: Kind; mode: "open" | "answered" | "changed"; answers: Partial<Record<Kind, string>>; answer: (kind: Kind, choice: string) => void;
}) {
  const question = questions[kind];
  const [choice, setChoice] = useState("");
  const [sentNow, setSentNow] = useState(false);
  const recorded = answers[kind];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!choice) return;
    answer(kind, choice);
    setSentNow(true);
  }

  return <Card title={question.text} sub={question.by}>
    <div className="card-body form">
      {mode === "answered" || (mode === "open" && recorded && !sentNow)
        ? <div role="status"><Note><strong>Already answered.</strong> You chose “{recorded ?? question.options[1]}” on Tue 24 Nov. Nothing more is needed. To change your answer, contact {question.asker}.</Note></div>
        : sentNow
          ? <div role="status"><Note><strong>Answer sent in this preview.</strong> You chose “{recorded}”. {mode === "changed"
              ? `The builder changed this question after sending the link, so ${question.asker} will check your answer before using it.`
              : "Thank you. You can close this page."} Mock only. Nothing was recorded.</Note></div>
          : <form className="form" onSubmit={submit}>
            {mode === "changed" && <div role="status"><Note tone="warning"><strong>This question has changed since the link was sent.</strong> You can still answer. Your answer is kept and the builder checks it before using it.</Note></div>}
            <fieldset className="form">
              <legend>Choose one answer</legend>
              {question.options.map(option => <label key={option} className="checkrow">
                <input type="radio" name="answer" value={option} checked={choice === option} onChange={() => setChoice(option)}/>{option}
              </label>)}
            </fieldset>
            <div className="form-actions"><button className="btn primary" disabled={!choice}>Send answer</button></div>
            <small>Your answer goes only to {question.asker}, for this question only. You can answer once.</small>
          </form>}
    </div>
  </Card>;
}

// ---------- K9 RAMS draft ----------

type Rams = { version: number; sections: RamsSection[]; edited: string[]; completed: Record<string, string>; signedBy: string | null;
  history: { version: number; signedBy: string }[]; clash: string | null };

function RamsDraft({ rams, setRams }: { rams: Rams; setRams: (rams: Rams) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [checked, setChecked] = useState(false);
  const signed = rams.signedBy !== null;
  const missing = rams.sections.flatMap(section => section.toComplete ?? []).filter(field => !rams.completed[field]?.trim());
  const canSign = !signed && !missing.length && name.trim() !== "" && checked;

  function sign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSign) return;
    setRams({ ...rams, signedBy: name.trim() });
  }

  function planChange() {
    // A later plan change makes a new draft; the signed version stays as it was, read-only.
    setRams({ ...rams, version: rams.version + 1, signedBy: null, history: [...rams.history, { version: rams.version, signedBy: rams.signedBy ?? "" }],
      clash: "The plan changed: grouting moved to Wed 2 Dec. Check this section." });
    setName(""); setChecked(false);
  }

  return <div className="form">
    <div role="note"><Note tone="warning"><strong>{ramsWording}</strong></Note></div>
    <Card title="Risk assessment, method statement and construction phase plan" sub={`${job.title} · ${job.site}`}
      action={signed ? <Tag tone="green">Signed · version {rams.version}</Tag> : <Tag tone="amber">Draft · version {rams.version}</Tag>}>
      <div className="card-body form">
        <p>Filled from the job’s scope, its template and the plan. No prices. JobGuard does not check or certify it: you do.</p>
        <div className="form-actions"><button type="button" className="btn" onClick={() => window.print()}>Print</button>
          {signed && <button type="button" className="btn" onClick={planChange}>Preview a plan change</button>}</div>
        {signed && <div role="status"><Note><strong>Signed by {rams.signedBy} in this preview.</strong> This version is read-only. A change makes a new draft version.</Note></div>}
      </div>
    </Card>
    {rams.history.map(row => <div role="status" key={row.version}><Note>Version {row.version}, signed by {row.signedBy}, is kept unchanged and read-only.</Note></div>)}
    {rams.sections.map(section => <Card key={section.key} title={section.title}
      action={signed || editing === section.key ? undefined : <button type="button" className="btn small" aria-label={`Edit ${section.title}`} onClick={() => setEditing(section.key)}>Edit</button>}>
      {(rams.edited.includes(section.key) || (rams.clash && section.key === "sequence")) && <div className="card-body job-caption">
        {rams.edited.includes(section.key) && <Tag tone="blue">Your edit</Tag>}
        {rams.clash && section.key === "sequence" && <Tag tone="amber">Check: plan changed</Tag>}
      </div>}
      {rams.clash && section.key === "sequence" && <p className="card-body">{rams.clash}</p>}
      {editing === section.key
        ? <EditLines label={section.title} lines={section.lines} cancel={() => setEditing(null)}
            save={lines => { setRams({ ...rams, sections: rams.sections.map(row => row.key === section.key ? { ...row, lines } : row),
              edited: [...new Set([...rams.edited, section.key])] }); setEditing(null); }}/>
        : <Lines lines={section.lines} empty="Nothing in this section yet."/>}
      {section.toComplete && <div className="card-body form">
        {section.toComplete.map(field => <label key={field}>{field}
          {!rams.completed[field]?.trim() && <Tag tone="amber">To complete</Tag>}
          <input value={rams.completed[field] ?? ""} readOnly={signed} onChange={event => setRams({ ...rams, completed: { ...rams.completed, [field]: event.target.value } })}/>
        </label>)}
      </div>}
    </Card>)}
    {!signed && <Card title="Check and sign" sub="Only you can sign. Signing makes this version read-only.">
      <form className="card-body form" onSubmit={sign}>
        <label>Your name<input value={name} onChange={event => setName(event.target.value)}/></label>
        <label className="checkrow"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)}/>I have checked every section and completed what was missing.</label>
        {missing.length > 0 && <p>Complete {missing.join(" and ")} before you sign.</p>}
        <div className="form-actions"><button className="btn primary" disabled={!canSign}>Sign this version</button></div>
      </form>
    </Card>}
  </div>;
}

// ---------- F1 My brief ----------

type Kind3 = "Done" | "Blocked" | "Changed";
type Progress = { id: string; task: string; kind: Kind3; note: string; photos: string[] };

function TaskCard({ task, progress, record, offline, open }: {
  task: BriefTask; progress: Progress[]; record: (row: Omit<Progress, "id">) => void; offline: boolean; open: Kind3 | null;
}) {
  const [form, setForm] = useState<Kind3 | null>(open);
  const [slots, setSlots] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const done = progress.some(row => row.task === task.id && row.kind === "Done");
  const reset = () => { setForm(null); setReason(""); setNote(""); };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form === "Blocked" && reason) record({ task: task.id, kind: "Blocked", note: [reason, note.trim()].filter(Boolean).join(" · "), photos: [] });
    if (form === "Changed" && note.trim()) record({ task: task.id, kind: "Changed", note: note.trim(), photos: [] });
    reset();
  }

  return <Card title={task.name} sub={task.day} action={done ? <Tag tone="green">Done</Tag> : undefined}>
    <div className="card-body form">
      <p><strong>Proof photos needed</strong> · attach a photo already on the job. The camera comes later.</p>
      {task.proof.map(slot => {
        const photo = jobPhotos.find(row => row.id === slots[slot]);
        return <div key={slot}>
          {photo ? <PhotoCard photo={photo}><p>{slot} · reference to job photo {photo.id}</p></PhotoCard>
            : <label>{`${slot} photo`}<select disabled={done} value="" onChange={event => setSlots(rows => ({ ...rows, [slot]: event.target.value }))}>
              <option value="">No photo yet</option>{jobPhotos.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
            </select></label>}
        </div>;
      })}
      {!done && form === null && <div className="form-actions">
        <button type="button" className="btn" disabled={offline} onClick={() => setForm("Blocked")}>Blocked</button>
        <button type="button" className="btn" disabled={offline} onClick={() => setForm("Changed")}>Changed</button>
        <button type="button" className="btn primary" disabled={offline}
          onClick={() => record({ task: task.id, kind: "Done", note: "", photos: task.proof.map(slot => slots[slot]).filter((id): id is string => Boolean(id)) })}>Done</button>
      </div>}
      {form === "Blocked" && <form className="form" onSubmit={submit} aria-label={`Blocked: ${task.name}`}>
        <label>Why is it blocked?<select value={reason} onChange={event => setReason(event.target.value)}>
          <option value="">Choose a reason</option>{blockedReasons.map(row => <option key={row}>{row}</option>)}
        </select></label>
        <label>What would unblock it? (optional)<textarea value={note} onChange={event => setNote(event.target.value)}/></label>
        <div className="form-actions"><button type="button" className="btn" onClick={reset}>Cancel</button><button className="btn primary" disabled={!reason}>Send blocked</button></div>
      </form>}
      {form === "Changed" && <form className="form" onSubmit={submit} aria-label={`Changed: ${task.name}`}>
        <label>What changed on site?<textarea value={note} onChange={event => setNote(event.target.value)}/></label>
        <div role="status"><Note>Recorded only. This does not change the scope, the price or any order. The builder decides what happens next.</Note></div>
        <div className="form-actions"><button type="button" className="btn" onClick={reset}>Cancel</button><button className="btn primary" disabled={!note.trim()}>Send change note</button></div>
      </form>}
    </div>
  </Card>;
}

function MyBrief({ view, progress, setProgress }: { view: string; progress: Progress[]; setProgress: (update: (rows: Progress[]) => Progress[]) => void }) {
  const brief = briefs[0]!;
  const offline = view === "No signal";
  const open: Kind3 | null = view === "Blocked" ? "Blocked" : view === "Changed" ? "Changed" : null;
  const label = (row: Progress) => tilerTasks.find(task => task.id === row.task)?.name ?? "";
  return <div className="form">
    {offline && <div role="status"><Note tone="warning"><strong>No signal.</strong> Done, Blocked and Changed need signal. Nothing has been sent from this page.</Note></div>}
    <Card title={`${brief.trade} · ${brief.area}`} sub={brief.when}>
      <div className="card-body">
        <p><strong>What to do</strong> · {brief.work}</p>
        <p><strong>Access</strong> · {brief.access}</p>
        <p><strong>Proof needed</strong> · {brief.proof}</p>
      </div>
    </Card>
    {tilerTasks.map(task => <TaskCard key={`${view}-${task.id}`} task={task} progress={progress} offline={offline} open={task.id === "t1" ? open : null}
      record={row => setProgress(rows => [...rows, { ...row, id: `u${rows.length + 1}` }])}/>)}
    <Card title="Your updates" sub="Each one is written to the job diary for the builder.">
      {progress.length ? progress.map(row => <article className="card-body" key={row.id} aria-label={`${row.kind}: ${label(row)}`}>
        <div className="job-caption"><Tag tone={row.kind === "Done" ? "green" : row.kind === "Blocked" ? "amber" : "blue"}>{row.kind}</Tag><Tag tone="green">Sent in preview</Tag></div>
        <p>{label(row)}{row.note && ` · ${row.note}`}</p>
        {row.photos.length > 0 && <p>Proof: {row.photos.map(id => `job photo ${id}`).join(", ")}</p>}
      </article>) : <p className="card-body">No updates yet. Press Done, Blocked or Changed on a task.</p>}
    </Card>
  </div>;
}

// ---------- the mock ----------

const freshRams = (): Rams => ({ version: 1, sections: fixtureRams, edited: [], completed: {}, signedBy: null, history: [], clash: null });

export function PagesMock() {
  const [screen, setScreen] = useState<Screen>("Friday update");
  const [view, setView] = useState("Example");
  const [sections, setSections] = useState(fixtureUpdate);
  const [photos, setPhotos] = useState(fixturePhotos);
  const [sent, setSent] = useState<Sent>({ version: 1, sentVersion: null });
  const [answers, setAnswers] = useState<Partial<Record<Kind, string>>>({});
  const [rams, setRams] = useState<Rams>(freshRams);
  const [progress, setProgress] = useState<Progress[]>([]);

  function choose(nextScreen: Screen, nextView: string) {
    if (nextScreen === "RAMS draft" && nextView === "Signed" && rams.signedBy === null) {
      setRams({ ...rams, completed: { "Nearest A&E": "Rowan General Hospital (fictional)", "First aider on site": "Jordan Hale", ...rams.completed }, signedBy: builder.replace(" (fictional builder)", "") });
    }
    setScreen(nextScreen);
    setView(nextView);
  }

  const controls = <Controls screen={screen} view={view} choose={choose}/>;

  if (byLink(screen, view)) {
    if (screen === "Friday update") return <LinkPage controls={controls} kicker="MESSAGE TO THE CUSTOMER" title="Friday update"
      text="As the customer sees it. Fictional job · mock only, nothing is sent."><CustomerMessage sections={sections} photos={photos}/></LinkPage>;
    if (screen === "Reply page") {
      const kind: Kind = view === "Merchant question" ? "merchant" : "customer";
      const question = questions[kind];
      return <LinkPage controls={controls} kicker="QUESTION BY LINK · NO SIGN-IN" title="One question about 24 Rowan Close"
        text={`From ${question.asker} to ${question.who}. This link answers this one question only.`}>
        {view === "Empty" ? <Card title="Reply page"><Empty title="No question here" text="This link has no open question. Nothing needs your answer."/></Card>
          : view === "Problem" ? <Problem><strong>This page could not open.</strong> No answer has been sent. Try the link again later.</Problem>
          : view === "Link expired" ? <Problem><strong>This link has expired or was cancelled.</strong> Nothing was recorded. If you still want to answer, contact {question.asker}.</Problem>
          : <ReplyPage key={view} kind={kind} mode={view === "Already answered" ? "answered" : view === "Question changed" ? "changed" : "open"}
              answers={answers} answer={(who, choice) => setAnswers(rows => ({ ...rows, [who]: choice }))}/>}
      </LinkPage>;
    }
    return <LinkPage controls={controls} kicker="MY BRIEF · BY LINK" title="Your brief for 24 Rowan Close"
      text={`For the tiler only, from ${firm}. Today and tomorrow. No prices.`}>
      {view === "Empty" ? <Card title="My brief"><Empty title="No work for you yet" text="Nothing is planned for you today or tomorrow. The builder will send a new link when it is."/></Card>
        : view === "Problem" ? <Problem><strong>Your brief could not open.</strong> Nothing you sent has changed. Try the link again later.</Problem>
        : <MyBrief view={view} progress={progress} setProgress={setProgress}/>}
    </LinkPage>;
  }

  return <Shell workspace={null} title={job.title} subtitle={job.site} active="jobs" staticChrome>
    <nav className="job-tabs" aria-label="Job sections">
      <button type="button" disabled>Overview</button>
      <button type="button" disabled>Work</button>
      <button type="button" disabled>Money</button>
      <button type="button" className="active" aria-current="page" disabled>Records</button>
    </nav>
    <Head kicker={screen === "RAMS draft" ? "RECORDS / SAFETY" : "RECORDS / CUSTOMER UPDATES"} title="New pages mock-up"
      text="Fictional job · Changes only last in this preview. Nothing is sent, saved or printed for real."/>
    {controls}
    {view === "Empty"
      ? <Card title={screen}>{screen === "Friday update"
        ? <Empty title="No update to prepare yet" text="Nothing was recorded this week. Add a diary entry or finish a task, then prepare the update."/>
        : <Empty title="No RAMS draft yet" text="Plan the job’s tasks first. The draft is filled from your plan."/>}</Card>
      : view === "Problem"
        ? <Problem><strong>{screen} could not open.</strong> Nothing has been sent or changed. Choose Example to try again.</Problem>
        : screen === "Friday update"
          ? <FridayUpdate sections={sections} setSections={setSections} photos={photos} setPhotos={setPhotos} sent={sent} setSent={setSent}
              preview={() => choose("Friday update", "Customer message")}/>
          : <RamsDraft rams={rams} setRams={setRams}/>}
  </Shell>;
}
