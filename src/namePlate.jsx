// Name plates: layout, live preview and xTool (SVG) export.
// Fonts are pre-converted glyph outlines in /public/fonts/np-*.json, so the
// downloaded SVG is pure shapes — xTool Studio needs no fonts installed.
import React, { useState, useEffect } from "react";

export const PLATES = {
  large: { label: "Large", W: 180, H: 90, iw: 160, ih: 70 },
  baby: { label: "Baby", W: 125, H: 59, iw: 113, ih: 47 },
};
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
export const defaultPlate = (a = {}) => ({ show: { name: true, dates: true, message: !!a.plateWording }, message: a.plateWording || "", font: "times", size: "large" });

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
const titleCase = t => t.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (a, b, c) => b + c.toUpperCase());

export const LINES = [["name", "Name"], ["dates", "Dates"], ["message", "Message"]];
export const lineFonts = v => Object.fromEntries(LINES.map(([k]) => [k, (v && v.fonts && v.fonts[k]) || (v && v.font) || "times"]));
// The font file each line uses within its family
const faceFor = (set, k) => (set.F.script ? set.reg : k === "name" ? set.bold : k === "message" ? set.ital : set.reg);
export function plateLayout(spec, sets) {
  const P = PLATES[spec.size] || PLATES.large, k = P.ih / 70, m = 5 * k, max = P.iw - 2 * m, maxH = P.ih - 2 * m;
  const sc = !!sets.name.F.script, nameF = faceFor(sets.name, "name"), dF = faceFor(sets.dates, "dates"), msgF = faceFor(sets.message, "message");
  const nameSz = (sc ? 13 : 11) * k, smSz = s => (s.F.script ? 7.5 : 6) * k, gap = 3.2 * k;
  const fit = (f, t, sz) => { const w = advance(f, t, sz); return w > max ? (sz * max) / w : sz; };
  const split = t => { const w = t.split(/\s+/); let bi = 1, bd = 1e9; for (let i = 1; i < w.length; i++) { const d = Math.abs(w.slice(0, i).join(" ").length - w.slice(i).join(" ").length); if (d < bd) { bd = d; bi = i; } } return [w.slice(0, bi).join(" "), w.slice(bi).join(" ")]; };
  const lines = [];
  const add = (f, t, sz0) => {
    const sz = fit(f, t, sz0);
    if (sz < sz0 * 0.9 && /\s/.test(t)) { const [a, b] = split(t); const s2 = Math.min(fit(f, a, sz0), fit(f, b, sz0)); lines.push({ f, t: a, sz: s2 }, { f, t: b, sz: s2 }); }
    else lines.push({ f, t, sz });
  };
  const sh = spec.show || {};
  const name = [spec.firstName, spec.lastName].filter(Boolean).join(" ").trim().replace(/\s+/g, " ");
  if (sh.name && name) add(nameF, sc ? titleCase(name) : name.toUpperCase(), nameSz);
  const d1 = npDate(spec.dob), d2 = npDate(spec.dod);
  if (sh.dates && (d1 || d2)) add(dF, d1 && d2 ? `${d1} – ${d2}` : d1 || d2, smSz(sets.dates));
  const msg = String(spec.message || "").trim();
  if (sh.message && msg) add(msgF, msg, smSz(sets.message));
  let total = lines.reduce((s, l) => s + l.sz, 0) + gap * Math.max(0, lines.length - 1);
  const shrink = total > maxH ? maxH / total : 1;
  lines.forEach(l => (l.sz *= shrink)); total *= shrink;
  let y = (P.H - P.ih) / 2 + P.ih / 2 - total / 2;
  lines.forEach(l => { y += l.sz; l.w = advance(l.f, l.t, l.sz); l.x = P.W / 2 - l.w / 2; l.y = y - l.sz * 0.18; y += gap * shrink; });
  return { P, lines };
}

export function plateSvg(spec, sets, { preview = false, guide = true } = {}) {
  const { P, lines } = plateLayout(spec, sets), ix = (P.W - P.iw) / 2, iy = (P.H - P.ih) / 2;
  const d = lines.map(l => textPath(l.f, l.t, l.sz, l.x, l.y)).join("");
  if (preview) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${P.W} ${P.H}" width="100%"><rect x=".5" y=".5" width="${P.W - 1}" height="${P.H - 1}" rx="2" fill="#d1d5db" stroke="#6b7280" stroke-width=".6"/><rect x="${ix}" y="${iy}" width="${P.iw}" height="${P.ih}" fill="#eef0f3" stroke="#374151" stroke-width=".4" stroke-dasharray="2 1.2"/><path d="${d}" fill="#111827"/></svg>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${P.W}mm" height="${P.H}mm" viewBox="0 0 ${P.W} ${P.H}">\n` +
    (guide ? `<g id="PLATE-OUTLINE-do-not-engrave" fill="none" stroke="#ff0000" stroke-width="0.2"><rect x="0" y="0" width="${P.W}" height="${P.H}"/><rect x="${ix}" y="${iy}" width="${P.iw}" height="${P.ih}"/></g>\n` : "") +
    `<g id="ENGRAVE"><path d="${d}" fill="#000000"/></g>\n</svg>\n`;
}

export function downloadPlate(spec, sets, guide) {
  const name = ([spec.lastName, spec.firstName].filter(Boolean).join("_") || "NamePlate").replace(/[^A-Za-z0-9_]/g, "_");
  const blob = new Blob([plateSvg(spec, sets, { guide })], { type: "image/svg+xml" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `NamePlate_${name}_${(PLATES[spec.size] || PLATES.large).label}${guide ? "" : "_text-only"}.svg`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function useFontSets(spec) {
  const ids = lineFonts(spec), key = LINES.map(([k]) => ids[k]).join("|");
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
  return <div dangerouslySetInnerHTML={{ __html: plateSvg(spec, sets, { preview: true }) }} />;
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
  return (
    <div className="space-y-4">
      <div>
        <span className={lbl}>Show on the plate</span>
        <div className="flex flex-wrap gap-2">
          {[["name", "Name"], ["dates", "Dates"], ["message", "Message"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => set({ show: { ...v.show, [k]: !v.show?.[k] } })} className={chip(!!v.show?.[k])}>{box(!!v.show?.[k])}{l}</button>
          ))}
        </div>
      </div>
      {v.show?.message && <div>
        <label className={lbl} htmlFor="np-msg">Message</label>
        <input id="np-msg" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-gray-900" maxLength={80} value={v.message || ""} onChange={e => set({ message: e.target.value })} placeholder="e.g. Forever in our hearts" />
      </div>}
      <div>
        <span className={lbl}>Plate size</span>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PLATES).map(([k, p]) => <button key={k} type="button" onClick={() => set({ size: k })} className={chip(v.size === k)}>{p.label} <span className="font-bold opacity-70">{p.W}×{p.H} mm</span></button>)}
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
      <div className="bg-gray-50 rounded-xl p-3">
        <span className={lbl}>Preview — to scale</span>
        <NamePlatePreview spec={spec} />
        {!spec.firstName && !spec.lastName && <p className="text-xs text-gray-500 mt-2">The name and dates appear once the deceased's details are filled in.</p>}
      </div>
    </div>
  );
}

// Job Sheet: staff check the plate and download it for xTool Studio
export function NamePlateModal({ c, plate, onClose }) {
  const [v, setV] = useState(plate || defaultPlate({}));
  const person = { firstName: c.firstName, lastName: c.lastName, dob: c.dob, dod: c.dod };
  const spec = { ...v, ...person };
  const [sets] = useFontSets(spec);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl p-5 my-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div><div className="text-xs font-black uppercase tracking-widest text-gray-500">Name Plate · {c.caseRef}</div>
            <div className="text-lg font-black">{(c.lastName || "").toUpperCase()}, {c.firstName}</div>
            <div className="text-xs text-gray-500">{plate ? "From the funeral director's 2nd Note — you can adjust it here." : "No name plate on the 2nd Note — set it up here."}</div></div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-2xl leading-none text-gray-400 hover:text-gray-900 px-2">×</button>
        </div>
        <NamePlateEditor value={v} onChange={setV} person={person} />
        <div className="grid sm:grid-cols-2 gap-2 mt-5">
          <button type="button" disabled={!sets} onClick={() => downloadPlate(spec, sets, true)} className="py-4 rounded-xl bg-gray-900 text-white font-black uppercase text-sm disabled:opacity-40 hover:bg-gray-700">⬇ Download for xTool</button>
          <button type="button" disabled={!sets} onClick={() => downloadPlate(spec, sets, false)} className="py-4 rounded-xl border-2 border-gray-900 font-black uppercase text-sm disabled:opacity-40 hover:bg-gray-50">⬇ Text only</button>
        </div>
        <p className="text-xs text-gray-500 mt-3">In xTool Studio: open the SVG. The red plate outline is only there to line it up — set it to <b>not output</b> (or use <b>Text only</b>). Engrave the black text.</p>
      </div>
    </div>
  );
}
