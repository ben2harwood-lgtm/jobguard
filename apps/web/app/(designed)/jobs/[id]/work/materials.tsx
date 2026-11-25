"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { MaterialLineCommand, MaterialsView } from "@jobguard/api/workspace";
import { Card, Empty, Note, Tag } from "../../../designed-ui";

type View = MaterialsView & { scope: { scopeItemId: string; description: string }[] };
type Line = View["lines"][number];
type Changes = MaterialLineCommand["changes"];
const identity = (line: { scopeItemId: string; lineKey: string }) => `${line.scopeItemId}/${line.lineKey}`;
const reasons: Record<string, string> = {
  measurement: "Confirm the measurement above", product: "Choose a product", pack_size: "Enter the pack size",
  unit_mismatch: "Pack and measurement units must match", wastage_multiplier: "Enter the wastage allowance",
  set_aside_packs: "Confirm usable packs set aside", supplier: "Choose a supplier", needed_by: "Choose a needed-by date",
};
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...(body === undefined ? {} : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.code);
  return data;
}

function ProductForm({ line, busy, save, cancel }: {
  line?: Line; busy: boolean; save: (changes: Changes) => void; cancel: () => void;
}) {
  const [invalid, setInvalid] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const value = (key: string) => String(fields.get(key) ?? "").trim();
    const positive = /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/u;
    const quantity = value("packQuantity"), unit = value("packUnit"), allowance = value("allowance");
    if ([quantity, allowance].some(v => v && (!positive.test(v) || !/[1-9]/u.test(v))) || Boolean(quantity) !== Boolean(unit)) {
      setInvalid("Use positive decimals with up to six places. A pack size needs its unit too."); return;
    }
    if (!/^(0|[1-9][0-9]{0,8})$/u.test(value("stock")) || (value("override") && !/^[1-9][0-9]{0,8}$/u.test(value("override")))) {
      setInvalid("Enter whole packs. A corrected pack count must be above zero."); return;
    }
    save({ product: value("product") || null, packSize: quantity ? { quantity, unit } : null,
      wastageMultiplier: allowance || null, setAsidePacks: value("stock"), supplier: value("supplier") || null,
      neededBy: value("neededBy") || null, suppliedBy: value("suppliedBy") === "customer" ? "customer" : "builder",
      notes: value("notes") || null, removed: false,
      ...((value("override") || null) !== (line?.packsOverride ?? null) || fields.get("confirmOverride") === "on"
        ? { packsOverride: value("override") || null } : {}),
    });
  }
  return <form className="form" onSubmit={submit}>
    <fieldset disabled={busy} className="form" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <label>Product<input name="product" maxLength={200} defaultValue={line?.product ?? ""}/></label>
      <div className="field-pair">
        <label>Pack size<input name="packQuantity" inputMode="decimal" maxLength={40} defaultValue={line?.packSize?.quantity ?? ""}/></label>
        <label>Pack unit<input name="packUnit" maxLength={40} defaultValue={line?.packSize?.unit ?? ""}/></label>
      </div>
      <label>Firm's wastage multiplier (1.10 includes 10%)<input name="allowance" inputMode="decimal" maxLength={40} defaultValue={line?.wastageMultiplier ?? ""}/></label>
      <label>Confirmed usable whole packs set aside for this job<input name="stock" inputMode="numeric" maxLength={9} defaultValue={line?.setAsidePacks ?? "0"}/></label>
      <p>Only count this product in a compatible batch.</p>
      <div className="field-pair">
        <label>Supplier<input name="supplier" maxLength={200} defaultValue={line?.supplier ?? ""}/></label>
        <label>Needed by<input name="neededBy" type="date" defaultValue={line?.neededBy ?? ""}/></label>
      </div>
      <label>Who supplies<select name="suppliedBy" defaultValue={line?.suppliedBy ?? "builder"}><option value="builder">Builder</option><option value="customer">Customer</option></select></label>
      <label>Enquiry notes<textarea name="notes" maxLength={2000} defaultValue={line?.notes ?? ""}/></label>
      <label>Builder's corrected pack count (optional)<input name="override" inputMode="numeric" maxLength={9} defaultValue={line?.packsOverride ?? ""}/></label>
      {line?.calculation.status === "calculated" && line.calculation.packsClash && <label>
        <input name="confirmOverride" type="checkbox"/>Confirm this corrected pack count for the changed inputs
      </label>}
    </fieldset>
    {invalid && <p role="alert">{invalid}</p>}
    <div className="form-actions"><button type="button" className="btn" disabled={busy} onClick={cancel}>Cancel</button>
      <button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save material"}</button></div>
  </form>;
}

export function Materials({ jobId }: { jobId: string }) {
  const path = `/api/v2-backend/jobs/${encodeURIComponent(jobId)}/materials`;
  const [view, setView] = useState<View>();
  const [editing, setEditing] = useState<{ scopeItemId: string; lineKey: string } | null>(null);
  const [problem, setProblem] = useState<{ message: string; reload?: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const replay = useRef<{ payload: string; commandId: string } | null>(null);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    let current = true;
    request<View>(path).then(data => { if (current) setView(data); }).catch(() => {
      if (current) setProblem({ message: "Materials could not open. Your job is unchanged.", reload: true });
    });
    return () => { current = false; };
  }, [path]);

  async function command(input: object, generated = false) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setProblem(null); setNotice("");
    const payload = JSON.stringify(input);
    if (replay.current?.payload !== payload) replay.current = { payload, commandId: crypto.randomUUID() };
    try {
      await request(path, { ...input, commandId: replay.current.commandId });
      replay.current = null;
      setEditing(null); setNotice(generated ? "Enquiry saved. Nothing was sent." : "Material saved.");
      try { setView(await request<View>(path)); setOpened(generated); }
      catch { setProblem({ message: "Saved, but the materials list could not refresh.", reload: true }); }
    } catch (error) {
      const stale = error instanceof Error && /MATERIALS_(VERSION|COMMAND)_CONFLICT/u.test(error.message);
      setProblem(stale ? { message: "Materials changed since you opened them. Your change was not saved. Reload before editing again.", reload: true }
        : { message: "Could not confirm the save. Try the same action again." });
    } finally { inFlight.current = false; setBusy(false); }
  }
  const blocked = busy || problem?.reload === true;
  const title = (scopeItemId: string) => view?.scope.find(item => item.scopeItemId === scopeItemId)?.description ?? "Scope item";
  const lines = view?.lines.filter(line => !line.removed) ?? [];
  const groups = new Map<string, Line[]>();
  for (const line of lines.filter(line => line.suppliedBy === "builder")) {
    const label = `${line.supplier ?? "Supplier needed"} · Needed by ${line.neededBy ?? "date to be agreed"}`;
    groups.set(label, [...(groups.get(label) ?? []), line]);
  }
  function row(line: Line) {
    const calculation = line.calculation;
    return <article className="card-body form" key={identity(line)}>
      <h4>{line.product ?? "Product needed"}</h4><p>{title(line.scopeItemId)}</p>
      <p>{line.measurement?.confirmed ? `${line.measurement.quantity} ${line.measurement.unit} confirmed` : "Measurement needs confirmation"}</p>
      {calculation.status === "calculated" ? <>
        <p>{calculation.grossPacks} packs including allowance · {calculation.setAsidePacksUsed} on site · {calculation.neededPacks} short</p>
        {calculation.builderPacks && <p>Builder's pack count: {calculation.builderPacks}</p>}
        {calculation.packsClash && <Note tone="warning">Clashing edit · The inputs changed. Calculated need is {calculation.calculatedPacks} packs. Review your corrected pack count before using the enquiry.</Note>}
      </> : <p>{reasons[calculation.reason]}</p>}
      {line.notes && <p>{line.notes}</p>}
      {editing && identity(editing) === identity(line) ? <ProductForm line={line} busy={blocked} cancel={() => setEditing(null)}
        save={changes => void command({ version: "v2-material-line-command.v1", scopeItemId: line.scopeItemId,
          lineKey: line.lineKey, expectedVersion: line.version, changes })}/>
        : <div><button type="button" className="btn small" disabled={blocked} onClick={() => setEditing(line)}>Edit material {line.product ?? "product"}</button></div>}
    </article>;
  }
  const enquiry = view?.enquiry;
  const adding = editing && !view?.lines.some(line => identity(line) === identity(editing));
  return <Card title="Materials" sub="Buying list and customer-supplied items" id="work-materials" action={<Tag tone="blue">Unsent enquiry</Tag>}>
    {problem && <div className="card-body" role="alert"><Note tone="warning">{problem.message}{problem.reload && <div><button type="button" className="btn small" onClick={() => window.location.reload()}>Reload materials</button></div>}</Note></div>}
    {notice && <p className="card-body" role="status">{notice}</p>}
    {!view && !problem && <p className="card-body" role="status">Loading materials…</p>}
    {enquiry && !enquiry.current && <div className="card-body" role="status"><Note tone="warning"><strong>Out of date</strong> · Inputs changed. Review the quantities and regenerate the enquiry.
      <ul>{enquiry.outOfDate.map(change => <li key={identity(change)}>{title(change.scopeItemId)}: {change.changed.join(", ").replaceAll("_", " ")}</li>)}</ul></Note></div>}
    {view && lines.length === 0 && <Empty title="No materials yet" text="Choose a scope item and add its product and pack size."/>}
    {[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([label, items]) => <section key={label}><div className="toolbar"><h3>{label}</h3></div>{items.map(row)}</section>)}
    {view && <section><div className="toolbar"><h3>Customer-supplied items</h3></div>
      {lines.some(line => line.suppliedBy === "customer") ? lines.filter(line => line.suppliedBy === "customer").map(row) : <p className="card-body">No customer-supplied items.</p>}</section>}
    {view && <div className="card-body form">
      <div><button type="button" className="btn small" disabled={blocked} onClick={() => window.location.reload()}>Refresh materials and measurements</button></div>
      {!editing && <label>Add product for<select disabled={blocked} value="" onChange={event => {
        if (event.target.value) setEditing({ scopeItemId: event.target.value, lineKey: `product-${crypto.randomUUID()}` });
      }}><option value="">Choose a scope item</option>{view.scope.map(item => <option key={item.scopeItemId} value={item.scopeItemId}>{item.description}</option>)}</select></label>}
      {adding && <><h3>{title(editing.scopeItemId)}</h3><ProductForm key={identity(editing)} busy={blocked} cancel={() => setEditing(null)} save={changes => void command({
        version: "v2-material-line-command.v1", ...editing, expectedVersion: 0, changes,
      })}/></>}
      {!editing && <div className="form-actions"><button type="button" className="btn primary" disabled={blocked || !lines.length}
        onClick={() => void command({ version: "v2-material-enquiry-generate.v1", expectedVersion: enquiry?.version ?? 0 }, true)}>
        {busy ? "Saving…" : enquiry && !enquiry.current ? "Regenerate enquiry" : "View enquiry"}</button>
        {enquiry && <button type="button" className="btn" onClick={() => setOpened(!opened)}>{opened ? "Close saved enquiry" : "View saved enquiry"}</button>}</div>}
    </div>}
    {opened && enquiry && <section className="card-body form" aria-label="Stock enquiry">
      <h3>Stock enquiry</h3><p>Internal view · Unsent · Version {enquiry.version}</p>
      {!enquiry.current && <Note tone="warning">Out of date · Regenerate before using these quantities.</Note>}
      {enquiry.groups.map(group => <div key={`${group.supplier}/${group.neededBy}`}><h4>{group.supplier} · Needed by {group.neededBy}</h4>
        <ul>{group.lines.map(line => <li key={identity(line)}>{line.product} · {line.neededPacks} packs requested · {line.packSize.quantity} {line.packSize.unit} per pack
          {line.packsClash && " · Clashing edit: review corrected packs"}{line.notes && ` · ${line.notes}`}</li>)}</ul></div>)}
      {enquiry.questions.map(question => <p key={identity(question)}>{question.product ?? title(question.scopeItemId)}: {reasons[question.reason]}</p>)}
      {!enquiry.groups.length && <p>No complete builder-supplied items to enquire about yet.</p>}
      <h4>Customer-supplied items</h4>{enquiry.customerSupplied.map(line => <p key={identity(line)}>{line.product ?? title(line.scopeItemId)} · Needed by {line.neededBy ?? "date to be agreed"}{line.notes && ` · ${line.notes}`}</p>)}
    </section>}
  </Card>;
}
