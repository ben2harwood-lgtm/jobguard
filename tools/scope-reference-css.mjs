// Usage: node tools/scope-reference-css.mjs <apps/web dir> <reference site dir> <output design.css>
// Scope the approved reference CSS under one wrapper class, fixing the mockup's chosen look
// (hybrid skin, focused density, immersive imagery, restrained glow, original background).
import { createRequire } from "node:module"; import { readFileSync, writeFileSync } from "node:fs"; import { resolve } from "node:path";
const [,, webDir, siteDir, outFile] = process.argv;
const req = createRequire(resolve(webDir, "package.json")); const postcss = req(req.resolve("postcss", { paths: [req.resolve("next/package.json")] }));
const W = ".jgd";
const FIXED = { reference: "approved-hybrid", skin: "hybrid", density: "focused", imagery: "immersive", glow: "restrained", background: "original", "lab-open": "false", "lab-panel": "skins" };
const ROOT_ATTRS = new Set(Object.keys(FIXED));
function splitTop(s, ch = ",") { const out = []; let d = 0, cur = ""; for (const c of s) { if (c === "(" || c === "[") d++; if (c === ")" || c === "]") d--; if (c === ch && d === 0) { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out.map(x => x.trim()).filter(Boolean); }
function attrTrue(a) { const m = a.match(/^\[data-([a-z-]+)(?:([~^*$|]?=)"?([^"\]]*)"?)?\]$/); if (!m) return null; const [, k, op, v] = m; if (!ROOT_ATTRS.has(k)) return null; if (!op) return true; return FIXED[k] === v; }
// Evaluate a compound made only of root attribute tests. Returns true/false, or null if not purely root attrs.
function evalCompound(c) { let rest = c, ok = true; while (rest.length) {
  let m;
  if ((m = rest.match(/^\[[^\]]+\]/))) { const t = attrTrue(m[0]); if (t === null) return null; ok = ok && t; rest = rest.slice(m[0].length); continue; }
  if ((m = rest.match(/^:(is|where|not)\(/))) { let d = 1, i = m[0].length; while (d && i < rest.length) { if (rest[i] === "(") d++; if (rest[i] === ")") d--; i++; } const inner = rest.slice(m[0].length, i - 1); const vals = splitTop(inner).map(evalCompound); if (vals.some(v => v === null)) return null; const any = vals.some(Boolean); ok = ok && (m[1] === "not" ? !any : any); rest = rest.slice(i); continue; }
  return null; } return ok; }
// Existing working tools hosted inside a designed screen sit in .jgd-legacy and keep the app's own styles.
const LEGACY = ":not(.jgd-legacy *)";
function outsideLegacy(sel) {
  if (sel === W || sel.startsWith(W + ":")) return sel;
  const m = sel.match(/((?:::?(?:before|after|placeholder|selection|marker|backdrop|file-selector-button|-webkit-[a-z-]+))+)$/u);
  return m ? sel.slice(0, -m[1].length) + LEGACY + m[1] : sel + LEGACY;
}
function scope(sel) { const r = scopeOnly(sel); return r === null ? null : outsideLegacy(r); }
function scopeOnly(sel) {
  let s = sel.trim(), head = null, m;
  if ((m = s.match(/^(html|:root)((?:\[[^\]]+\]|:(?:is|where|not)\((?:[^()]|\([^()]*\))*\))*)/))) { const v = m[2] ? evalCompound(m[2]) : true; if (v === null) return s.startsWith(":root") ? null : null; if (!v) return null; head = W; s = s.slice(m[0].length); }
  else if ((m = s.match(/^((?:\[data-(?:reference|skin|density|imagery|glow|background|lab-open|lab-panel)[^\]]*\]|:(?:is|where|not)\((?:[^()]|\([^()]*\))*\))+)/))) { const v = evalCompound(m[1]); if (v === false) return null; if (v === true) { head = W; s = s.slice(m[0].length); } }
  if (head) { const t = s.match(/^\s+body\b/); if (t) s = s.slice(t[0].length); else if (s && !/^\s/.test(s)) return head + s; return head + s; }
  if (/^body\b/.test(s)) return W + s.slice(4);
  return W + " " + s;
}
let css = "";
for (const f of ["styles.css", "themes.css", "reference.css", "finish.css", "backgrounds.css"]) {
  const root = postcss.parse(readFileSync(`${siteDir}/${f}`, "utf8"));
  root.walkRules(rule => { if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return; const sels = splitTop(rule.selector).map(scope).filter(Boolean); if (!sels.length) rule.remove(); else rule.selector = [...new Set(sels)].join(","); });
  root.walkAtRules(a => { if (a.name === "media" && !a.nodes?.length) a.remove(); });
  root.walkDecls(d => { d.value = d.value.replace(/url\((['"]?)\.\/assets\//g, "url($1/design/assets/"); });
  css += `/* from ${f} */\n` + root.toString() + "\n";
}
const reset = "/* Undo the app's global element and class rules inside the designed screens; the reference rules below then apply. */\n.jgd :where(:not(svg,svg *,.jgd-legacy,.jgd-legacy *)){all:revert}\n";
writeFileSync(outFile, "/* Generated from the approved JobGuard reference design (site/*.css, 19 Oct 2026), scoped under .jgd. */\n" + reset + css);
console.log(outFile, css.length);
