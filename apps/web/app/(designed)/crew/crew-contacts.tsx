"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Note } from "../designed-ui";
import "./crew.css";

// V2-C3C-UI: the signed-in firm's crew records, shared by the "Your crew" screen and the work plan's
// assignee picker, so a contact added in one shows in the other at once. Client code keeps server packages out.
export type CrewContact = { crewId: string; revision: number; displayName: string; trade: string; phone: string; email: string | null };
type CrewState = { crew?: CrewContact[]; failed: boolean };

export const CREW_PATH = "/api/v2-backend/crew";
const byName = (a: CrewContact, b: CrewContact) => a.displayName.localeCompare(b.displayName) || a.crewId.localeCompare(b.crewId);

let state: CrewState = { failed: false };
let loading: Promise<void> | null = null;
// True once a full read has landed. A contact saved before then is in the list, but the read still runs.
let loaded = false;
const listeners = new Set<() => void>();
function publish(next: CrewState) {
  state = next;
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
const snapshot = () => state;

// The newest revision of each contact from both lists, so a read that started before a save
// never drops the contact saved meanwhile, and a stale read never undoes a correction.
function merged(current: CrewContact[] | undefined, incoming: CrewContact[]) {
  const rows = new Map((current ?? []).map(row => [row.crewId, row]));
  for (const row of incoming) if ((rows.get(row.crewId)?.revision ?? 0) <= row.revision) rows.set(row.crewId, row);
  return [...rows.values()].sort(byName);
}

/** Reads the firm's crew once; later callers share the same answer. */
export function loadCrew(force = false) {
  if (loading && !force) return loading;
  if (loaded && !force) return Promise.resolve();
  loading = fetch(CREW_PATH, { cache: "no-store" })
    .then(async response => {
      if (!response.ok) throw new Error(String(response.status));
      const { crew } = await response.json() as { crew: CrewContact[] };
      loaded = true;
      publish({ crew: merged(state.crew, crew), failed: false });
    })
    .catch(() => publish({ ...state, failed: true }))
    .finally(() => { loading = null; });
  return loading;
}

/** A saved contact joins the shared list straight away, so every picker shows it without a reload. */
export function crewSaved(contact: CrewContact) {
  publish({ crew: merged(state.crew, [contact]), failed: state.failed });
}

/** Test seam: forget the shared list. */
export function resetCrewForTests() {
  state = { failed: false };
  loading = null;
  loaded = false;
}

export function useCrewContacts() {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { void loadCrew(); }, []);
  return current;
}

// The CHECK on app.v2_crew_contact (and crew-contact.v1) refuses a real-looking phone or email.
export const crewRefusals: Record<string, string> = {
  CREW_CONTACT_INVALID: "Check the details. The phone must be a made-up practice number, such as 07700 900123, " +
    "01632 960123 or 020 7946 0123, and an email must end in .invalid. Nothing was saved.",
  CREW_CONTACT_VERSION_CONFLICT: "Your crew list changed in another window. Reload the page and try again. Nothing was saved.",
  CREW_CONTACT_COMMAND_CONFLICT: "Your crew list changed in another window. Reload the page and try again. Nothing was saved.",
  FORBIDDEN: "Only the signed-in builder can add crew. Reload the page and check you are signed in. Nothing was saved.",
  UNAUTHENTICATED: "You are signed out. Sign in again to add crew. Nothing was saved.",
};
export const crewRefusal = (code: string | undefined) =>
  (code && crewRefusals[code]) || "The crew member could not be saved. Check your connection and try again.";

export type CrewDraft = { displayName: string; trade: string; phone: string; email: string };
export function crewCommand(draft: CrewDraft, ids: { commandId: string; crewId: string }) {
  const email = draft.email.trim();
  return { version: "crew-contact.v1", commandId: ids.commandId, crewId: ids.crewId, expectedRevision: 0,
    displayName: draft.displayName.trim(), trade: draft.trade.trim(), phone: draft.phone.trim(), email: email || null } as const;
}

export class CrewSaveError extends Error {}

/** Posts one new crew record. A retry of the same details keeps its commandId, so it replays, not duplicates. */
export async function saveCrew(draft: CrewDraft, pending: { current: { payload: string; commandId: string; crewId: string } | null }) {
  const payload = JSON.stringify(draft);
  if (pending.current?.payload !== payload) pending.current = { payload, commandId: crypto.randomUUID(), crewId: crypto.randomUUID() };
  const response = await fetch(CREW_PATH, { method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
    body: JSON.stringify(crewCommand(draft, pending.current)) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new CrewSaveError(data.code);
  pending.current = null;
  crewSaved(data as CrewContact);
  return data as CrewContact;
}

const blank: CrewDraft = { displayName: "", trade: "", phone: "", email: "" };
const fields: [keyof CrewDraft, string, string, string][] = [
  ["displayName", "Name", "text", "Jordan Fictional"],
  ["trade", "Trade", "text", "Electrician"],
  ["phone", "Phone (made-up practice number)", "tel", "07700 900123"],
  ["email", "Email (optional, ends in .invalid)", "email", "jordan@crew.example.invalid"],
];

/** The add form. It is not a <form>, so it can sit inside the work plan's task form. */
export function CrewAddForm({ onSaved, onCancel }: { onSaved?: (contact: CrewContact) => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState<CrewDraft>(blank);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef<{ payload: string; commandId: string; crewId: string } | null>(null);
  const ready = draft.displayName.trim() && draft.trade.trim() && draft.phone.trim();

  async function add() {
    if (!ready || busy) return;
    setBusy(true);
    setProblem("");
    setNotice("");
    try {
      const contact = await saveCrew(draft, pending);
      setDraft(blank);
      setNotice(`${contact.displayName} added to your crew.`);
      onSaved?.(contact);
    } catch (error) {
      setProblem(crewRefusal(error instanceof CrewSaveError ? error.message : undefined));
    } finally {
      setBusy(false);
    }
  }

  return <div className="crew-panel form" role="group" aria-label="Add a crew member">
    {fields.map(([key, label, type, example]) => <label key={key}>{label}
      <input type={type} value={draft[key]} disabled={busy} maxLength={key === "email" ? 200 : 100}
        required={key !== "email"} placeholder={example} autoComplete="off"
        onChange={event => { const value = event.currentTarget.value; setDraft(current => ({ ...current, [key]: value })); }}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void add(); } }}/>
    </label>)}
    {problem && <div role="alert"><Note tone="warning">{problem}</Note></div>}
    {notice && <p role="status">{notice}</p>}
    <div className="form-actions">
      {onCancel && <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>}
      <button type="button" className="btn primary" disabled={busy || !ready} onClick={() => void add()}>
        {busy ? "Adding…" : "Add to crew"}</button>
    </div>
  </div>;
}
