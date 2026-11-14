// Name plates: layout, live preview and xTool (SVG) export.
// Fonts are pre-converted glyph outlines in /public/fonts/np-*.json, so the
// downloaded SVG is pure shapes — xTool Studio needs no fonts installed.
import React, { useState, useEffect } from "react";

export const PLATES = {
  large: { label: "Large", W: 180, H: 90, iw: 160, ih: 70 },
  baby: { label: "Baby", W: 125, H: 59, iw: 113, ih: 47 },
  // Hand etched on the manual machine (not xTool): Times, name and age only
  europag: { label: "Europag Brass", W: 165, H: 145, iw: 115, ih: 70, manual: true },
};
export const npAge = (dob, dod) => { const a = String(dob || "").match(/^(\d{4})-(\d{2})-(\d{2})/), b = String(dod || "").match(/^(\d{4})-(\d{2})-(\d{2})/); if (!a || !b) return ""; let y = +b[1] - +a[1]; if (+b[2] < +a[2] || (+b[2] === +a[2] && +b[3] < +a[3])) y--; return y >= 0 ? y : ""; };
export const NP_FONTS = [
  { id: "times", label: "Times", reg: "times-regular", bold: "times-bold", ital: "times-italic" },
  { id: "greatvibes", label: "Great Vibes", script: true, reg: "greatvibes" },
  { id: "century", label: "Century", reg: "century-regular", bold: "century-bold", ital: "century-italic" },
  { id: "bookman", label: "Bookman", reg: "bookman-regular", bold: "bookman-bold", ital: "bookman-italic" },
  { id: "helvetica", label: "Helvetica", reg: "helvetica-regular", bold: "helvetica-bold", ital: "helvetica-italic" },
  { id: "chancery", label: "Script", script: true, reg: "chancery" },
];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const npDate = iso => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : ""; };
export const defaultPlate = (a = {}) => ({ show: { name: true, dates: true, message: !!a.plateWording }, message: a.plateWording || "", font: "times", size: /europag|brass/i.test(a.plateColour || "") ? "europag" : "large", finish: /europag|brass/i.test(a.plateColour || "") ? "brass" : /gold/i.test(a.plateColour || "") ? "gold" : "silver" });
// Photos of the real plates; panel = the flat engraving area in photo pixels
export const FINISHES = {
  silver: { label: "Silver", src: "/plates/silver.jpg", w: 784, h: 369, panel: [80, 44, 722, 300], ink: "#2a2a2a" },
  gold: { label: "Gold", src: "/plates/gold.jpg", w: 775, h: 371, panel: [80, 48, 712, 300], ink: "#3a2a10" },
  brass: { label: "Europag Brass", src: "/plates/europag.jpg", w: 461, h: 390, panel: [93, 103, 382, 270], ink: "#3a2a10", size: "europag" },
};

const cache = {};
const loadGlyphs = n => (cache[n] = cache[n] || fetch(`/fonts/np-${n}.json`).then(r => { if (!r.ok) throw new Error("font " + n); return r.json(); }).catch(e => { delete cache[n]; throw e; }));
export async function loadFontSet(id) {
  const F = NP_FONTS.find(f => f.id === id) || NP_FONTS[0];
  const [reg, bold, ital] = await Promise.all([F.reg, F.bold || F.reg, F.ital || F.reg].map(loadGlyphs));
  return { F, reg, bold, ital };
}

const glyph = (font, ch) => font.g[ch] || font.g["?"] || [font.upm * 0.5, ""];
function advance(font, t, sz) {
  let w = 0;
  for (let j = 0; j < t.length; j++) { w += glyph(font, t[j])[0]; if (j < t.length - 1) w += font.k[t[j] + t[j + 1]] || 0; }
  return (w * sz) / font.upm;
}
// Bake absolute path commands (M L H V Q C Z) to plate millimetres.
function bake(d, s, ox, oy) {
  const tok = d.match(/[MLHVQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || []; let out = "", i = 0, cmd = "";
  const X = v => (ox + v * s).toFixed(3), Y = v => (oy + v * s).toFixed(3);
  while (i < tok.length) {
    if (/[A-Z]/i.test(tok[i])) { cmd = tok[i++]; out += cmd; if (cmd === "Z" || cmd === "z") continue; }
    const n = () => parseFloat(tok[i++]);
    if (cmd === "H") out += X(n()) + " ";
    else if (cmd === "V") out += Y(n()) + " ";
    else { const pairs = cmd === "Q" ? 2 : cmd === "C" ? 3 : 1; for (let p = 0; p < pairs; p++) { const x = n(), y = n(); out += X(x) + " " + Y(y) + " "; } }
  }
  return out;
}
function textPath(font, t, sz, x, y) {
  const s = sz / font.upm; let cx = 0, d = "";
  for (let j = 0; j < t.length; j++) {
    const g = glyph(font, t[j]);
    if (g[1]) d += bake(g[1], s, x + cx * s, y);
    cx += g[0] + (j < t.length - 1 ? font.k[t[j] + t[j + 1]] || 0 : 0);
  }
  return d;
}
// Line 1: tick which parts of the name go on the plate. First name(s) field = first name + any middle names.
export const nameParts = (first, last) => { const w = String(first || "").trim().split(/\s+/).filter(Boolean); return { first: w[0] || "", middle: w.slice(1).join(" "), last: String(last || "").trim() }; };
export const plateName = (spec) => { const p = nameParts(spec.firstName, spec.lastName), on = spec.nameParts || { first: true, middle: false, last: true };
  return [on.first !== false && p.first, on.middle && p.middle, on.last !== false && p.last].filter(Boolean).join(" ").replace(/\s+/g, " "); };
const titleCase = t => t.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (a, b, c) => b + c.toUpperCase());

export const LINES = [["name", "Name"], ["dates", "Dates"], ["message", "Message"]];
export const lineFonts = v => Object.fromEntries(LINES.map(([k]) => [k, (v && v.fonts && v.fonts[k]) || (v && v.font) || "times"]));
// The font file each line uses within its family
const faceFor = (set, k) => (set.F.script ? set.reg : k === "name" ? set.bold : k === "message" ? set.ital : set.reg);
export function plateLayout(spec, sets) {
  const P = PLATES[spec.size] || PLATES.large, k = P.ih / 70, m = 5 * k, max = P.iw - 2 * m, maxH = P.ih - 2 * m;
  const sc = !!sets.name.F.script, nameF = faceFor(sets.name, "name"), dF = faceFor(sets.dates, "dates"), msgF = spec.msgItalic === false ? sets.message.reg : faceFor(sets.message, "message");
  const nameSz = (sc ? 13 : 11) * k, smSz = s => (s.F.script ? 7.5 : 6) * k, gap = 3.2 * k;
  const fit = (f, t, sz) => { const w = advance(f, t, sz); return w > max ? (sz * max) / w : sz; };
  const split = t => { const w = t.split(/\s+/); let bi = 1, bd = 1e9; for (let i = 1; i < w.length; i++) { const d = Math.abs(w.slice(0, i).join(" ").length - w.slice(i).join(" ").length); if (d < bd) { bd = d; bi = i; } } return [w.slice(0, bi).join(" "), w.slice(bi).join(" ")]; };
  const lines = [];
  if (P.manual) { spec = { ...spec, show: { name: true, age: true } }; }
  const add = (f, t, sz0) => {
    const sz = fit(f, t, sz0);
    if (sz < sz0 * 0.9 && /\s/.test(t)) { const [a, b] = split(t); const s2 = Math.min(fit(f, a, sz0), fit(f, b, sz0)); lines.push({ f, t: a, sz: s2 }, { f, t: b, sz: s2 }); }
    else lines.push({ f, t, sz });
  };
  const sh = spec.show || {};
  const name = plateName(spec);
  if (P.manual) {
    if (name) add(sets.name.reg, name.toUpperCase(), nameSz);
    const age = npAge(spec.dob, spec.dod);
    if (age !== "") add(sets.name.reg, `${age} YEARS`, 7 * k);
  } else {
  if (sh.name && name) add(nameF, sc ? titleCase(name) : name.toUpperCase(), nameSz);
  const nameW = Math.max(0, ...lines.map(l => advance(l.f, l.t, l.sz)));
  // Line 2: born – died dates, or the age ("89 years")
  const d1 = npDate(spec.dob), d2 = npDate(spec.dod), age = npAge(spec.dob, spec.dod);
  if (sh.dates) { if (spec.dateMode === "age" && age !== "") add(dF, `${age} YEARS`, smSz(sets.dates) * 1.4); else if (d1 || d2) add(dF, d1 && d2 ? `${d1} – ${d2}` : d1 || d2, smSz(sets.dates)); }
  // Message: words wrap so no line is wider than 3/4 of the name above it
  const msgs = [spec.message, spec.message2].map(x => String(x || "").trim()).filter(Boolean);
  if (sh.message && msgs.length) {
    const sz0 = smSz(sets.message), wrapW = 0.75 * (nameW || max), out = [];
    msgs.forEach(m => { let cur = "";
      m.split(/\s+/).forEach(w => { const t = cur ? cur + " " + w : w; if (cur && advance(msgF, t, sz0) > wrapW) { out.push(cur); cur = w; } else cur = t; });
      if (cur) out.push(cur); });
    const sz = Math.min(sz0, ...out.map(t => { const w = advance(msgF, t, sz0); return w > wrapW ? (sz0 * wrapW) / w : sz0; }));
    out.forEach(t => lines.push({ f: msgF, t, sz }));
  }
  }
  let total = lines.reduce((s, l) => s + l.sz, 0) + gap * Math.max(0, lines.length - 1);
  const shrink = total > maxH ? maxH / total : 1;
  lines.forEach(l => (l.sz *= shrink)); total *= shrink;
  let y = (P.H - P.ih) / 2 + P.ih / 2 - total / 2;
  lines.forEach(l => { y += l.sz; l.w = advance(l.f, l.t, l.sz); l.x = P.W / 2 - l.w / 2; l.y = y - l.sz * 0.18; y += gap * shrink; });
  return { P, lines };
}

export function plateSvg(spec, sets, { preview = false, guide = true, photo = false } = {}) {
  const { P, lines } = plateLayout(spec, sets), ix = (P.W - P.iw) / 2, iy = (P.H - P.ih) / 2;
  const d = lines.map(l => textPath(l.f, l.t, l.sz, l.x, l.y)).join("");
  if (photo) {
    const F = FINISHES[spec.finish] || FINISHES.silver, [x1, y1, x2, y2] = F.panel, pw = x2 - x1, ph = y2 - y1, k = Math.min(pw / P.iw, ph / P.ih);
    const tx = x1 + (pw - P.iw * k) / 2 - ix * k, ty = y1 + (ph - P.ih * k) / 2 - iy * k;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${F.w} ${F.h}" width="100%"><image href="${F.src}" x="0" y="0" width="${F.w}" height="${F.h}"/><g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})"><path d="${d}" fill="#ffffff" opacity=".45" transform="translate(0 .22)"/><path d="${d}" fill="${F.ink}" opacity=".9"/></g></svg>`;
  }
  if (preview) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${P.W} ${P.H}" width="100%"><rect x=".5" y=".5" width="${P.W - 1}" height="${P.H - 1}" rx="2" fill="#d1d5db" stroke="#6b7280" stroke-width=".6"/><rect x="${ix}" y="${iy}" width="${P.iw}" height="${P.ih}" fill="#eef0f3" stroke="#374151" stroke-width=".4" stroke-dasharray="2 1.2"/><path d="${d}" fill="#111827"/></svg>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${P.W}mm" height="${P.H}mm" viewBox="0 0 ${P.W} ${P.H}">\n` +
    (guide ? `<g id="PLATE-OUTLINE-do-not-engrave" fill="none" stroke="#ff0000" stroke-width="0.2"><rect x="0" y="0" width="${P.W}" height="${P.H}"/><rect x="${ix}" y="${iy}" width="${P.iw}" height="${P.ih}"/></g>\n` : "") +
    `<g id="ENGRAVE"><path d="${d}" fill="#000000"/></g>\n</svg>\n`;
}

export function downloadPlate(spec, sets, guide) {
  const name = ([spec.lastName, spec.firstName].filter(Boolean).join("_") || "NamePlate").replace(/[^A-Za-z0-9_]/g, "_");
  const blob = new Blob([plateSvg(spec, sets, { guide })], { type: "image/svg+xml" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `NamePlate_${name}_${(PLATES[spec.size] || PLATES.large).label}${guide ? "_with-outline-LINING-UP-ONLY" : ""}.svg`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// Hand-etch sheet: A4 PDF with the plate drawn at actual size
export async function downloadEtchPdf(spec, sets, c) {
  const { PDFDocument, rgb, StandardFonts } = await import("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js");
  const { P, lines } = plateLayout(spec, sets), MM = 72 / 25.4;
  const doc = await PDFDocument.create(); const page = doc.addPage([595.28, 841.89]); const H = 841.89;
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const T = v => String(v ?? "").replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
  const txt = (t, x, y, o = {}) => page.drawText(T(t), { x: x * MM, y: H - y * MM, size: o.size || 10, font: o.bold ? fb : f, color: o.grey ? rgb(.4, .4, .4) : rgb(0, 0, 0) });
  txt("NAME PLATE - HAND ETCH", 15, 18, { bold: true, size: 16 });
  txt("Europag Brass 165 x 145 mm - engraving panel 115 x 70 mm - Times New Roman", 15, 25, { grey: true });
  txt(`${(c?.lastName || "").toUpperCase()}, ${c?.firstName || ""}   ${c?.caseRef || ""}   ${c?.funeralHomeName || ""}`, 15, 32, { bold: true, size: 11 });
  txt("Etch on the manual machine (not xTool). Print at 100% / Actual size - do not scale to fit.", 15, 39, { grey: true, size: 9 });
  const x0 = (210 - P.W) / 2, y0 = 52, ix = (P.W - P.iw) / 2, iy = (P.H - P.ih) / 2;
  page.drawRectangle({ x: x0 * MM, y: H - (y0 + P.H) * MM, width: P.W * MM, height: P.H * MM, borderColor: rgb(.75, .75, .75), borderWidth: .6, borderDashArray: [4, 3] });
  page.drawRectangle({ x: (x0 + ix) * MM, y: H - (y0 + iy + P.ih) * MM, width: P.iw * MM, height: P.ih * MM, borderColor: rgb(.2, .2, .2), borderWidth: .8 });
  const d = lines.map(l => textPath(l.f, l.t, l.sz, l.x, l.y)).join("");
  if (d) page.drawSvgPath(d, { x: x0 * MM, y: H - y0 * MM, scale: MM, color: rgb(0, 0, 0) });
  const ly = y0 + P.H + 12; txt("WORDING", 15, ly, { bold: true, size: 9, grey: true });
  lines.forEach((l, i) => txt(`Line ${i + 1}:  ${l.t}`, 15, ly + 7 + i * 7, { size: 12 }));
  txt(`Prepared ${new Date().toLocaleString("en-AU")}`, 15, 285, { grey: true, size: 8 });
  const bytes = await doc.save(), blob = new Blob([bytes], { type: "application/pdf" });
  const name = ([spec.lastName, spec.firstName].filter(Boolean).join("_") || "NamePlate").replace(/[^A-Za-z0-9_]/g, "_");
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `NamePlate_${name}_Europag_HandEtch.pdf`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function useFontSets(spec) {
  const ids = spec.size === "europag" ? { name: "times", dates: "times", message: "times" } : lineFonts(spec), key = LINES.map(([k]) => ids[k]).join("|");
  const [sets, setSets] = useState(null); const [err, setErr] = useState("");
  useEffect(() => { let live = true; setErr("");
    Promise.all(LINES.map(([k]) => loadFontSet(ids[k]))).then(r => live && setSets({ key, name: r[0], dates: r[1], message: r[2] })).catch(() => live && setErr("Font couldn't load"));
    return () => { live = false; }; }, [key]);
  return [sets && sets.key === key ? sets : null, err];
}
const SAMPLE = { name: ["THOMPSON", "Thompson"], dates: ["2 March 1939", "2 March 1939"], message: ["Forever", "Forever"] };
function FontTile({ f, line = "name", on, onPick }) {
  const [svg, setSvg] = useState(""); const [gone, setGone] = useState(false);
  useEffect(() => { let live = true; loadGlyphs(f.script ? f.reg : line === "name" ? f.bold : line === "message" ? f.ital : f.reg).then(font => {
    const t = SAMPLE[line][f.script ? 1 : 0], sz = 10, w = advance(font, t, sz);
    if (live) setSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-2} ${-sz} ${w + 4} ${sz * 1.35}" height="24" style="max-width:100%"><path d="${textPath(font, t, sz, 0, 0)}" fill="#111827"/></svg>`);
  }).catch(() => live && setGone(true)); return () => { live = false; }; }, [f.id, line]);
  if (gone) return null;
  return (
    <button type="button" onClick={onPick} className={"rounded-xl border-2 px-2 py-2 flex flex-col items-center justify-center min-h-[58px] min-w-0 transition " + (on ? "border-gray-900 ring-2 ring-gray-200 bg-gray-50" : "border-gray-200 hover:border-gray-500")}>
      <span className="h-6 flex items-center max-w-full overflow-hidden" dangerouslySetInnerHTML={{ __html: svg || `<span style="font-size:12px;color:#9ca3af">…</span>` }} />
      <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1">{f.label}</span>
    </button>
  );
}

export function NamePlatePreview({ spec }) {
  const [sets, err] = useFontSets(spec);
  if (err) return <p className="text-xs text-red-600">{err} — check your connection and try again.</p>;
  if (!sets) return <div className="aspect-[2/1] rounded-lg bg-gray-100 animate-pulse" />;
  return <div dangerouslySetInnerHTML={{ __html: plateSvg(spec, sets, { preview: true, photo: true }) }} />;
}

// The editor used in every 2nd Note (and on the Job Sheet for staff)
export function NamePlateEditor({ value, onChange, person }) {
  const v = value || defaultPlate(person);
  const set = patch => onChange({ ...v, ...patch });
  const chip = on => "flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-black transition " + (on ? "bg-gray-900 border-gray-900 text-white" : "bg-white border-gray-200 text-gray-700 hover:border-gray-700");
  const box = on => <span className={"w-4 h-4 rounded border-2 border-current flex items-center justify-center text-[10px]"}>{on ? "✓" : ""}</span>;
  const spec = { ...v, firstName: person?.firstName, lastName: person?.lastName, dob: person?.dob, dod: person?.dod };
  const lbl = "block text-xs font-black uppercase tracking-widest text-gray-500 mb-2";
  const fonts = lineFonts(v);
  const manual = !!(PLATES[v.size] || {}).manual;
  return (
    <div className="space-y-4">
      {!manual && <><div>
        <span className={lbl}>Show on the plate</span>
        <div className="flex flex-wrap gap-2">
          {[["name", "Name"], ["dates", "Dates / age"], ["message", "Message"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => set({ show: { ...v.show, [k]: !v.show?.[k] } })} className={chip(!!v.show?.[k])}>{box(!!v.show?.[k])}{l}</button>
          ))}
        </div>
      </div>
      {v.show?.name && (() => { const p = nameParts(person?.firstName, person?.lastName), on = v.nameParts || { first: true, middle: false, last: true };
        const tog = k => set({ nameParts: { ...on, [k]: !(on[k] !== false && (k !== "middle" || on.middle)) } });
        const opts = [["first", "First name", p.first, on.first !== false], ["middle", "Middle names", p.middle, !!on.middle], ["last", "Last name", p.last, on.last !== false]].filter(o => o[0] !== "middle" || o[2]);
        return <div><span className={lbl}>Line 1 — name</span><div className="flex flex-wrap gap-2">
          {opts.map(([k, l, val, is]) => <button key={k} type="button" onClick={() => tog(k)} className={chip(is)}>{box(is)}{l}{val ? <span className="font-bold opacity-70">{val}</span> : null}</button>)}</div></div>; })()}
      {v.show?.dates && <div><span className={lbl}>Line 2</span><div className="flex flex-wrap gap-2">
        {[["dates", "Date of birth – date of death"], ["age", `Age${npAge(person?.dob, person?.dod) !== "" ? " (" + npAge(person?.dob, person?.dod) + " YEARS)" : ""}`]].map(([k, l]) => { const is = (v.dateMode || "dates") === k;
          return <button key={k} type="button" onClick={() => set({ dateMode: k })} className={chip(is)}><span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center">{is ? <span className="w-2 h-2 rounded-full bg-current" /> : null}</span>{l}</button>; })}</div>
        {v.dateMode === "age" && npAge(person?.dob, person?.dod) === "" && <p className="text-xs text-amber-700 mt-1">The age shows once both the date of birth and date of death are filled in.</p>}</div>}
      {v.show?.message && <div>
        <label className={lbl} htmlFor="np-msg">Message line 1</label>
        <input id="np-msg" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-gray-900" maxLength={80} value={v.message || ""} onChange={e => set({ message: e.target.value })} placeholder="e.g. Forever in our hearts" />
        <label className={lbl + " mt-3 block"} htmlFor="np-msg2">Message line 2 <span className="normal-case font-bold text-gray-400">(optional)</span></label>
        <input id="np-msg2" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-gray-900" maxLength={80} value={v.message2 || ""} onChange={e => set({ message2: e.target.value })} placeholder="e.g. Loved and remembered always" />
        <p className="text-xs text-gray-500 mt-1">The message wraps onto more lines by itself, no wider than ¾ of the name. Check the preview.</p>
        {!(NP_FONTS.find(f => f.id === lineFonts(v).message) || {}).script && <div className="flex flex-wrap gap-2 mt-3">
          {[[true, "Italic"], [false, "Not italic"]].map(([it, l]) => { const is = (v.msgItalic !== false) === it;
            return <button key={l} type="button" onClick={() => set({ msgItalic: it })} className={chip(is)}><span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center">{is ? <span className="w-2 h-2 rounded-full bg-current" /> : null}</span><span className={it ? "italic" : ""}>{l}</span></button>; })}
        </div>}
      </div>}</>}
      <div>
        <span className={lbl}>Plate colour</span>
        <div className="flex flex-wrap gap-2">
          {Object.entries(FINISHES).map(([k, f]) => <button key={k} type="button" onClick={() => set({ finish: k, size: f.size || (v.size === "europag" ? "large" : v.size || "large") })} className={chip((v.finish || "silver") === k)}><span className={"w-4 h-4 rounded-full border border-black/20 " + (k === "gold" ? "bg-gradient-to-br from-yellow-200 to-amber-500" : k === "brass" ? "bg-gradient-to-br from-amber-100 to-yellow-700" : "bg-gradient-to-br from-gray-100 to-gray-400")} />{f.label}</button>)}
        </div>
      </div>
      {manual && <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 text-sm text-amber-900"><b>Europag Brass — hand etched</b> on the manual machine (not xTool). Times New Roman, the name and age only{npAge(person?.dob, person?.dod) !== "" ? ` (${npAge(person?.dob, person?.dod)} YEARS)` : ""}.</div>}
      {!manual && <><div>
        <span className={lbl}>Plate size</span>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PLATES).filter(([, p]) => !p.manual).map(([k, p]) => <button key={k} type="button" onClick={() => set({ size: k })} className={chip(v.size === k)}>{p.label} <span className="font-bold opacity-70">{p.W}×{p.H} mm</span></button>)}
        </div>
      </div>
      {LINES.filter(([k]) => v.show?.[k]).map(([k, l]) => (
        <div key={k}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className={lbl + " mb-0"}>{l} font</span>
            {LINES.filter(([x]) => v.show?.[x]).length > 1 && <button type="button" onClick={() => set({ fonts: Object.fromEntries(LINES.map(([x]) => [x, fonts[k]])) })} className="text-[11px] font-black uppercase text-gray-500 underline hover:text-gray-900">Use for all lines</button>}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">{NP_FONTS.map(f => <FontTile key={f.id} f={f} line={k} on={fonts[k] === f.id} onPick={() => set({ fonts: { ...fonts, [k]: f.id } })} />)}</div>
        </div>
      ))}
      </>}
      <div className="bg-gray-50 rounded-xl p-3">
        <span className={lbl}>Preview — {(FINISHES[v.finish] || FINISHES.silver).label} {manual ? "" : (PLATES[v.size] || PLATES.large).label + " "}plate</span>
        <NamePlatePreview spec={spec} />
        {!spec.firstName && !spec.lastName && <p className="text-xs text-gray-500 mt-2">The name and dates appear once the deceased's details are filled in.</p>}
      </div>
    </div>
  );
}

// Job Sheet: staff check the plate and download it for xTool Studio
export function NamePlateModal({ c, plate, person: personIn, onClose, onDownloaded }) {
  const [v, setV] = useState(plate || defaultPlate({}));
  const person = personIn || { firstName: c.firstName, lastName: c.lastName, dob: c.dob, dod: c.dod };
  const spec = { ...v, ...person };
  const [sets] = useFontSets(spec);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl p-5 my-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div><div className="text-xs font-black uppercase tracking-widest text-gray-500">Name Plate · {c.caseRef}</div>
            <div className="text-lg font-black">{(c.lastName || "").toUpperCase()}, {c.firstName}</div>
            <div className="text-xs text-gray-500">{plate ? "From the funeral director's 2nd Note — you can adjust it here." : "No name plate on the 2nd Note — set it up here."}</div>
            {c.prep?.namePlate?.at && <div className="text-xs font-black text-green-700 mt-1">✓ Downloaded {new Date(c.prep.namePlate.at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{c.prep.namePlate.by ? " · " + c.prep.namePlate.by : ""}</div>}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-2xl leading-none text-gray-400 hover:text-gray-900 px-2">×</button>
        </div>
        <NamePlateEditor value={v} onChange={setV} person={person} />
        {(PLATES[v.size] || {}).manual ? <>
        <button type="button" disabled={!sets} onClick={async () => { try { await downloadEtchPdf(spec, sets, c); onDownloaded && onDownloaded(v, person); } catch (e) { alert("Couldn't make the PDF: " + e.message); } }} className="w-full mt-5 py-4 rounded-xl bg-gray-900 text-white font-black uppercase text-sm disabled:opacity-40 hover:bg-gray-700">⬇ Download PDF for hand etching</button>
        <p className="text-xs text-gray-500 mt-2">Europag Brass is etched on the manual machine, not the xTool. Print the PDF at 100% (actual size) and follow the wording.</p>
        </> : <>
        <div className="grid sm:grid-cols-2 gap-2 mt-5">
          <button type="button" disabled={!sets} onClick={() => { downloadPlate(spec, sets, false); onDownloaded && onDownloaded(v, person); }} className="py-4 rounded-xl bg-gray-900 text-white font-black uppercase text-sm disabled:opacity-40 hover:bg-gray-700">⬇ Download for xTool</button>
          <button type="button" disabled={!sets} onClick={() => { downloadPlate(spec, sets, true); }} className="py-4 rounded-xl border-2 border-gray-300 text-gray-600 font-black uppercase text-xs disabled:opacity-40 hover:border-gray-900">With plate outline (lining up only)</button>
        </div></>}
        <button type="button" onClick={onClose} className="w-full mt-2 py-3 rounded-xl border-2 border-gray-200 font-black uppercase text-sm text-gray-600 hover:border-gray-900">Done</button>
        {!(PLATES[v.size] || {}).manual && <p className="text-xs text-gray-500 mt-3"><b>Download for xTool</b> is the text only — nothing else gets lasered. In xTool, use File → Import, centre it on the plate and engrave. The outline file is only for checking the layout on screen: don't send it to the laser.</p>}
      </div>
    </div>
  );
}
