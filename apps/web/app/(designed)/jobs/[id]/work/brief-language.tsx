"use client";
import { useRef, useState } from "react";
import { briefDisplayText, briefLanguages, type CrewBrief, type CrewBriefTranslation, type CrewBriefTranslationCommand,
  type Lang } from "../../../../lib/brief-display-text";

export function BriefLanguage({ path, brief }: { path: string; brief: CrewBrief & { current?: boolean } }) {
  const [language, setLanguage] = useState<Lang | "">("");
  const [translation, setTranslation] = useState<CrewBriefTranslation | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [stale, setStale] = useState(false);
  const inFlight = useRef(false);
  const replay = useRef<CrewBriefTranslationCommand | null>(null);
  const cache = useRef(new Map<Lang, CrewBriefTranslation>());

  async function choose(lang: Lang | "") {
    if (inFlight.current) return;
    setLanguage(lang); setProblem(""); setTranslation(null);
    if (!lang) return;
    const cached = cache.current.get(lang);
    if (cached) { setTranslation(cached); return; }
    inFlight.current = true; setBusy(true);
    const query = new URLSearchParams({ trade: brief.trade, version: String(brief.version), lang });
    const read = () => fetch(`${path}?${query}`, { cache: "no-store" });
    try {
      let response = await read();
      if (response.status === 404) {
        if (replay.current?.lang !== lang) replay.current = { version: "v2-crew-brief-translation-command.v1",
          commandId: crypto.randomUUID(), trade: brief.trade, expectedVersion: brief.version, lang };
        response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify(replay.current) });
        // Another tab may have cached this language first; read the immutable result.
        if (response.status === 409) {
          const conflict = await response.json();
          if (conflict.code === "CREW_BRIEF_TRANSLATION_EXISTS_CONFLICT") response = await read();
          else { setStale(true); throw new Error("STALE"); }
        }
      }
      if (!response.ok) throw new Error("UNAVAILABLE");
      const saved: CrewBriefTranslation = await response.json();
      cache.current.set(lang, saved); replay.current = null; setTranslation(saved);
    } catch (error) {
      setProblem(error instanceof Error && error.message === "STALE"
        ? "The brief changed. Reload briefs before translating."
        : "Translation could not open. The English original is shown.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  const translated = brief.current !== false && translation !== null;
  const content = briefDisplayText(brief.content, translated ? translation.content : null);
  return <div className="card-body form">
    {brief.current !== false && <label>Language<select value={language} disabled={busy || stale}
      onChange={event => void choose(event.target.value as Lang | "")}>
      <option value="">English</option>{briefLanguages.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
    </select></label>}
    {busy && <p role="status">Opening practice translation…</p>}
    {translated && <>
      <p>Practice translation · Fake service. English remains the brief of record.</p>
      <button type="button" className="btn" onClick={() => void choose("")}>Show the English original</button>
      <p><strong>Trade</strong> · {content.trade}</p>
    </>}
    {problem && <p role="alert">{problem} {!stale && <button type="button" className="btn" onClick={() => void choose(language)}>Try translation again</button>}</p>}
    <p><strong>Access</strong> · {content.accessWindow}</p>
    <ol>{content.tasks.map(task => <li key={`${task.scopeItemId}/${task.taskKey}`}>
      <h4>{task.title}</h4>
      <p><strong>What to do</strong> · {task.scope.description}
        {task.scope.quantity !== null && ` · ${task.scope.quantity} ${task.scope.unit ?? ""}`}</p>
      <p><strong>Duration</strong> · {task.durationMinutes} minutes</p>
      <p><strong>When</strong> · {task.visit ?? "To be agreed"}{task.owner && ` · ${task.owner}`}</p>
      <p><strong>Proof needed</strong> · {task.proofNeeded.join("; ") || "None recorded"}</p>
    </li>)}</ol>
    <p>Photos: {content.photos.length} attached</p>
    <p><strong>Proof needed</strong> · {content.proofNeeded.join("; ") || "None recorded"}</p>
  </div>;
}
