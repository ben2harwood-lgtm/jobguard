"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { siteOrderLinesV1, siteSorItemsV1 } from "@jobguard/core";
import styles from "./work-orders.module.css";

const id = z.guid(), hash = z.string().regex(/^[a-f0-9]{64}$/u);
const prompt = z.object({ id, jobId: id, promptHash: hash, rule: z.enum(["a", "b", "c", "d"]), ruleVersion: z.string(), surfacedAt: z.string(), resolution: z.string().nullable() });
export const possibleExtrasPageV1 = z.object({ items: z.array(prompt), nextCursor: id.nullable() });
export const possibleExtraDetailV1 = prompt.extend({ citations: z.array(z.object({ kind: z.string(), sourceId: id, sha256: hash, evidenceId: id.nullable(), objectVersion: z.string().nullable(), locator: z.unknown() })), reason: z.string().nullable(), variationId: id.nullable() });
// Use the existing authorised read; only same-job identifiers and descriptions become choices.
export const possibleExtraChoicesV1 = z.object({ version: z.literal("northside-extras.v1"), extras: z.array(z.object({ extraId: id, jobId: id, description: z.string() })) });
type Detail = z.infer<typeof possibleExtraDetailV1>;
type Choice = z.infer<typeof possibleExtraChoicesV1>["extras"][number];
const ruleLabels = { a: "Work outside the order", b: "Materials above the order", c: "Visit duration to check", d: "Close-out answer to check" };
type Selection = { existingExtraId?: string; excessScopeItemId?: string; confirmedWorkIdentity?: string };
type ScopeLine = z.infer<typeof siteOrderLinesV1>["lines"][number];
export function promptResolutionBody(detail: Detail, action: "confirm" | "dismiss", commandId: string, reason: string, selection: Selection) {
  return { version: action === "confirm" ? "confirm-prompt.v1" : "dismiss-prompt.v1", commandId, promptHash: detail.promptHash,
    ...(action === "dismiss" ? { reason: reason.trim() } : selection) };
}
export function PossibleExtraDetail({ detail, choices, lines = [], busy, ambiguous, resolve, searchWork }: {
  detail: Detail; choices: Choice[]; lines?: ScopeLine[]; busy: boolean; ambiguous: boolean;
  resolve?: (action: "confirm" | "dismiss", reason: string, selection: Selection) => void;
  searchWork?: (query: string) => Promise<z.infer<typeof siteSorItemsV1>["items"]>;
}) {
  const [reason, setReason] = useState(""), [existing, setExisting] = useState(""), [scope, setScope] = useState(""), [work, setWork] = useState("");
  const [query, setQuery] = useState(""), [items, setItems] = useState<z.infer<typeof siteSorItemsV1>["items"]>([]), [searching, setSearching] = useState(false), [searchError, setSearchError] = useState("");
  const needsWork = detail.rule === "c" || detail.rule === "d";
  const noChoices = ambiguous && !choices.length && !(detail.rule === "b" && lines.length);
  const held = (needsWork && !work) || noChoices;
  async function search() {
    if (!searchWork || searching || busy) return;
    setSearching(true); setWork(""); setItems([]); setSearchError("");
    try { const found = await searchWork(query.trim()); setItems(found); if (!found.length) setSearchError("No authorised work identities matched. This prompt cannot be confirmed here yet."); }
    catch { setSearchError("Work identities are unavailable to this role or job. This prompt cannot be confirmed here yet. Dismiss is still available."); }
    finally { setSearching(false); }
  }
  const selection: Selection = { ...(existing ? { existingExtraId: existing } : {}), ...(scope ? { excessScopeItemId: scope } : {}), ...(work ? { confirmedWorkIdentity: work } : {}) };
  return <section aria-label="Possible extra detail">
    <h2>{ruleLabels[detail.rule]}</h2>
    <p>Surfaced {detail.surfacedAt} · {detail.ruleVersion}</p>
    <h3>Citations</h3>
    <ul>{detail.citations.map((c, index) => <li key={index}>{c.kind} · source <code className={styles.ident}>{c.sourceId}</code>
      {c.evidenceId && <> · evidence <code className={styles.ident}>{c.evidenceId}</code></>}
      {c.objectVersion && <> · object version {c.objectVersion}</>}
      <p>SHA-256 <code className={styles.ident}>{c.sha256}</code></p>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(c.locator, null, 2)}</pre>
    </li>)}</ul>
    {detail.resolution ? <p role="status">Recorded: {detail.resolution}{detail.reason ? ` · ${detail.reason}` : ""}</p> : resolve ? <>
      {needsWork && <fieldset><legend>Choose the work to confirm</legend>
        <label>Search work catalogue <input value={query} disabled={busy || searching} onChange={e => { setQuery(e.target.value); setWork(""); setItems([]); }}/></label>
        <button type="button" disabled={busy || searching || !query.trim() || !searchWork} onClick={() => void search()}>Search work identities</button>
        {items.length > 0 && <label>Work identity <select style={{ display: "block", maxWidth: "100%" }} value={work} disabled={busy || searching} onChange={e => setWork(e.target.value)}>
          <option value="">Choose the work explicitly</option>{items.map(item => <option key={item.code} value={item.code}>{item.code} · {item.description} ({item.unit})</option>)}
        </select></label>}
        {searchError && <p role="alert">{searchError}</p>}
      </fieldset>}
      {choices.length > 0 && <label>Existing extra (the server verifies the match) <select style={{ display: "block", maxWidth: "100%" }} value={existing} disabled={busy} onChange={e => setExisting(e.target.value)}>
        <option value="">Let the server check for an exact match</option>{choices.map(c => <option key={c.extraId} value={c.extraId}>{c.description} ({c.extraId})</option>)}
      </select></label>}
      {detail.rule === "b" && lines.length > 0 && <label>Instructed line (the server verifies the excess) <select style={{ display: "block", maxWidth: "100%" }} value={scope} disabled={busy} onChange={e => setScope(e.target.value)}>
        <option value="">Let the server check for one exact line</option>{lines.map(line => <option key={line.scopeItemId} value={line.scopeItemId}>{line.sorCode} · {line.description} ({line.scopeItemId})</option>)}
      </select></label>}
      {held && <p>This prompt cannot be confirmed from this screen yet. An explicit work identity or matching choice is needed. Dismiss is still available.</p>}
      {ambiguous && !held && <p>Choose an existing extra or instructed line explicitly before confirming again. The server will check the choice.</p>}
      {!held && <button type="button" disabled={busy || searching || (ambiguous && !existing && !scope)} onClick={() => resolve("confirm", "", selection)}>Confirm possible extra</button>}
      {!held && <p>Confirmation records an unpriced extra or links an exact existing match. It does not approve the work.</p>}
      <label>Reason for dismissal <textarea style={{ display: "block", maxWidth: "100%" }} value={reason} maxLength={2000} disabled={busy} onChange={e => setReason(e.target.value)}/></label>
      <button type="button" disabled={busy || !reason.trim()} onClick={() => resolve("dismiss", reason, {})}>Dismiss possible extra</button>
    </> : <p>Resolution controls are unavailable. Reload the prompt to check your current access and the recorded outcome.</p>}
  </section>;
}

export function PossibleExtras({ jobId }: { jobId: string }) {
  const [lane, setLane] = useState<z.infer<typeof possibleExtrasPageV1> | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null), [choices, setChoices] = useState<Choice[]>([]), [lines, setLines] = useState<ScopeLine[]>([]);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [ambiguous, setAmbiguous] = useState(false);
  const [status, setStatus] = useState("Loading possible extras…"), [error, setError] = useState("");
  const lock = useRef(false), generation = useRef(0), heldHashes = useRef(new Set<string>());
  const base = `/api/contractor/jobs/${encodeURIComponent(jobId)}/possible-extras`;
  async function read(path: string) {
    const response = await fetch(path, { cache: "no-store" }), body = await response.json();
    if (!response.ok) throw new Error(body.code ?? "PROMPT_UNAVAILABLE");
    return body;
  }
  async function load(after?: string, promptId?: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setDetail(null); setChoices([]); setLines([]);
    const current = generation.current;
    try {
      if (promptId) {
        const parsed = possibleExtraDetailV1.parse(await read(`${base}/${encodeURIComponent(promptId)}`));
        if (parsed.jobId !== jobId || parsed.id !== promptId) throw new Error("PROMPT_UNAVAILABLE");
        if (current !== generation.current) return;
        setDetail(parsed); setAmbiguous(heldHashes.current.has(parsed.promptHash)); setUncertain(false);
        // Failure of this optional read never supplies invented choices.
        try {
          const data = possibleExtraChoicesV1.parse(await read("/api/northside/extras"));
          if (current === generation.current) setChoices(data.extras.filter(c => c.jobId === jobId));
        } catch { if (current === generation.current) setChoices([]); }
        if (parsed.rule === "b") {
          try {
            const data = siteOrderLinesV1.parse(await read(`/api/contractor/jobs/${encodeURIComponent(jobId)}/order-lines`));
            if (data.jobId !== jobId) throw new Error("PROMPT_UNAVAILABLE");
            if (current === generation.current) setLines(data.lines);
          } catch { if (current === generation.current) setLines([]); }
        }
      } else {
        const parsed = possibleExtrasPageV1.parse(await read(`${base}${after ? `?after=${encodeURIComponent(after)}` : ""}`));
        if (parsed.items.some(item => item.jobId !== jobId)) throw new Error("PROMPT_UNAVAILABLE");
        if (current !== generation.current) return;
        setLane(parsed);
      }
      if (current === generation.current) setStatus("Possible extras loaded.");
    } catch (e) {
      if (current !== generation.current) return;
      setLane(null); setError(e instanceof Error && /^[A-Z_]+$/u.test(e.message) ? e.message : "PROMPT_UNAVAILABLE"); setStatus("Possible extras could not be loaded.");
    } finally { if (current === generation.current) { lock.current = false; setBusy(false); } }
  }
  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get("promptId");
    void load(undefined, selected && id.safeParse(selected).success ? selected : undefined);
    return () => { generation.current++; lock.current = false; };
    // A different job starts with a fresh screen in the page.
  }, [jobId]);
  async function resolve(action: "confirm" | "dismiss", reason: string, selection: Selection) {
    if (lock.current || !detail || uncertain) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`${base}/${detail.id}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(promptResolutionBody(detail, action, crypto.randomUUID(), reason, selection)) });
      const result = await response.json();
      if (!response.ok) {
        setError(result.code ?? "PROMPT_UNAVAILABLE");
        if (result.code === "PROMPT_AMBIGUOUS") { heldHashes.current.add(detail.promptHash); setAmbiguous(true); }
        else setUncertain(true);
        setStatus("The request was refused. Reload the prompt before trying again."); return;
      }
      setUncertain(true); setStatus("Resolution recorded. Reload the prompt to see the current record.");
    } catch { setUncertain(true); setError("PROMPT_UNAVAILABLE"); setStatus("The outcome is unknown. Reload the prompt to check what was recorded before trying again."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <main className={styles.main}>
    <Link href="/contractor/work-orders">Work orders</Link>
    <h1>Possible extras</h1><p>Practice sandbox · fictional data only.</p>
    <p role="status">{status}</p>
    {error && <p role="alert">{error === "EXTRA_FORBIDDEN" ? "This job or action is not available to your current role. The lane is for supervisors; surveyors and commercial managers can open an authorised prompt link." : `Request refused (${error}).`}</p>}
    <button type="button" disabled={busy} onClick={() => void load()}>Reload lane</button>
    {lane && <section aria-label="Possible extras lane">{lane.items.length ? <ul>{lane.items.map(item => <li key={item.id}>
      <button type="button" disabled={busy} onClick={() => void load(undefined, item.id)}>{ruleLabels[item.rule]} · {item.surfacedAt} · {item.resolution ?? "Awaiting review"}</button>
    </li>)}</ul> : <p>No possible extras on this page.</p>}
    {lane.nextCursor && <button type="button" disabled={busy} onClick={() => void load(lane.nextCursor!)}>Next page</button>}</section>}
    {detail && <><PossibleExtraDetail key={detail.id} detail={detail} choices={choices} lines={lines} busy={busy} ambiguous={ambiguous} searchWork={async query => {
        const data = siteSorItemsV1.parse(await read(`/api/contractor/jobs/${encodeURIComponent(jobId)}/sor-items?q=${encodeURIComponent(query)}`));
        if (data.jobId !== jobId) throw new Error("PROMPT_UNAVAILABLE");
        return data.items;
      }} {...(!uncertain ? { resolve: (action, reason, selection) => void resolve(action, reason, selection) } : {})}/>
      <button type="button" disabled={busy} onClick={() => void load(undefined, detail.id)}>Reload prompt</button></>}
  </main>;
}
