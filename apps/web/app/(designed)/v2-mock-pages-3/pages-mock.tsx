"use client";

import { useState, type ReactNode } from "react";
import { Card, Head, Note, Shell, Tag } from "../designed-ui";
import {
  certificates, crew, crewText, daywork, emptyCopy, firm, fridayText, job, locations,
  packContent, packSections, practice, screens, site, states, type PackSection, type Screen,
} from "./fixture";

function Action({ children, onClick, disabled = false }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="btn" style={{ minWidth: 44, minHeight: 44 }} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Status({ children }: { children: ReactNode }) {
  return <div role="status"><Note>{children}</Note></div>;
}
function Photo({ src, label }: { src: string; label: string }) {
  return <figure className="card-body"><img src={src} alt={label} style={{ width: "100%", maxWidth: 420, borderRadius: 8 }}/><figcaption>{label} · illustrative fixture, not verified proof</figcaption></figure>;
}

function Tomorrow() {
  const [applied, setApplied] = useState(false);
  const [reminder, setReminder] = useState(false);
  const [atSix, setAtSix] = useState(true);
  return <>
    <Card title="Tue 1 Dec" sub="Tomorrow’s work · 24 Rowan Close">
      <div className="card-body form">
        <h3>Ready</h3><p>Paint hall walls and woodwork · Sam, Decorator · materials on site; preparation complete.</p>
        <h3>Blocked</h3><p>Tile the splashback · tiles now forecast for Thursday. Unblock: confirm all six packs have landed before arranging tiling.</p>
        <h3>Waiting for an answer</h3><p>Grout finish · Alex · decide by 30 Nov. No answer recorded yet.</p>
        <Action disabled={reminder} onClick={() => setReminder(true)}>Send a reminder</Action>
        {reminder && <Status>Reminder previewed for the local test inbox. Nothing was sent.</Status>}
      </div>
    </Card>
    <Card title="Proposed swap" sub="Use the day for the hall while the tiles are delayed.">
      <div className="card-body form"><p>Move hall painting from Wednesday to Tuesday. Sam is qualified and free for the full day; paint is on site. Access still needs confirming.</p>
        <Action disabled={applied} onClick={() => setApplied(true)}>Apply the swap</Action>
        {applied && <Status>Swap applied in this preview only. Access request pending; nobody has been told.</Status>}
        <h3>Still to tell</h3><p>Alex · ask for Tuesday hall access. Sam · revised hall brief. Lee · wait for a confirmed tiling day.</p>
      </div>
    </Card>
    <Card title="6pm crew list" sub="Practice: goes to the local test inbox">
      <div className="card-body form"><label style={{ minHeight: 44, display: "flex", flexDirection: "row", alignItems: "center", gap: 12 }}><input type="checkbox" style={{ width: 44, height: 44, flex: "0 0 44px" }} checked={atSix} onChange={event => setAtSix(event.target.checked)}/>Send at 6pm</label>
        <p>This is a preview setting; no schedule is created.</p></div>
      {crew.map(person => <article className="card-body" data-testid="crew-card" key={person.name}>
        <h3>{person.name}</h3><p>{person.task}</p><p>{site} · {person.when}</p><p>{person.access}</p>
        <p>Proof needed: {person.proof}</p><Photo src={person.photo} label={`Illustrative ${person.name.includes("Decorator") ? "hall" : "kitchen"} photo`}/>
        <Tag tone="amber">{applied ? "Revised list pending confirmation" : "Preview · not sent"}</Tag>
      </article>)}
    </Card>
  </>;
}

function Choices({ decided }: { decided: boolean }) {
  const [choice, setChoice] = useState("");
  const [sent, setSent] = useState(decided);
  const [grout, setGrout] = useState(decided);
  return <>
    <Card title="Choose the splashback tiles" sub="Decide by 30 Nov · allowance £120.00">
      <div className="card-body form">
        {sent ? <Status>{decided ? "Decided: white ceramic tiles within the allowance." : choice === "sage" ? "£35.00 over your allowance, sent to the builder as a change to approve. This is pending and is not a committed price." : "White ceramic tiles chosen in this preview, within your allowance."}</Status> : <>
          <label>Tile finish<select style={{ minHeight: 44 }} value={choice} onChange={event => setChoice(event.target.value)}><option value="">Choose a finish</option><option value="white">White ceramic · within £120.00 allowance</option><option value="sage">Sage ceramic · £155.00 · £35.00 over allowance</option></select></label>
          {choice === "sage" && <Note tone="warning">£35.00 over your allowance. Your choice asks the builder to prepare a change; it does not agree a new price.</Note>}
          <Action disabled={!choice} onClick={() => setSent(true)}>Choose tiles</Action>
        </>}
      </div>
    </Card>
    <Card title="Choose the grout finish" sub="Decide by 1 Dec · included in the tile allowance">
      <div className="card-body form">{grout ? <Status>Decided: light grey grout in this preview.</Status> : <><p>Light grey grout · no change to the allowance.</p><Action onClick={() => setGrout(true)}>Choose light grey grout</Action></>}</div>
    </Card>
  </>;
}

function Daywork({ view }: { view: string }) {
  const [asked, setAsked] = useState(false);
  const [changed, setChanged] = useState(view === "Changed after sending");
  const agreed = view === "Agreed" && !changed;
  return <Card title={daywork.title} sub={`${daywork.date} · daywork sheet · version ${changed ? "2" : "1"}`}>
    <div className="card-body form">
      <h3>People and hours</h3>{daywork.people.map(line => <p key={line}>{line}</p>)}
      {changed && <p>Jordan · additional 1.00 hour × £30.00 = £30.00</p>}
      <h3>Materials used</h3>{daywork.materials.map(line => <p key={line}>{line}</p>)}
      <p><strong>Sheet total (net): £{changed ? daywork.changedTotal : daywork.total}</strong></p>
      <p>Fictional firm rates. Unsigned sheets add nothing to the agreed job price.</p>
      {agreed ? <Status>Agreed · Alex · 30 Nov, 17:00 · exact version 1. Fixture example only.</Status> : <Tag tone="amber">{asked ? "Awaiting customer agreement · preview" : "Not agreed"}</Tag>}
      {changed && <div role="alert"><Note tone="warning">Changed after sending. The old link no longer works. Version 1 remains unchanged; version 2 needs a fresh agreement.</Note></div>}
      <div className="form-actions" style={{ flexWrap: "wrap" }}>
        <Action disabled={agreed || asked} onClick={() => setAsked(true)}>Ask the customer to agree by link</Action>
        <Action disabled={changed} onClick={() => { setChanged(true); setAsked(false); }}>Preview an edit after sending</Action>
      </div>
      {asked && <Status>Link prepared in this preview for the local test inbox only. Nothing sent; no customer agreement recorded.</Status>}
    </div>
  </Card>;
}

function Certificates() {
  const [rows, setRows] = useState(certificates);
  const change = (key: string, patch: { status?: string; reason?: string }) => setRows(rows.map(row => row.key === key ? { ...row, ...patch } : row));
  const missing = rows.some(row => row.status === "Still needed" || (row.status === "Not needed" && !row.reason.trim()));
  return <Card title="Certificates checklist" sub="Splashback and hall decorating · builder records only">
    <div className="card-body"><Note tone={missing ? "warning" : ""}>{missing ? "Not ready for handover: certificates are still needed or have no reason for being left out." : "Checklist complete in this preview. This does not certify the work."}</Note></div>
    {rows.map(row => <article className="card-body form" key={row.key}><h3>{row.label}</h3><p>{row.when}</p><p>Issued or supplied by: {row.issuer}</p>
      <label>{row.label} status<select aria-label={`${row.label} status`} style={{ minHeight: 44 }} value={row.status} onChange={event => change(row.key, { status: event.target.value })}><option>Got it</option><option>Not needed</option><option>Still needed</option></select></label>
      {row.status === "Not needed" && <><label>Why is {row.label} not needed?<input style={{ minHeight: 44 }} maxLength={200} value={row.reason} onChange={event => change(row.key, { reason: event.target.value })}/></label>
        {!row.reason.trim() && <p role="alert">Give a reason before this can count as not needed.</p>}</>}
    </article>)}
    <p className="card-body">Preview only · changes reset on reload. JobGuard does not issue these certificates.</p>
  </Card>;
}

function Share({ fallback }: { fallback: boolean }) {
  const [open, setOpen] = useState<string | null>(fallback ? "Friday update" : null);
  const [result, setResult] = useState("");
  return <>{[{ title: "Friday update", text: fridayText, sub: "Sent to the local test inbox · version 1" }, { title: "Crew brief", text: crewText, sub: "Sam · Decorator · version 2" }].map(item => <Card title={item.title} sub={item.sub} key={item.title}>
    <div className="card-body form"><p style={{ whiteSpace: "pre-line" }}>{item.text}</p>
      <Action onClick={() => { setOpen(item.title); setResult(""); }}>Share</Action>
      {open === item.title && <div className="form" role="region" aria-label={`Share ${item.title}`}>
        <p>{fallback ? "This phone cannot share. Use Copy text or Open WhatsApp." : "Preview the exact text, then choose how to share it."}</p>
        <blockquote style={{ whiteSpace: "pre-line" }} data-testid="share-text">{item.text}</blockquote>
        <div className="form-actions" style={{ flexWrap: "wrap" }}>
          <Action onClick={() => setResult("Copy text previewed. The practice notice stays in the text; nothing copied to your clipboard.")}>Copy text</Action>
          <Action onClick={() => setResult("Open WhatsApp previewed. The practice notice stays in the text; no app opened and nothing sent.")}>Open WhatsApp</Action>
        </div><p>No phone share sheet or external app opens in this mock-up.</p>{result && <Status>{result}</Status>}
      </div>}
    </div>
  </Card>)}</>;
}

function Snags() {
  const [added, setAdded] = useState(false);
  const [fixed, setFixed] = useState(false);
  const [checker, setChecker] = useState("");
  const [checked, setChecked] = useState(false);
  return <>
    <Card title="Refit the hall door stop" sub="Owner: Jordan · due 4 Dec">
      <Photo src="/design/assets/renovation-room.jpg" label="Hall door stop snag"/>
      <div className="card-body form"><Tag tone={fixed ? "green" : "amber"}>Fixed: {fixed ? "Jordan · in preview" : "No"}</Tag><Tag tone={checked ? "green" : "amber"}>Checked: {checked ? "Sam · second person · in preview" : "No"}</Tag>
        <Action disabled={fixed} onClick={() => setFixed(true)}>Mark fixed</Action>
        <label>Checked by a second person<select style={{ minHeight: 44 }} disabled={checked} value={checker} onChange={event => setChecker(event.target.value)}><option value="">Choose who checked</option><option value="Jordan">Jordan · fixed this snag</option><option value="Sam">Sam · second person</option></select></label>
        {checker === "Jordan" && <p role="alert">Choose someone other than the person who fixed it.</p>}
        <Action disabled={!fixed || checker !== "Sam" || checked} onClick={() => setChecked(true)}>Mark checked</Action>
        <p>Checking a snag does not approve the final account.</p>
      </div>
    </Card>
    <Card title="Record another snag"><div className="card-body form"><p>Example: touch up the hall skirting · owner Sam · due 5 Dec.</p><Action disabled={added} onClick={() => setAdded(true)}>Add a snag</Action>{added && <Status>Touch up the hall skirting added in this preview · Sam · due 5 Dec · photo still needed. Not saved to the job.</Status>}</div></Card>
  </>;
}

function Pack({ sections = [...packSections] }: { sections?: PackSection[] }) {
  return <>{sections.map(section => <Card title={section} key={section}>
    <div className="card-body">{packContent[section].map(line => <p key={line}>{line}</p>)}</div>
    {section === "Photos" && <Photo src="/design/assets/renovation-room.jpg" label="Illustrative finished hall photo"/>}
  </Card>)}</>;
}

function CustomerPack({ newer }: { newer: boolean }) {
  const [latest, setLatest] = useState(!newer);
  const [acknowledged, setAcknowledged] = useState(false);
  return <>
    {!latest && <div role="alert"><Note tone="warning">Newer version available. You are reading version 1.</Note><Action onClick={() => { setLatest(true); setAcknowledged(false); }}>Open newer version</Action></div>}
    <Card title="Your handover pack" sub={`${firm} · ${site} · version ${latest ? "2" : "1"}`}>
      <div className="card-body"><p>{job}</p><p>Receipt only: acknowledging this pack does not agree the account or sign off any snag.</p></div>
    </Card>
    <Pack/>
    <div className="form-actions"><Action disabled={acknowledged} onClick={() => setAcknowledged(true)}>Acknowledge receipt</Action></div>
    {acknowledged && <Status>Receipt acknowledged in this preview for version {latest ? "2" : "1"}. Nothing recorded on the job.</Status>}
  </>;
}

function Handover() {
  const [included, setIncluded] = useState<PackSection[]>([...packSections]);
  const [preview, setPreview] = useState(false);
  const [released, setReleased] = useState(false);
  return <>
    <Card title="Prepare handover · version 2" sub="Site work finished · agreed outstanding items stay listed">
      <div className="card-body form"><p>Choose what goes in. No amounts go in the customer’s pack. Missing certificates are listed as missing.</p>
        {packSections.map(section => <label key={section} style={{ display: "flex", flexDirection: "row", gap: 12, alignItems: "center", minHeight: 44 }}><input type="checkbox" style={{ width: 44, height: 44, flex: "0 0 44px" }} disabled={released} checked={included.includes(section)} onChange={event => setIncluded(event.target.checked ? [...included, section] : included.filter(name => name !== section))}/>{section}</label>)}
        <div className="form-actions" style={{ flexWrap: "wrap" }}><Action onClick={() => setPreview(!preview)}>{preview ? "Close customer preview" : "Preview as the customer sees it"}</Action>
          <Action disabled={!included.length || released} onClick={() => setReleased(true)}>Release this version</Action></div>
        {released && <Status>Version 2 released in this preview for Alex. Local test inbox only; nothing sent and no acknowledgement yet.</Status>}
      </div>
    </Card>
    {preview && <section aria-label="Customer preview"><Head kicker="Customer preview" title="Your handover pack" text={`${job} · version 2`}/><Pack sections={packSections.filter(section => included.includes(section))}/></section>}
    <Card title="Version history"><div className="card-body"><p>Version 1 · released to Alex · 2 Dec · acknowledged by Alex, 2 Dec at 18:10 · fixture example.</p><p>Version 2 · {released ? "Released in preview · acknowledgement pending" : "Draft · not released"} · earlier version kept unchanged.</p><p>Acknowledgement is receipt only. Release is independent of the financial lock.</p></div></Card>
  </>;
}

function Content({ screen, view }: { screen: Screen; view: string }) {
  if (view === "Empty") return <Card title={emptyCopy[screen][0]}><p className="card-body">{emptyCopy[screen][1]}</p></Card>;
  if (view === "Problem") return <div role="alert"><Note tone="warning">This {screen.toLowerCase()} preview could not open. Nothing new was recorded or sent. Try again, or contact the builder if you opened a link.</Note></div>;
  if (view === "Link expired") return <div role="alert"><Note tone="warning">Link expired. Nothing was recorded. Ask your builder for a new link.</Note></div>;
  if (view === "Nothing for tomorrow") return <Card title="Nothing for tomorrow"><p className="card-body">No tasks scheduled for tomorrow. Check the plan before arranging the next visit. No crew lists are scheduled.</p></Card>;
  if (view === "Job type has none") return <Card title="This job type has no certificates listed"><p className="card-body">Confirm the work actually done before handover. A blank template is not evidence that a certificate is unnecessary.</p></Card>;
  switch (screen) {
    case "Tomorrow": return <Tomorrow/>;
    case "Your choices": return <Choices decided={view === "Decided"}/>;
    case "Daywork sheet": return <Daywork view={view}/>;
    case "Certificates checklist": return <Certificates/>;
    case "Share": return <Share fallback={view === "Phone cannot share"}/>;
    case "Snags": return <Snags/>;
    case "Handover": return <Handover/>;
    case "Your handover pack": return <CustomerPack newer={view === "Newer version available"}/>;
  }
}

export function PagesMock() {
  const [screen, setScreen] = useState<Screen>("Tomorrow");
  const [view, setView] = useState("Example");
  const byLink = screen === "Your choices" || screen === "Your handover pack";
  const controls = <>
    <nav className="job-tabs" aria-label="Mock-up pages">{screens.map(name => <button key={name} type="button" style={{ minWidth: 44, minHeight: 44 }} className={screen === name ? "active" : ""} aria-current={screen === name ? "page" : undefined} onClick={() => { setScreen(name); setView("Example"); }}>{name}</button>)}</nav>
    <div className="form"><label>Preview state<select value={view} style={{ minHeight: 44 }} onChange={event => setView(event.target.value)}>{states[screen].map(state => <option key={state}>{state}</option>)}</select></label></div>
    <Note><strong>{practice}</strong><p>Clickable mock-up · fictional examples only. Actions change this preview and reset on reload. Use no real details.</p></Note>
  </>;
  const content = <div className="form" style={{ overflowWrap: "anywhere" }}>
    {controls}<Head kicker={locations[screen]} title={screen} text={byLink ? `${firm} · ${job}` : job}/>
    <div key={`${screen}:${view}`} className="form" data-testid="screen-content"><Content screen={screen} view={view}/></div>
  </div>;
  return byLink ? <div className="rr-app rr-is-inner" data-persona="link"><main className="content" id="main"><div className="rr-inner-content">{content}</div></main></div>
    : <Shell workspace={null} title="Remaining screens mock-up" subtitle="V2-M3 · fixture-only preview" active={screen === "Tomorrow" ? "today" : "jobs"} staticChrome>{content}</Shell>;
}
