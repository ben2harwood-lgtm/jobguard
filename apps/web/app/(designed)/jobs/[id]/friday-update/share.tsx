"use client";
import React, { useEffect, useState } from "react";
import { shareTargets } from "./share-targets";

export function FridayShare({ message, sentAt }: { message: string; sentAt: string | null | undefined }) {
  const [canShare, setCanShare] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const targets = shareTargets(sentAt ? message : null, canShare);
  useEffect(() => {
    setFeedback("");
    try { setCanShare(typeof navigator.share === "function" && navigator.canShare?.({ text: message }) === true); }
    catch { setCanShare(false); }
  }, [message, sentAt]);

  async function share() {
    if (!targets) return;
    setFeedback(""); setBusy(true);
    try { await navigator.share({ text: targets.text }); }
    catch (cause) {
      if (!(cause && typeof cause === "object" && "name" in cause && cause.name === "AbortError")) {
        setCanShare(false);
        setFeedback("Sharing didn't work. Copy the text instead.");
      }
    } finally { setBusy(false); }
  }
  async function copy() {
    if (!targets) return;
    setFeedback("");
    try { await navigator.clipboard.writeText(targets.text); setFeedback("Text copied."); }
    catch { setFeedback("Copying didn't work. Try again."); }
  }

  if (!targets) return null;
  return <section className="form" aria-label="Share sent Friday update">
    <p>Share this sent version from your phone. You choose who receives it; JobGuard sends nothing.</p>
    <div className="form-actions">
      {targets.showShare && <button className="btn" disabled={busy} onClick={() => void share()}>Share</button>}
      {targets.showFallback && <>
        <button className="btn" onClick={() => void copy()}>Copy text</button>
        <a className="btn" style={{ minHeight: 44 }} href={targets.whatsappUrl} target="_blank" rel="noreferrer">Open WhatsApp</a>
      </>}
    </div>
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}
