"use client";
import { useEffect, useRef, useState } from "react";

/** TOMMY-DEMO: typed quote numbers are kept as text until they are valid, so a half-typed
 * "2." or a stray letter can never reach the money calculation (which refuses it by throwing). */
export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const QUANTITY = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/u;
const DISCOUNT = /^(?:0|[1-9]\d?)(?:\.\d{1,4})?$|^100(?:\.0{1,4})?$/u;
const MAX_RATE_PENCE = 1_000_000_000_000n;

export function parseQuantityText(text: string): Parsed<string | null> {
  const value = text.trim();
  if (value === "") return { ok: true, value: null };
  return QUANTITY.test(value) ? { ok: true, value } : { ok: false, message: "Enter a quantity such as 1 or 2.5 (no minus signs or commas)." };
}
export function parseDiscountText(text: string): Parsed<string> {
  const value = text.trim();
  if (value === "") return { ok: true, value: "0" };
  return DISCOUNT.test(value) ? { ok: true, value } : { ok: false, message: "Enter a discount from 0 to 100, such as 5 or 12.5." };
}
/** Pounds, optionally with a £ sign and correctly grouped thousands ("1,250.50"). */
export function parseRateText(text: string): Parsed<number | null> {
  let value = text.trim().replace(/^£\s*/u, "");
  if (value === "") return { ok: true, value: null };
  if (/^[1-9]\d{0,2}(?:,\d{3})+(?:\.\d{1,2})?$/u.test(value)) value = value.replaceAll(",", "");
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/u.exec(value);
  if (!match) return { ok: false, message: "Enter pounds and pence, such as 1250 or 1,250.50." };
  const pence = BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return pence <= MAX_RATE_PENCE ? { ok: true, value: Number(pence) } : { ok: false, message: "That rate is too large. Check it." };
}
export const penceText = (pence: number | null) => pence === null ? "" : `${Math.floor(pence / 100)}.${String(pence % 100).padStart(2, "0")}`;

/** A text box that commits only valid values and shows a plain message for the rest. */
export function NumberField<T>({ label, value, show, parse, commit, onValidity, disabled, inputMode = "decimal" }: {
  label: string; value: T; show: (value: T) => string; parse: (text: string) => Parsed<T>;
  commit: (value: T) => void; onValidity: (valid: boolean) => void; disabled?: boolean; inputMode?: "decimal" | "numeric";
}) {
  const [text, setText] = useState(() => show(value)), [message, setMessage] = useState("");
  const last = useRef(value);
  // Follow outside changes (a reload of the saved quote) without fighting the person typing.
  useEffect(() => {
    if (Object.is(value, last.current)) return;
    last.current = value;
    const current = parse(text);
    if (!current.ok || !Object.is(current.value, value)) { setText(show(value)); setMessage(""); onValidity(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <><input aria-label={label} inputMode={inputMode} value={text} disabled={disabled} aria-invalid={message ? true : undefined}
    onFocus={e => e.target.select()}
    onChange={e => {
      const next = e.target.value, parsed = parse(next);
      setText(next);
      if (parsed.ok) { setMessage(""); onValidity(true); last.current = parsed.value; commit(parsed.value); }
      else { setMessage(parsed.message); onValidity(false); }
    }}/>{message && <small role="alert" className="field-error">{message}</small>}</>;
}
