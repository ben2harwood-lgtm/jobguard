"use client";

import { useState, type FormEvent } from "react";
import { Card, Empty, Head, Note, Panel, Shell, Tag, shortDate } from "../designed-ui";
import { briefs, job, materials, scope, tasks, trades, type Material, type ScopeItem, type Task } from "./fixture";

const screens = ["Plan", "Measurements", "Materials", "Briefs"] as const;
type Screen = (typeof screens)[number];
const states = ["Example", "Empty", "Problem"] as const;
type ViewState = (typeof states)[number];

const empty: Record<Screen, string> = {
  Plan: "Start with the scope from a quote revision.",
  Measurements: "Add a scope item, then record its measurement.",
  Materials: "Confirm a measurement and pick a product first.",
  Briefs: "Assign a planned task to a trade first.",
};

function Plan({ tasks: rows, setTasks, stage, setStage }: {
  tasks: Task[]; setTasks: (rows: Task[]) => void; stage: string; setStage: (stage: string) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);

  function edit(event: FormEvent<HTMLFormElement>, row: Task, index: number) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const updated = {
      ...row, trade: fields.get("trade") === "Tiler" ? "Tiler" as const : "Decorator" as const,
      duration: String(fields.get("duration")).trim(), day: String(fields.get("day")).trim(),
    };
    const reordered = rows.filter((_, position) => position !== index);
    reordered.splice(Number(fields.get("position")) - 1, 0, updated);
    setTasks(reordered);
    setEditing(null);
  }

  return <Card title="Plan" sub={job.quote}>
    <div className="card-body form">
      <div role="status"><Note><strong>{stage} plan</strong>{stage === "Live" && " · Mock switch only"}</Note></div>
      <div className="field-pair">
        <label>Preview plan status<select value={stage} onChange={event => setStage(event.target.value)}>
          <option>Draft</option><option>Accepted</option><option>Live</option>
        </select></label>
        <div className="form-actions"><button type="button" className="btn primary" disabled={stage !== "Accepted"} onClick={() => setStage("Live")}>Switch live</button></div>
      </div>
    </div>
    {rows.map((row, index) => <article className="card-body" key={row.name}>
      <h3>{index + 1}. {row.name}</h3>
      <p>{row.area} · {row.trade} · {row.duration} · {row.day}</p>
      <div className="job-caption"><Tag tone={row.status === "Ready" ? "green" : "amber"}>{row.status}</Tag>
        {row.change && <Tag tone="amber">Changed since last quote revision</Tag>}
      </div>
      {row.change && <p>{row.change}</p>}
      {editing === index ? <form className="form" onSubmit={event => edit(event, row, index)}>
        <div className="field-pair">
          <label>Trade<select name="trade" defaultValue={row.trade}>{trades.map(trade => <option key={trade}>{trade}</option>)}</select></label>
          <label>Position<select name="position" defaultValue={index + 1}>{rows.map((task, position) => <option key={task.name}>{position + 1}</option>)}</select></label>
          <label>Duration<input name="duration" defaultValue={row.duration} required/></label>
          <label>Day<input name="day" defaultValue={row.day} required/></label>
        </div>
        <div className="form-actions"><button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary">Apply in preview</button></div>
      </form> : <button type="button" className="btn small" aria-label={`Edit task ${row.name}`} onClick={() => setEditing(index)}>Edit task</button>}
    </article>)}
    <div className="card-body">
      <h3>Unplanned</h3>
      <p>{scope[3]!.name} · {scope[3]!.area} · Needs a trade, duration and day</p>
    </div>
  </Card>;
}

function Measurements({ rows, update }: { rows: ScopeItem[]; update: (index: number, changes: Partial<ScopeItem>) => void }) {
  const [editing, setEditing] = useState<number | null>(null);

  function confirm(event: FormEvent<HTMLFormElement>, index: number) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    update(index, { value: String(fields.get("value")), source: "Entered by builder", confirmed: true });
    setEditing(null);
  }

  return <Card title="Measurements" sub="Confirm a quantity and choose what to use for each scope item.">
    {rows.map((row, index) => {
      const action = row.confirmed ? "Change measurement" : "Confirm measurement";
      return <article className="card-body form" key={row.name}>
        <div>
          <h3>{row.name}</h3>
          <p>{row.area} · {row.value ? `${row.value} ${row.unit}` : `No value (${row.unit})`} · {row.source}</p>
          <div className="job-caption"><Tag tone={row.confirmed ? "green" : "amber"}>{row.confirmed ? "Confirmed" : "Unconfirmed"}</Tag></div>
          {!row.confirmed && <p>{row.question}</p>}
        </div>
        {editing === index ? <form className="form" onSubmit={event => confirm(event, index)}>
          <label>Measured value ({row.unit})<input name="value" type="number" min="0.01" step="any" defaultValue={row.value} required/></label>
          <div className="form-actions"><button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary">Confirm measurement</button></div>
        </form> : <div><button type="button" className="btn small" aria-label={`${action} ${row.name}`} onClick={() => setEditing(index)}>{action}</button></div>}
        {row.products.length > 0 && <div className="form">
          <label>Product<select value={row.product} onChange={event => update(index, { product: event.target.value })}>
            {row.products.map(product => <option key={product}>{product}</option>)}
          </select></label>
          <div className="field-pair">
            <label>Pack size<select value={row.packSize} onChange={event => update(index, { packSize: event.target.value })}>{row.packSizes.map(size => <option key={size}>{size}</option>)}</select></label>
            <label>Wastage allowance<select value={row.wastage} onChange={event => update(index, { wastage: event.target.value })}><option>0%</option><option>5%</option><option>10%</option><option>15%</option></select></label>
          </div>
        </div>}
      </article>;
    })}
  </Card>;
}

function neededDate(value: string) {
  const date = shortDate(value);
  return date ? `${date} ${value.split("-")[0]}` : "date to be agreed";
}

function BuyingList({ rows, measurements, outOfDate, notes, setNotes, update }: {
  rows: Material[]; measurements: ScopeItem[]; outOfDate: boolean; notes: string;
  setNotes: (notes: string) => void; update: (index: number, changes: Partial<Material>) => void;
}) {
  const [enquiry, setEnquiry] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const groups = new Map<string, Material[]>();
  for (const row of rows.filter(row => row.suppliedBy === "Builder").sort((a, b) => a.supplier.localeCompare(b.supplier) || a.needed.localeCompare(b.needed))) {
    const label = `${row.supplier || "Supplier needed"} · Needed by ${neededDate(row.needed)}`;
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }

  function edit(event: FormEvent<HTMLFormElement>, index: number) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    update(index, {
      supplier: String(fields.get("supplier")).trim(),
      needed: String(fields.get("needed")),
      suppliedBy: fields.get("suppliedBy") === "Customer" ? "Customer" : "Builder",
    });
    setEditing(null);
  }

  function materialRow(row: Material) {
    const { scopeIndex, supplier, needed, suppliedBy, packs, onSite } = row;
    const item = measurements[scopeIndex]!;
    return <article className="card-body" key={scopeIndex}>
      <h4>{item.product}</h4>
      <p>{item.area} · {item.name}</p>
      {suppliedBy === "Builder"
        ? <p>{packs ?? "Unknown"} packs · {onSite ?? "Unknown"} on site · {packs === null || onSite === null ? "Unknown" : packs - onSite} short</p>
        : <p>Needed by {neededDate(needed)}</p>}
      {editing === scopeIndex ? <form className="form" onSubmit={event => edit(event, scopeIndex)}>
        <div className="field-pair">
          <label>Supplier<input name="supplier" defaultValue={supplier}/></label>
          <label>Needed by<input name="needed" type="date" defaultValue={needed}/></label>
        </div>
        <label>Who supplies<select name="suppliedBy" defaultValue={suppliedBy}>
          <option>Builder</option><option>Customer</option>
        </select></label>
        <div className="form-actions"><button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn primary">Apply in preview</button></div>
      </form> : <button type="button" className="btn small" aria-label={`Edit material ${item.product}`} onClick={() => setEditing(scopeIndex)}>Edit material</button>}
    </article>;
  }

  return <Card title="Materials" sub="Buying list and customer-supplied items" action={<Tag tone="blue">Unsent enquiry</Tag>}>
    {outOfDate && <div className="card-body" role="status"><Note tone="warning"><strong>Out of date</strong> · Measurements or product details changed. Review the example pack counts before using them.</Note></div>}
    {[...groups].map(([label, items]) => <section key={label}>
      <div className="toolbar"><h3>{label}</h3></div>
      {items.map(materialRow)}
    </section>)}
    <section>
      <div className="toolbar"><h3>Customer-supplied items</h3></div>
      {rows.some(row => row.suppliedBy === "Customer") ? rows.filter(row => row.suppliedBy === "Customer").map(materialRow) : <p className="card-body">No customer-supplied items.</p>}
    </section>
    <div className="card-body form">
      <label>Enquiry notes<textarea value={notes} onChange={event => setNotes(event.target.value)}/></label>
      <div className="form-actions"><button type="button" className="btn primary" onClick={() => setEnquiry(true)}>View enquiry</button></div>
    </div>
    {enquiry && <Panel title="Stock enquiry" text="Mock preview · Unsent" close={() => setEnquiry(false)}>
      {outOfDate && <Note tone="warning">Out of date · Check the example quantities first.</Note>}
      {[...groups].map(([label, items]) => <div className="card-body" key={label}>
        <h3>{label}</h3>
        <ul>{items.map(row => <li key={row.scopeIndex}>{measurements[row.scopeIndex]!.product} · {row.packs === null || row.onSite === null ? "Quantity to confirm" : `${row.packs - row.onSite} packs requested`}</li>)}</ul>
      </div>)}
      {!groups.size && <p>No builder-supplied items to enquire about.</p>}
      <p>{notes}</p>
    </Panel>}
  </Card>;
}

function BriefDetails({ brief }: { brief: (typeof briefs)[number] }) {
  return <>
    <div className="card-body">
      <p><strong>What to do</strong> · {brief.work}</p>
      <p><strong>Where</strong> · {brief.area}</p>
      <p><strong>When</strong> · {brief.when}</p>
      <p><strong>Access</strong> · {brief.access}</p>
      <p><strong>Proof needed</strong> · {brief.proof}</p>
    </div>
    <div className="photo-card"><img src={brief.photo} alt={brief.photoLabel}/>
      <div className="photo-copy"><strong>Photos</strong><p>{brief.photoLabel}</p></div>
    </div>
  </>;
}

function TradeBriefs() {
  const [opened, setOpened] = useState<(typeof briefs)[number] | null>(null);
  return <div className="form">
    {briefs.map(brief => <Card key={brief.trade} title={brief.trade} sub={brief.area}>
      <BriefDetails brief={brief}/>
      <div className="toolbar"><button type="button" className="btn primary" onClick={() => setOpened(brief)}>View {brief.trade.toLowerCase()} brief</button></div>
    </Card>)}
    {opened && <Panel title={`${opened.trade} brief`} text="Mock preview · Unsent" close={() => setOpened(null)}><BriefDetails brief={opened}/></Panel>}
  </div>;
}

export function WorkMock() {
  const [screen, setScreen] = useState<Screen>("Plan");
  const [view, setView] = useState<ViewState>("Example");
  const [plan, setPlan] = useState(tasks);
  const [stage, setStage] = useState("Accepted");
  const [measurements, setMeasurements] = useState(scope);
  const [buying, setBuying] = useState(materials);
  const [notes, setNotes] = useState(job.enquiryNotes);
  const [outOfDate, setOutOfDate] = useState(false);

  function updateMeasurement(index: number, changes: Partial<ScopeItem>) {
    setMeasurements(rows => rows.map((row, position) => position === index ? { ...row, ...changes } : row));
    if (materials.some(row => row.scopeIndex === index)) setOutOfDate(true);
  }

  return <Shell workspace={null} title={job.title} subtitle={job.site} active="jobs" staticChrome>
    <nav className="job-tabs" aria-label="Job sections">
      <button type="button" disabled>Overview</button>
      <button type="button" className="active" aria-current="page" disabled>Work</button>
      <button type="button" disabled>Money</button>
      <button type="button" disabled>Records</button>
    </nav>
    <Head kicker={screen === "Measurements" ? "WORK / MATERIALS" : "WORK"} title="Work mock-up" text="Fictional job · Changes only last in this preview."/>
    <nav className="job-tabs" aria-label="Work screens">
      {screens.map(name => <button key={name} type="button" className={name === screen ? "active" : ""} aria-current={name === screen ? "page" : undefined}
        onClick={() => { setScreen(name); setView("Example"); }}>{name}</button>)}
    </nav>
    <div className="form"><label>Preview state<select value={view} onChange={event => setView(states.find(state => state === event.target.value) ?? "Example")}>
      {states.map(state => <option key={state}>{state}</option>)}
    </select></label></div>
    <div className="divider"/>
    {view === "Empty" ? <Card title={screen}><Empty title={`No ${screen === "Plan" ? "planned tasks" : screen.toLowerCase()} yet`} text={empty[screen]}/></Card>
      : view === "Problem" ? <div role="alert"><Note tone="warning"><strong>{screen} could not open.</strong> The job is unchanged. Choose Example to try again.</Note></div>
      : screen === "Plan" ? <Plan tasks={plan} setTasks={setPlan} stage={stage} setStage={setStage}/>
      : screen === "Measurements" ? <Measurements rows={measurements} update={updateMeasurement}/>
      : screen === "Materials" ? <BuyingList rows={buying} measurements={measurements} outOfDate={outOfDate} notes={notes} setNotes={setNotes}
          update={(index, changes) => setBuying(rows => rows.map(row => row.scopeIndex === index ? { ...row, ...changes } : row))}/>
      : <TradeBriefs/>}
  </Shell>;
}
