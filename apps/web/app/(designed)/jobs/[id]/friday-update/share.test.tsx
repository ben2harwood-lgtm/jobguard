import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FridayShare } from "./share";
import { shareTargets } from "./share-targets";

const notice = "Practice sandbox — synthetic data; nothing is sent or charged";
const message = `${notice}\nYour Friday update\nThis week\nTiling finished.`;

describe("Friday share targets", () => {
  it("offers native sharing when the browser can share the text", () => {
    expect(shareTargets(message, true)).toEqual({ text: message, showShare: true, showFallback: false,
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(message)}` });
  });
  it("offers copy and recipient-free WhatsApp when native sharing is unavailable", () => {
    const targets = shareTargets(message, false)!;
    expect(targets.showShare).toBe(false);
    expect(targets.showFallback).toBe(true);
    const url = new URL(targets.whatsappUrl);
    expect(url.origin + url.pathname).toBe("https://wa.me/");
    expect([...url.searchParams.keys()]).toEqual(["text"]);
    expect(url.searchParams.get("text")).toBe(message);
  });
  it("preserves long text without truncation", () => {
    const long = `${notice}\n${"Scheduled work and next steps.\n".repeat(1000)}`;
    const targets = shareTargets(long, false)!;
    expect(targets.text).toBe(long);
    expect(new URL(targets.whatsappUrl).searchParams.get("text")).toBe(long);
  });
  it("encodes emoji, pounds, newlines and URL punctuation exactly once", () => {
    const special = `${notice}\nDone 🧱 £120 & 50% + next? #1`;
    const targets = shareTargets(special, false)!;
    expect(targets.whatsappUrl).toContain("%F0%9F%A7%B1%20%C2%A3120%20%26%2050%25%20%2B");
    expect(new URL(targets.whatsappUrl).searchParams.get("text")).toBe(special);
  });
  it.each([true, false])("keeps the practice notice on every target (native=%s)", canShare => {
    const targets = shareTargets(message, canShare)!;
    expect(targets.text.split("\n")[0]).toBe(notice);
    expect(new URL(targets.whatsappUrl).searchParams.get("text")?.split("\n")[0]).toBe(notice);
    expect(shareTargets(message.replace(`${notice}\n`, ""), canShare)).toBeNull();
    expect(shareTargets(`Your Friday update\n${notice}`, canShare)).toBeNull();
  });
  it.each([true, false])("has no targets before sending (native=%s)", canShare => {
    expect(shareTargets(null, canShare)).toBeNull();
    expect(shareTargets("", canShare)).toBeNull();
  });
});

describe("FridayShare rendering", () => {
  it.each([undefined, null, ""])("shows nothing without sentAt (%s), even with prepared text", sentAt => {
    expect(renderToStaticMarkup(<FridayShare message={message} sentAt={sentAt}/>)).toBe("");
  });
  it("renders a safe fallback for a sent snapshot without depending on browser globals", () => {
    const html = renderToStaticMarkup(<FridayShare message={message} sentAt="2026-11-25T16:00:00Z"/>);
    expect(html).toContain("Copy text");
    expect(html).toContain("Open WhatsApp");
    expect(html).toContain(`href="https://wa.me/?text=${encodeURIComponent(message)}"`);
    expect(html).toContain('target="_blank" rel="noreferrer"');
  });
  it("refuses a sent snapshot whose practice notice was stripped", () => {
    expect(renderToStaticMarkup(<FridayShare message="Tiling finished." sentAt="2026-11-25T16:00:00Z"/>)).toBe("");
  });
});
