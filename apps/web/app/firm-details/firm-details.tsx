"use client";
import { useEffect, useState } from "react";
type Profile = { version: "firm-profile.v1"; tradingName: string; addressLines: string[]; contactEmail: string; contactPhone: string };
type View = { profile: Profile | null; canSave: boolean; isPractice?: boolean };
const empty: Profile = { version: "firm-profile.v1", tradingName: "", addressLines: [], contactEmail: "", contactPhone: "" };
export function FirmProfileLink() {
 const [view, setView] = useState<View | null>(null);
 useEffect(() => { let active = true; void fetch("/api/firm-profile", { cache: "no-store" })
  .then(async r => { if (r.ok && active) setView(await r.json()); }).catch(() => {});
 return () => { active = false; }; }, []);
 return view ? <p><a href="/firm-details">{view.profile ? "Your firm details" : "Add your firm details"}</a></p> : null;
}
export function FirmTradingName() {
 const [name, setName] = useState("A Builder Ltd");
 useEffect(() => { let active = true; void fetch("/api/firm-profile", { cache: "no-store" })
  .then(async r => { if (r.ok) { const view: View = await r.json(); if (active && view.profile) setName(view.profile.tradingName); } }).catch(() => {});
 return () => { active = false; }; }, []);
 return <>{name}</>;
}
export function FirmDetailsForm({ initial, refusal }: { initial: View | null; refusal?: string }) {
 const [profile, setProfile] = useState(initial?.profile ?? (initial?.isPractice ? { ...empty, tradingName: "A Builder Ltd" } : empty));
 const [notice, setNotice] = useState(refusal ?? "");
 const [saving, setSaving] = useState(false);
 const canSave = initial?.canSave === true;
 async function save(event: React.FormEvent) {
  event.preventDefault();
  if (!canSave || saving) return;
  setSaving(true); setNotice("");
  try {
   const response = await fetch("/api/firm-profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...profile, addressLines: profile.addressLines.map(line => line?.trim() ?? "").filter(Boolean) }) });
   if (!response.ok) { setNotice(response.status === 403 ? "Only the company owner can save firm details." : response.status === 401 ? "Sign in to your company to save firm details." : response.status === 400 ? "Check the firm details and try again." : "The save could not be confirmed. Reload before trying again."); return; }
   const view: View = await response.json(); setProfile(view.profile!); setNotice("Firm details saved. Already-issued quotes keep their original details.");
  } catch { setNotice("The save could not be confirmed. Reload before trying again."); }
  finally { setSaving(false); }
 }
 return <section><h1>Your firm details</h1>{initial && !initial.isPractice && !canSave && <p>Only the company owner can save firm details.</p>}
  <form onSubmit={event => void save(event)}><fieldset disabled={!canSave || saving}>
   <label>Trading name<input required maxLength={120} value={profile.tradingName} onChange={e => setProfile({ ...profile, tradingName: e.target.value })}/></label>
   {[0, 1, 2].map(index => <label key={index}>Address line {index + 1}<input maxLength={160} value={profile.addressLines[index] ?? ""} onChange={e => { const addressLines = [...profile.addressLines]; addressLines[index] = e.target.value; setProfile({ ...profile, addressLines }); }}/></label>)}
   <label>Contact email<input type="email" maxLength={320} value={profile.contactEmail} onChange={e => setProfile({ ...profile, contactEmail: e.target.value })}/></label>
   <label>Contact phone<input type="tel" maxLength={80} value={profile.contactPhone} onChange={e => setProfile({ ...profile, contactPhone: e.target.value })}/></label>
   <button type="submit">{initial?.isPractice ? "Practice firms use the sample name" : saving ? "Saving…" : "Save firm details"}</button>
  </fieldset></form>{notice && <p role="status">{notice}</p>}<a href="/">Back to your jobs</a></section>;
}
export function FirmDetailsScreen() {
 const [view, setView] = useState<View | null>(null);
 const [refusal, setRefusal] = useState("Loading firm details…");
 useEffect(() => { void fetch("/api/firm-profile", { cache: "no-store" }).then(async response => {
  if (response.ok) { setView(await response.json()); setRefusal(""); }
  else setRefusal(response.status === 401 ? "Sign in to your company to see firm details." : "Firm details could not be loaded.");
 }).catch(() => setRefusal("Firm details could not be loaded.")); }, []);
 return <FirmDetailsForm key={view ? "loaded" : "loading"} initial={view} refusal={refusal}/>;
}
