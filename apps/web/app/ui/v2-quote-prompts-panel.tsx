"use client";
import { useEffect, useState } from "react";
import { openPrompts, readDismissed, writeDismissed, type PromptLine, type QuotePrompt } from "./v2-quote-prompts";

// V2 only: outside the local V2 rehearsal the panel makes no request and
// renders nothing (the route also answers 404 there). It never blocks sending and never saves a line.
// In Scope review, onAdd uses the existing "Add omitted line" action: the new
// line has no price and is saved only when the builder confirms the scope.
// On the quote there is no add-line route once the scope is confirmed, so the
// panel can only remind or dismiss.
export function V2QuotePrompts({ jobId, lines, onAdd }: { jobId: string; lines: readonly PromptLine[]; onAdd?: (prompt: QuotePrompt) => void }) {
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let current = true;
    setTemplateKey(null);
    // Inlined at build time only by the V2 launcher (next.config.mjs): no request outside V2.
    if (process.env.NEXT_PUBLIC_JOBGUARD_V2_QUOTE_PROMPTS !== "1") return;
    void fetch(`/api/v2-backend/jobs/${jobId}/quote-prompts`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) return;
        const body: unknown = await response.json();
        const key = typeof body === "object" && body !== null && "templateKey" in body ? body.templateKey : null;
        if (!current || typeof key !== "string") return;
        setDismissed(readDismissed(jobId, key));
        setTemplateKey(key);
      })
      .catch(() => undefined);
    return () => { current = false; };
  }, [jobId]);
  if (templateKey === null) return null;
  const open = openPrompts(templateKey, lines, dismissed);
  function dismiss(key: string, label: string) {
    const next = [...dismissed, key];
    setDismissed(next);
    setNotice(writeDismissed(jobId, templateKey!, next)
      ? `${label} dismissed. It stays dismissed on this device.`
      : `${label} dismissed for now. This browser could not save it, so it may come back after a reload.`);
  }
  return (
    <section className="quote-prompts" aria-labelledby="quote-prompts-title" data-testid="v2-quote-prompts">
      <h2 id="quote-prompts-title">Don&apos;t forget</h2>
      {open.length === 0
        ? <p>Every usual cost for this kind of job is on the quote or set aside.</p>
        : <>
          <p>{onAdd
            ? "Jobs like this usually carry these costs. Add a line here, without a price, or say it isn't needed."
            : "Jobs like this usually carry these costs. Nothing is added for you, and you can still send the quote."}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {open.map(prompt => (
              <li key={prompt.key} style={{ minWidth: 0 }}>
                <strong>{prompt.label}</strong>
                <small style={{ display: "block" }}>{prompt.hint}</small>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  {onAdd && <button type="button" aria-label={`Add a line for ${prompt.label}`} onClick={() => { onAdd(prompt); setNotice(`${prompt.label} line added without a price. It is saved only when you confirm the scope, and you price it on the quote.`); }}>Add a line</button>}
                  <button type="button" aria-label={`Not needed: ${prompt.label}`} onClick={() => dismiss(prompt.key, prompt.label)}>Not needed</button>
                </div>
              </li>
            ))}
          </ul>
          {!onAdd && <small>Lines are added in Scope review, before the scope is confirmed.</small>}
        </>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
