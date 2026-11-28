"use client";
import React, { useEffect, useRef, useState } from "react";
import type { HireItem, HireTask } from "@jobguard/api/workspace";
import { jobPageFetch as fetch } from "./job-page-fetch";
import { hireTaskKey, isHireTaskLinked, toggleHireTask } from "./v2-hire-links";

type Details = Pick<HireItem, "kind" | "supplier" | "bookedFrom" | "weeklyCost" | "neededUntil">;
type Task = HireTask & { title: string };
type View = { items: HireItem[]; tasks: Task[] };
const empty: Details = { kind: "scaffold", supplier: "", bookedFrom: "", weeklyCost: "", neededUntil: null };
const control = { minHeight: 44, maxWidth: "100%" };

export function V2HireItems({ jobId }: { jobId: string }) {
  const [view, setView] = useState<View>({ items: [], tasks: [] });
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [details, setDetails] = useState<Details>(empty), [editing, setEditing] = useState<HireItem | null>(null);
  const pending = useRef<{ key: string; commandId: string } | null>(null);
  const url = `/api/jobs/${encodeURIComponent(jobId)}/hires`;
  async function load() {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load hire items");
    setView(await response.json()); setLoaded(true);
  }
  useEffect(() => { void load().catch(cause => setError(cause.message)); }, [jobId]); // request-scoped endpoint
  async function run(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save hire item"); }
    finally { setBusy(false); }
  }
  async function change(action: string, item?: HireItem, extra: object = {}) {
    const key = JSON.stringify({ action, hireId: item?.hireId, expectedVersion: item?.itemVersion ?? 0, ...extra });
    // Preserve exact retry identity after an unknown transport outcome, including add's new identity.
    if (pending.current?.key !== key) pending.current = { key, commandId: crypto.randomUUID() };
    const commandId = pending.current.commandId;
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: "hire-command.v1", commandId, hireId: item?.hireId ?? commandId,
        action, expectedVersion: item?.itemVersion ?? 0, ...extra }) });
    if (!response.ok) {
      const body = await response.json();
      if (body.code === "HIRE_VERSION_CONFLICT") {
        await load(); pending.current = null;
        throw new Error("Hire item changed. Review it again before saving.");
      }
      throw new Error("Could not save hire item. Check the details and try again.");
    }
    // Keep the identity until the refresh succeeds, so a retry after a failed reload replays this command.
    await load(); pending.current = null;
  }
  function edit(item: HireItem) {
    setEditing(item); setDetails({ kind: item.kind, supplier: item.supplier, bookedFrom: item.bookedFrom,
      weeklyCost: item.weeklyCost, neededUntil: item.neededUntil });
  }
  return <section data-testid="v2-hire-items" aria-label="Hire items" className="materials-panel" aria-busy={busy} style={{ overflowWrap: "anywhere" }}>
    <h2>Hire items</h2>
    <p>Practice sandbox — synthetic data; nothing is sent or charged. Builder only.</p>
    <p>Record fictional scaffold, skips and plant. Off-hire reminders do not contact your supplier.</p>
    {error && <p role="alert" tabIndex={-1} ref={element => { element?.focus(); }}>{error}</p>}
    <button style={control} disabled={busy} onClick={() => void run(load)}>Refresh hire items</button>
    {loaded && !view.items.length && <p>No hire items recorded.</p>}
    <form onSubmit={event => { event.preventDefault(); void run(async () => {
      await change(editing ? "edit" : "add", editing ?? undefined, { details }); setEditing(null); setDetails(empty);
    }); }}>
      <h3>{editing ? "Edit hire item" : "Add hire item"}</h3>
      <label>Hire type<select style={control} value={details.kind} onChange={event => setDetails({ ...details, kind: event.target.value as Details["kind"] })}>
        <option value="scaffold">Scaffold</option><option value="skip">Skip</option><option value="plant">Plant</option><option value="other">Other</option>
      </select></label>
      <label>Fictional hire supplier<input style={control} required maxLength={200} value={details.supplier} onChange={event => setDetails({ ...details, supplier: event.target.value })}/></label>
      <label>Booked from<input style={control} type="date" required value={details.bookedFrom} onChange={event => setDetails({ ...details, bookedFrom: event.target.value })}/></label>
      <label>Weekly cost (£)<input style={control} inputMode="decimal" required pattern="(0|[1-9][0-9]{0,8})[.][0-9]{2}" placeholder="125.00" value={details.weeklyCost} onChange={event => setDetails({ ...details, weeklyCost: event.target.value })}/></label>
      <label>Needed until (optional)<input style={control} type="date" min={details.bookedFrom} value={details.neededUntil ?? ""} onChange={event => setDetails({ ...details, neededUntil: event.target.value || null })}/></label>
      <button style={control} disabled={busy || !loaded} type="submit">{editing ? "Save hire changes" : "Add hire item"}</button>
      {editing && <button style={control} type="button" onClick={() => { setEditing(null); setDetails(empty); }}>Cancel edit</button>}
    </form>
    {view.items.map(item => <article key={item.hireId} aria-label={`${item.kind} from ${item.supplier}`}>
      <h3>{item.kind} — {item.supplier}</h3>
      <p>{item.status === "on_hire" ? "On hire" : item.status === "off_hire_requested" ? "Off-hire requested — contact the supplier yourself" : "Off hire"}</p>
      <p>Booked from {item.bookedFrom}. £{item.weeklyCost} per week. About £{item.approximateCost} so far.</p>
      <p>Estimate: weekly rate prorated by elapsed calendar days. Supplier terms may differ.</p>
      {item.reminder && <p role="status">{item.kind} not needed after {item.neededAfter}: off-hire it?</p>}
      {item.status !== "off_hire" && <>
        <button style={control} disabled={busy} onClick={() => edit(item)}>Edit hire item</button>
        <fieldset disabled={busy}><legend>Tasks that need this hire item</legend>
          {view.tasks.map(task => <label key={hireTaskKey(task)} style={{ display: "block", minHeight: 44 }}>
            <input type="checkbox" checked={isHireTaskLinked(item.tasks, task)}
              onChange={event => { const { title: _title, ...link } = task;
                const tasks = toggleHireTask(item.tasks, link, event.target.checked);
                void run(() => change("link", item, { tasks })); }}/>{task.title}
          </label>)}
          {!view.tasks.length && <p>No dated plan tasks yet. Use Needed until for a reminder.</p>}
        </fieldset>
        {item.status === "on_hire" && <button style={control} disabled={busy} onClick={() => void run(() => change("request_off_hire", item))}>Mark off-hire requested</button>}
        <button style={control} disabled={busy} onClick={() => void run(() => change("off_hire", item))}>Mark off hire</button>
      </>}
    </article>)}
  </section>;
}
