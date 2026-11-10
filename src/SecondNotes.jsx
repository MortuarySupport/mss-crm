import React, { useState, useEffect, useMemo, useRef } from "react";
import RAW_FORMS from "./secondNoteForms.json";

// Funeral homes that share a layout point at a shared form ("extends") and only
// change their own template PDF, file tag and any field differences.
function resolveForms(raw) {
  const out = {};
  for (const [id, f] of Object.entries(raw)) {
    if (id.startsWith("_")) continue;
    if (!f.extends) { out[id] = f; continue; }
    const base = JSON.parse(JSON.stringify(raw[f.extends]));
    const { extends: _x, fieldOverrides = {}, rowOverrides = {}, nsnaOverrides = {}, ...own } = f;
    const form = { ...base, ...own };
    if (form.nsna) form.nsna = { ...form.nsna, set: { ...form.nsna.set, ...nsnaOverrides } };
    form.sections.forEach(s => s.fields.forEach(fl => Object.assign(fl, fieldOverrides[fl.id] || {})));
    (form.rows || []).forEach((r, i) => Object.assign(r, rowOverrides[i] || {}));
    out[id] = form;
  }
  return out;
}
const FORMS = resolveForms(RAW_FORMS);
import TimeButtons from "./TimeButtons.jsx";
import { NamePlateEditor, defaultPlate } from "./namePlate.jsx";

// ─── 2ND NOTES ────────────────────────────────────────────────────────────────
// Each funeral home has its own form in secondNoteForms.json (fields, PDF
// positions, Job Card mapping) and its blank PDF in /public/forms/.
// Adding a new FD = add a JSON entry + drop their PDF in public/forms.

const INK = [0.05, 0.15, 0.45];
const isEmpty = v => v == null || v === "" || (Array.isArray(v) && v.length === 0);

function fmtDate(iso, style) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (style === "weekday") return new Date(iso + "T12:00:00").toLocaleDateString("en-AU", { weekday: "long" });
  if (style === "day") {
    const wd = new Date(iso + "T12:00:00").toLocaleDateString("en-AU", { weekday: "short" });
    return `${wd} ${d}/${m}/${y}`;
  }
  return `${d}/${m}/${y}`;
}
function fmtTime(t) {
  if (!t) return "";
  let [h, mi] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(mi).padStart(2, "0")}${ap}`;
}
function calcAge(dob, dod) {
  if (!dob || !dod) return "";
  const b = new Date(dob), d = new Date(dod);
  let a = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
  return a >= 0 ? String(a) : "";
}
function allFields(form) { return form.sections.flatMap(s => s.fields); }
function nameOf(a) { return a.deceasedName || [a.firstName, a.lastName].filter(Boolean).join(" "); }
function display(f, v, ans) {
  if (isEmpty(v)) return "";
  if (f.type === "choice" && ans) { const o = f.options.find(o => o.v === v); if (o?.other && ans[f.id + "Other"]) return ans[f.id + "Other"]; }
  if (f.type === "date") return fmtDate(v, f.fmt);
  if (f.type === "time") return fmtTime(v);
  if (f.type === "check") return v ? "Yes" : "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
async function buildPdf(form, answers, submittedAt, editedAt, version) {
  const { PDFDocument, rgb, StandardFonts } = await import("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js");
  const tpl = await fetch(form.template);
  if (!tpl.ok) throw new Error("Form template not found: " + form.template);
  const doc = await PDFDocument.load(await tpl.arrayBuffer());
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  // Multi-page forms: anything with "page": 1 draws on the second page, etc.
  const pages = doc.getPages();
  let page = pages[0];
  const on = p => { page = pages[p || 0] || pages[0]; };
  const H = page.getSize().height;
  const ink = rgb(...INK);

  // All answers print larger than their base size (base + 2, then x1.3 — e.g. 14pt -> 18pt)
  const FONT = 13; // one size for everything written onto the forms
  const text = (s, x, lb, maxW, size = 11) => {
    // Every answer prints at one size (FONT, or the form's own fontSize); it only shrinks if it won't fit its space
    size = Math.min(form.fontSize || FONT, form.maxSize || 99);
    while (size > 7 && font.widthOfTextAtSize(s, size) > maxW) size -= 0.5;
    page.drawText(s, { x, y: H - (lb - 7), size, font, color: ink });
  };
  // Tick mark inside a printed checkbox [x0, top, x1, bottom]
  const tick = ([x0, t, x1, b]) => {
    const w = x1 - x0, mid = { x: x0 + w * 0.4, y: H - b + 1.2 };
    page.drawLine({ start: { x: x0 + 1.2, y: H - (t + b) / 2 + 0.5 }, end: mid, thickness: 1.8, color: ink });
    page.drawLine({ start: mid, end: { x: x1 + 2, y: H - t - 3 }, thickness: 1.8, color: ink });
  };
  const circle = ([x0, t, x1, b]) => page.drawEllipse({
    x: (x0 + x1) / 2, y: H - (t + b + 1) / 2,
    xScale: (x1 - x0) / 2 + 3, yScale: (b - t) / 2 + 1,
    borderColor: ink, borderWidth: 1.2,
  });

  // Word-wraps text across a list of [x, lineBottom, maxWidth] lines
  const wrap = (str, lines, size, tokens) => {
    // bigger, but never taller than the gap between lines; shrinks until everything fits
    const gaps = lines.flatMap((l, i) => lines.slice(i + 1).filter(m => m[0] === l[0]).map(m => Math.abs(m[1] - l[1]))).filter(g => g > 0);
    size = Math.min(form.fontSize || FONT, form.maxSize || 99, gaps.length ? Math.min(...gaps) * 0.95 : 99);
    const words = tokens || str.split(/\s+/);
    const layout = sz => {
      const out = []; let li = 0, cur = "";
      for (const w of words) {
        const tryS = cur ? cur + " " + w : w;
        if (li < lines.length && cur && font.widthOfTextAtSize(tryS, sz) > lines[li][2]) { out.push(cur); li++; cur = w; }
        else cur = tryS;
      }
      if (cur) out.push(cur);
      return out;
    };
    let rows = layout(size);
    while (size > 7 && rows.length > lines.length) rows = layout(size -= 0.5);
    rows.slice(0, lines.length).forEach((r, i) => { const [x, lb] = lines[i]; page.drawText(r, { x, y: H - (lb - 7), size, font, color: ink }); });
  };
  // Hide the printed option words (dotted lines stay), then write the answer
  const blankOut = (o) => {
    for (const [x0, t, x1, b] of o.blank || [o.cell]) page.drawRectangle({ x: x0, y: H - b, width: x1 - x0, height: b - t, color: rgb(1, 1, 1) });
  };
  const cellText = (o, s, size) => {
    const [x0, t, x1, b] = o.cell;
    text(s, x0 + 2, o.dots ? b + 1 : (t + b) / 2 + 3.5 + 7, x1 - x0 - 4, size);
  };
  // Shared rows: several answers printed together in one area
  const inRow = new Set();
  for (const r of form.rows || []) {
    r.fields.forEach(id => inRow.add(id));
    const parts = r.fields.map(id => {
      const f = allFields(form).find(x => x.id === id), v = answers[id];
      return isEmpty(v) ? "" : (r.labels?.[id] || "") + display(f, v, answers);
    }).filter(Boolean);
    if (!parts.length) continue;
    on(r.page);
    blankOut(r);
    cellText(r, parts.join("   ·   "), r.size || 10);
  }
  for (const f of allFields(form)) {
    const v = answers[f.id];
    if (inRow.has(f.id) || f.id === form.banner?.into || isEmpty(v) || v === false) continue;
    on(f.page);
    if (f.type === "date" && f.slots) {
      const [y, m, d] = v.split("-");
      [d, m, y].forEach((part, i) => {
        const [a, b] = f.slots[i];
        let sz = Math.min(form.fontSize || FONT, form.maxSize || 99);
        while (sz > 8 && font.widthOfTextAtSize(part, sz) > (b - a) + 4) sz -= 0.5;
        const w = font.widthOfTextAtSize(part, sz);
        page.drawText(part, { x: (a + b) / 2 - w / 2, y: H - (f.at[1] - 7), size: sz, font, color: ink });
      });
    } else if (["text", "date", "time", "place"].includes(f.type)) {
      if (f.cell) { blankOut(f); cellText(f, display(f, v), f.size || 10); }
      if (f.at) text(display(f, v), ...f.at);
    } else if (f.type === "choice") {
      const o = f.options.find(o => o.v === v);
      if (f.cell) {
        // Show only the selected option: blank out the printed choices and write the answer
        blankOut(f);
        cellText(f, (f.cellLabel || "") + display(f, v, answers), f.size || 10);
      } else {
        if (o?.box) circle(o.box);
        (o?.boxes || []).forEach(circle);
        if (o?.textAt) text((o.prefix || "") + display(f, v, answers), ...o.textAt);
        if (o?.tick) tick(o.tick);
      }
      if (f.at) text((f.printLabel || "") + display(f, v, answers), ...f.at);
    } else if (f.type === "multi") {
      v.forEach(x => { const o = f.options.find(o => o.v === x); if (o?.tick) tick(o.tick); });
      const pv = v.map(x => f.options.find(o => o.v === x)?.p || x);
      const s = (f.printLabel || "") + pv.join(", ");
      if (f.lines) wrap(s, f.lines, f.size || 8, pv.map((x, i) => (i === 0 ? (f.printLabel || "") : "") + x + (i < pv.length - 1 ? "," : "")));
      else if (f.at) text(s, f.at[0], f.at[1], f.at[2], f.size || 11);
    } else if (f.type === "check") {
      circle(f.box);
    } else if (f.type === "textarea") {
      wrap(String(v), f.lines, f.size || 10.5);
    }
  }
  if (form.stamp) {
    const t = new Date(editedAt || submittedAt || Date.now());
    const d = t.toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", year: "numeric" });
    const h = t.toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s/g, "").toLowerCase();
    on(form.stamp.page);
    if (form.stamp.timeAt) {
      // date and time in separate spaces (e.g. "Date issued" / "Time")
      text(d, ...form.stamp.at, form.stamp.size || 9);
      text(h, ...form.stamp.timeAt, form.stamp.size || 9);
    } else text(`${editedAt ? "Edited: " : (form.stamp.prefix || "")}${d} ${h}`, ...form.stamp.at, form.stamp.size || 9);
  }
  for (const s of form.statics || []) { on(s.page); text(s.text, ...s.at); }
  if (form.banner) {
    const parts = [answers._nsna ? "MSS NSNA" : ""].concat((form.banner.fields || []).map(id => {
      const f = allFields(form).find(x => x.id === id);
      return f && !isEmpty(answers[id]) ? `${f.short || f.label}: ${display(f, answers[id], answers)}` : "";
    })).filter(Boolean);
    on(form.banner.page);
    const into = form.banner.into && allFields(form).find(x => x.id === form.banner.into);
    if (into) {
      // Print these answers at the start of another box (e.g. "Other instructions"), followed by its own text
      const own = isEmpty(answers[into.id]) ? [] : String(answers[into.id]).split(/\s+/);
      // keep each answer (e.g. "Transfer: All Hours") together on one line
      const tokens = [...parts.map((p, i) => p + (i < parts.length - 1 || own.length ? "  ·" : "")), ...own];
      on(into.page);
      if (tokens.length) wrap(tokens.join(" "), into.lines, into.size || 10.5, tokens);
    } else if (parts.length) text(parts.join("  ·  "), ...form.banner.at, form.banner.size || 9);
  }
  for (const p of form.prints || []) {
    const s = p.compose.map(id => {
      const f = allFields(form).find(x => x.id === id);
      if (isEmpty(answers[id])) return "";
      if (p.fmt && f?.type === "date") return fmtDate(answers[id], p.fmt);   // e.g. print the weekday of a date
      return f ? display(f, answers[id], answers) : answers[id];
    }).filter(Boolean).join(p.sep || " ");
    on(p.page);
    if (s) text(s, ...p.at);
  }
  // Sections marked Not Applicable: blank the section on the form and say so
  for (const sec of form.sections) {
    if (!sec.na || !answers["_na_" + sec.id]) continue;
    on(sec.na.page);
    const [x0, t, x1, b] = sec.na.cell;
    // Leave the printed words in place but fade them to grey
    page.drawRectangle({ x: x0, y: H - b, width: x1 - x0, height: b - t, color: rgb(1, 1, 1), opacity: sec.na.fade ?? 0.7 });
    text(sec.na.label || "NOT APPLICABLE", sec.na.at?.[0] ?? x0 + 2, sec.na.at?.[1] ?? (t + 18), x1 - x0 - 4, sec.na.size || 12);
  }
  // Edited versions: "Vers#2 | 01/10/2026 | 13:55" in the top-right corner of every page
  if (version > 0 && editedAt) {
    const t = new Date(editedAt);
    const d = t.toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", year: "numeric" });
    const hm = t.toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit", hour12: false });
    const label = `Vers#${version} | ${d} | ${hm}`;
    const size = form.version?.size || 10, red = rgb(0.75, 0.05, 0.05);
    for (const pg of pages) {
      const { width } = pg.getSize(), w = font.widthOfTextAtSize(label, size);
      const [x, y] = form.version?.at || [width - w - 14, 14];
      pg.drawRectangle({ x: x - 3, y: H - y - 3, width: w + 6, height: size + 4, color: rgb(1, 1, 1) });
      pg.drawText(label, { x, y: H - y, size, font, color: red });
    }
  }
  return await doc.save();
}

// ─── JOB CARD MERGE (fills empty fields only) ────────────────────────────────
function jobVal(f, a) {
  if (isEmpty(a)) return undefined;
  let val = a;
  if (f.map) val = f.map[a];
  if (f.match) { const hit = f.match.find(([re]) => new RegExp(re, "i").test(a)); val = hit ? hit[1] : undefined; }
  return isEmpty(val) ? undefined : val;
}
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

// Fills empty Job Card fields. On an edit (prev = previous answers), values that
// came from the previous version are updated too; anything MSS changed is kept.
function mergeIntoJobCard(caseData, form, answers, meta, prev) {
  const prep = { ...(caseData.prep || {}) };
  const conflicts = [];
  for (const f of allFields(form)) {
    if (!f.job) continue;
    const val = jobVal(f, answers[f.id]);
    const old = prev ? jobVal(f, prev[f.id]) : undefined;
    const fromNote = old !== undefined && same(prep[f.job], old);
    if (val === undefined) {
      if (fromNote) prep[f.job] = Array.isArray(old) ? [] : "";
      continue;
    }
    if (isEmpty(prep[f.job]) || fromNote) {
      prep[f.job] = val;
      if (f.jobAlso) Object.entries(f.jobAlso).forEach(([k, v]) => { if (isEmpty(prep[k])) prep[k] = v; });
    } else if (!same(prep[f.job], val)) {
      const kept = Array.isArray(prep[f.job]) ? prep[f.job].join(", ") : String(prep[f.job]);
      conflicts.push(`${f.label}: 2nd Note says "${display(f, answers[f.id], answers)}", Job Card kept "${kept}"`);
    }
  }
  // Only the 2nd Note's Comments go into Job Card comments. An edit replaces its previous comment.
  const note = String(answers.comments || "").trim();
  const oldNote = String(prev?.comments || "").trim();
  let jc = prep.comments || "";
  if (oldNote && oldNote !== note && jc.includes(oldNote)) {
    jc = jc.replace(oldNote, note).replace(/\n{3,}/g, "\n\n").trim();
  } else if (note && !jc.includes(note)) {
    jc = jc ? jc.trimEnd() + "\n\n" + note : note;
  }
  prep.comments = jc;
  return { prep, conflicts };
}

// ─── GOOGLE PLACES INPUT (typed text is kept too) ───────────────────────────
function PlaceInput({ value, onChange }) {
  const ref = useRef(null);
  const cb = useRef(onChange); cb.current = onChange;
  useEffect(() => {
    if (!ref.current || !window.google?.maps?.places) return;
    const ac = new window.google.maps.places.Autocomplete(ref.current, {
      types: ["establishment", "geocode"], componentRestrictions: { country: "au" }, fields: ["name", "formatted_address"],
    });
    ac.addListener("place_changed", () => {
      const p = ac.getPlace(); if (!p?.name) return;
      const suburb = p.formatted_address?.split(",")[1]?.trim();
      const val = p.name + (suburb && !p.name.includes(suburb) ? ", " + suburb : "");
      ref.current.value = val; cb.current(val);
    });
    return () => window.google?.maps?.event?.clearInstanceListeners(ac);
  }, []);
  return <input ref={ref} className={inp} defaultValue={value} autoComplete="off" placeholder="Start typing a place…" onChange={e => cb.current(e.target.value)} />;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
const btn = "px-4 py-3 rounded-xl border-2 font-black text-sm uppercase transition";
const chip = on => `px-3 py-2 rounded-xl border-2 text-xs font-black uppercase transition ${on ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600 hover:border-gray-700"}`;
const inp = "w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900";
const lbl = "block text-xs font-black uppercase text-gray-500 tracking-widest mb-1";
const card = "bg-white rounded-2xl border border-gray-200 p-4 mb-3";


// ── Dr Ref (medical referee) request to the doctor, shown on cremations ──
const DR_DOCS = [
  { key: "mccd", label: "MCCD", req: true, re: /mccd/i },
  { key: "cra", label: "CRA (if not part of the MCCD)", req: false, re: /(^|[^a-z])cra([^a-z]|$)|cremation risk/i },
  { key: "aform", label: "Application for Cremation (A-Form)", req: true, re: /a.?form|application for (permission for )?cremation/i },
  { key: "pace", label: "Pacemaker / device removal form", req: false, re: /pacemaker|device removal/i },
];
const isCremation = a => /cremat/i.test(String(a.disposition || ""));
const BIG = 15 * 1024 * 1024;
const mb = f => (f.size / 1024 / 1024).toFixed(1) + " MB";
function DrRefCard({ answers, setA, files, setFiles, caseDocs, error, pubUrl, onResend, canResend, onSaveDocs, busy, standalone }) {
  const d = answers._drref;
  const fmt = x => new Date(x).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const wrap = "rounded-2xl border-2 p-4 mb-4 " + (error ? "border-red-400 bg-red-50" : "border-gray-200 bg-white");
  if (d?.token) return (
    <div className={wrap}>
      <p className="text-sm font-black uppercase tracking-wide mb-2">Dr Ref (medical referee)</p>
      <p className="text-sm">Requested {fmt(d.requestedAt)}{d.requestedBy ? " by " + d.requestedBy : ""}{d.sentAt ? " · emailed to the doctor " + fmt(d.sentAt) : ""}</p>
      {d.receivedAt
        ? <p className="mt-2 text-sm font-black text-green-700">✓ Dr Ref received {fmt(d.receivedAt)} from {d.receivedBy} · <a className="underline" href={pubUrl(d.receivedPath)} target="_blank" rel="noreferrer">View</a>{d.receivedNote ? <span className="block font-normal text-gray-600">Note: {d.receivedNote}</span> : null}</p>
        : <p className="mt-2 text-sm font-black text-amber-700">⏳ Waiting for the Dr Ref from the doctor</p>}
      {!d.receivedAt && <div className="mt-3 space-y-2">
        <p className="text-xs font-black uppercase tracking-wide text-gray-500">Documents sent to the doctor</p>
        {DR_DOCS.map(dd => { const have = (d.docs || []).find(x => x.key === dd.key), f = files[dd.key]; return (
          <div key={dd.key} className="flex flex-wrap items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
            <span className="flex-1 min-w-[180px] text-sm font-bold">{dd.label}{dd.req ? " *" : ""}
              <span className="block text-xs font-normal text-gray-500">{f ? <span className="text-blue-700 font-bold">New: {f.name} ({mb(f)}) — will replace</span> : have ? <a className="underline" href={pubUrl(have.path)} target="_blank" rel="noreferrer">📄 {have.name || "View"}</a> : "Not included"}</span>
              {f && f.size > BIG && <span className="block text-xs font-bold text-amber-700">Large file — it may be too big to attach to the email, but the doctor can still open it from their link.</span>}</span>
            {canResend && <label className="px-3 py-2 rounded-lg border-2 border-gray-900 text-xs font-black uppercase cursor-pointer">{have || f ? "Replace" : "＋ Add"}
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={e => { const x = e.target.files[0]; if (x) setFiles(v => ({ ...v, [dd.key]: x })); e.target.value = ""; }} /></label>}
            {f && <button type="button" onClick={() => setFiles(v => { const n = { ...v }; delete n[dd.key]; return n; })} className="text-xs underline text-gray-500">Undo</button>}
          </div>); })}
        {canResend && Object.keys(files).length > 0 && <button type="button" disabled={busy} onClick={onSaveDocs} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase disabled:opacity-60">{busy ? "Saving…" : "Save changes & resend to the doctor"}</button>}
        {canResend && <p className="text-xs text-gray-500">Replace a file that is too large or wrong, then tap Save changes & resend. The doctor gets an UPDATED request email.</p>}
      </div>}
      {!d.sentAt && canResend && !Object.keys(files).length && <button type="button" onClick={onResend} className="mt-3 px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-black uppercase">Send request to the doctor now</button>}
    </div>);
  const on = standalone || !!answers._drreq;
  const chosen = k => files[k] || null;
  const onFile = dd => caseDocs.find(c => dd.re.test(c.name || ""));
  return (
    <div className={wrap}>
      <p className="text-sm font-black uppercase tracking-wide mb-2">Dr Ref (medical referee) for cremation</p>
      {!standalone && <button type="button" onClick={() => setA("_drreq", !on)} className={"w-full text-left px-4 py-3 rounded-xl border-2 font-black text-sm " + (on ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-700")}>
        {on ? "☑" : "☐"} Request a Dr Ref from the medical referee</button>}
      {on && <div className="mt-3 space-y-2">
        <p className="text-xs text-gray-500">The doctor is emailed when you {standalone ? "send the request" : "submit"}, with these documents and a secure link to upload the Dr Ref. It comes back into Lumière and you are emailed. * required. The CRA is often part of the MCCD; only add it if it's a separate document.</p>
        {DR_DOCS.map(dd => { const f = chosen(dd.key), have = onFile(dd); return (
          <div key={dd.key} className={"flex flex-wrap items-center gap-2 border rounded-xl px-3 py-2 " + (error && dd.req && !f && !have ? "border-red-400" : "border-gray-200")}>
            <span className="flex-1 min-w-[180px] text-sm font-bold">{dd.label}{dd.req ? " *" : dd.label.includes("(") ? "" : " (if applicable)"}
              <span className="block text-xs font-normal text-gray-500">{f ? "📄 " + f.name + " (" + mb(f) + ")" : have ? "✓ On file: " + have.name : "Not uploaded"}</span>
              {f && f.size > BIG && <span className="block text-xs font-bold text-amber-700">Large file — it may be too big to attach to the email, but the doctor can still open it from their link.</span>}</span>
            <label className="px-3 py-2 rounded-lg border-2 border-gray-900 text-xs font-black uppercase cursor-pointer">{f || have ? "Upload different" : "⬆ Upload"}
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={e => { const x = e.target.files[0]; if (x) setFiles(v => ({ ...v, [dd.key]: x })); }} /></label>
            {f && <button type="button" onClick={() => setFiles(v => { const n = { ...v }; delete n[dd.key]; return n; })} className="text-xs underline text-gray-500">Remove</button>}
          </div>); })}
        {error && <p className="text-red-600 text-xs font-bold">{error}</p>}
      </div>}
    </div>);
}

export default function SecondNotes({ user, cases, onUpdateCase, onBack, api }) {
  const { sb, updateCase, logActivity, SUPABASE_URL, SUPABASE_KEY, FUNERAL_HOMES, STORAGE_BUCKET } = api;
  const isFD = user?.role === "fd";
  const [fhId, setFhId] = useState(isFD ? user.funeralHomeId : "");
  const [view, setView] = useState("list");
  const [notes, setNotes] = useState([]);
  const [loadErr, setLoadErr] = useState("");
  const [caseId, setCaseId] = useState("");
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [nsnaShowAll, setNsnaShowAll] = useState(false);
  // NSNA (no service, no attendance): only show sections that still matter
  const nsnaKeep = sec => sec.fields.some(f => f.required || f.id === "disposition") ||
    /comment|instruction|special|other|note|issued|completed|arrang|notification|notice|jewel|personal effects/i.test(sec.title);
  const [done, setDone] = useState(null);
  const [editing, setEditing] = useState(null);
  const [linking, setLinking] = useState(null);
  const [picking, setPicking] = useState(false);
  const [tab, setTab] = useState(() => { const t = window.__snTab; window.__snTab = null; return t || "new"; });
  const [drFiles, setDrFiles] = useState({});
  const [caseDocs, setCaseDocs] = useState([]);
  const drSend = useRef(null);
  useEffect(() => { setDrFiles({}); if (!caseId || caseId === "none") { setCaseDocs([]); return; }
    fetch(`${SUPABASE_URL}/storage/v1/object/list/${STORAGE_BUCKET}`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: `${caseId}/`, limit: 100, sortBy: { column: "created_at", order: "desc" } }) })
      .then(r => r.json()).then(l => setCaseDocs((Array.isArray(l) ? l : []).filter(f => f.name && !f.name.endsWith("/")).map(f => ({ name: f.name.replace(/^\d+_/, "").replace(/_/g, " "), path: `${caseId}/${f.name}` })))).catch(() => setCaseDocs([])); }, [caseId]);
  const pubUrl = p => `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${String(p || "").split("/").map(encodeURIComponent).join("/")}`;
  function drMissing(a) {
    if (!a._drreq || a._drref?.token || !isCremation(a)) return [];
    return DR_DOCS.filter(dd => dd.req && !drFiles[dd.key] && !caseDocs.find(c => dd.re.test(c.name || ""))).map(dd => dd.label);
  }
  // Uploads the Dr Ref documents and records the request on the 2nd Note (emailed to the doctor once the note is saved)
  async function prepDrRef(noteId, base) {
    const a = { ...(base || answers) }; const want = a._drreq && isCremation(a) && !a._drref?.token; delete a._drreq;
    if (!want) return a;
    const docs = [];
    for (const dd of DR_DOCS) {
      const f = drFiles[dd.key], have = caseDocs.find(c => dd.re.test(c.name || ""));
      if (f) docs.push(await uploadDrFile(noteId, dd, f));
      else if (have) docs.push({ key: dd.key, label: dd.label, path: have.path, name: have.name });
    }
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");
    a._drref = { token, requestedAt: new Date().toISOString(), requestedBy: `${user?.name || ""}${fhName ? " (" + fhName + ")" : ""}`, docs };
    drSend.current = noteId; setDrFiles({});
    return a;
  }
  async function uploadDrFile(noteId, dd, f) {
    const ext = (f.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
    const path = `drref/${noteId}/${dd.key}_${Date.now()}.${ext}`;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": f.type || "application/octet-stream", "x-upsert": "true" }, body: f });
    if (!r.ok) throw new Error(dd.label + " upload failed (" + r.status + "). If the file is very large, try a smaller scan or PDF.");
    return { key: dd.key, label: dd.label, path, name: f.name };
  }
  // Replace / add Dr Ref documents after the request was made, then send Certa an updated request
  const [drBusy, setDrBusy] = useState(false);
  async function saveDrDocs() {
    if (!editing) return;
    setDrBusy(true);
    try {
      const fresh = (await sb(`second_notes?select=answers&id=eq.${editing.id}`))?.[0]?.answers || {};
      const d = fresh._drref; if (!d?.token) throw new Error("No Dr Ref request on this 2nd Note");
      if (d.receivedAt) throw new Error("The Dr Ref has already been received");
      const docs = [...(d.docs || [])];
      for (const dd of DR_DOCS) { const f = drFiles[dd.key]; if (!f) continue; const item = await uploadDrFile(editing.id, dd, f); const i = docs.findIndex(x => x.key === dd.key); if (i >= 0) docs[i] = item; else docs.push(item); }
      const _drref = { ...d, docs, docsUpdatedAt: new Date().toISOString(), docsUpdatedBy: user?.name || "" };
      await sb(`second_notes?id=eq.${editing.id}`, { method: "PATCH", body: JSON.stringify({ answers: { ...fresh, _drref } }) });
      setAnswers(a => ({ ...a, _drref })); setDrFiles({});
      await sendDrRef(editing.id, false, true);
      loadNotes();
    } catch (e) { alert("Couldn't update the Dr Ref documents: " + e.message); }
    setDrBusy(false);
  }
  async function sendDrRef(noteId, quiet, resend) {
    try {
      const r = await fetch("/api/drref", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request", noteId, resend: !!resend }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      if (!quiet) alert(resend ? "✓ Updated Dr Ref request emailed to the doctor." : "✓ Dr Ref request emailed to the doctor. You'll be emailed when the Dr Ref comes back.");
      return true;
    } catch (e) { alert("The 2nd Note is saved, but the Dr Ref request couldn't be emailed to the doctor (" + e.message + "). Open the 2nd Note and tap 'Send request to the doctor now', or call MSS."); return false; }
  }

  const form = FORMS[fhId];
  const fhName = FUNERAL_HOMES.find(f => f.id === fhId)?.name || "";
  const formFHs = FUNERAL_HOMES.filter(f => FORMS[f.id]);
  const inCare = useMemo(() => cases.filter(c => c.status === "active" && !c.checkedOut), [cases]);
  const fhCases = useMemo(() => inCare.filter(c => c.funeralHomeId === fhId), [inCare, fhId]);

  useEffect(() => { loadNotes(); }, [fhId]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [view]);

  async function loadNotes() {
    try {
      const q = "second_notes?select=*&answers->>_drOnly=is.null&order=submitted_at.desc&limit=100" + (fhId ? `&funeral_home_id=eq.${fhId}` : "");
      const rows = await sb(q);
      rows.sort((x, y) => new Date(y.edited_at || y.submitted_at) - new Date(x.edited_at || x.submitted_at));
      setNotes(rows); setLoadErr("");
    } catch (e) { setLoadErr("2nd Notes table not set up yet. Run the setup SQL in Supabase."); }
  }

  async function uploadPdf(path, bytes) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/pdf", "x-upsert": "true" },
      body: bytes,
    });
    if (!r.ok) throw new Error("PDF upload failed: " + (await r.text()));
  }
  const pdfUrl = path => `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
  const lastName = name => (name || "Unknown").trim().split(/\s+/).filter(w => !/^\d+$/.test(w)).pop() || "Unknown";
  const fileName = (ans, frm = form) => `2nd_Note_${frm.fileTag}_${(ans.lastName || lastName(ans.deceasedName)).replace(/[^a-zA-Z0-9]/g, "_")}_${fmtDate(new Date().toISOString().slice(0, 10)).replace(/\//g, "")}.pdf`;
  function download(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function applyToCase(c, ans, noteId, frm = form, fhN = fhName, prev = null) {
    // Merge into the latest saved Job Card, not this screen's older copy
    let latest = c;
    try { const rows = await sb(`cases?id=eq.${c.id}&select=prep`); if (rows && rows[0]) latest = { ...c, prep: rows[0].prep || {} }; } catch (e) {}
    const { prep, conflicts } = mergeIntoJobCard(latest, frm, ans, { noteId, fhName: fhN, by: ans.arrangedBy || user.name }, prev);
    await updateCase(c.id, { prep });
    onUpdateCase(c.id, { prep });
    return conflicts;
  }

  function startNew() {
    const arr = allFields(form).find(f => f.id === "arrangedBy");
    const first = (user?.name || "").split(" ")[0].toLowerCase();
    const pre = arr?.type === "choice" ? (arr.options.find(o => o.v.toLowerCase() === first)?.v || "") : (user?.name || "");
    setAnswers({ arrangedBy: pre }); setCaseId(""); setErrors({}); setDone(null); setEditing(null); setView("form");
  }
  function startEdit(note) {
    setDrFiles({});
    const a = { ...(note.answers || {}) };
    // Older notes stored one "deceasedName" - split it into the first/last name fields
    if (!a.firstName && !a.lastName && (a.deceasedName || note.deceased_name)) {
      const parts = String(a.deceasedName || note.deceased_name).trim().split(/\s+/).filter(w => !/^\d+$/.test(w));
      a.lastName = parts.length > 1 ? parts.pop() : "";
      a.firstName = parts.join(" ");
    }
    if (!isFD) setFhId(note.funeral_home_id);   // staff/admin edit from the All 2nd Notes list
    setAnswers(a); setCaseId(note.case_id || "none"); setErrors({}); setDone(null); setEditing(note); setView("form");
  }
  function pickCase(id) {
    setCaseId(id);
    const c = cases.find(x => x.id === id);
    if (c) {
      const age = calcAge(c.dob, c.dod);
      setAnswers(a => ({ ...a, firstName: c.firstName || "", lastName: c.lastName || "", dod: c.dod || "", dob: c.dob || "", age }));
      // A Dr Ref requested on its own (📄 Dr Ref button) shows here and joins this 2nd Note when it's submitted
      if (!editing) sb(`second_notes?select=answers&case_id=eq.${id}&answers->>_drOnly=eq.true&limit=1`).then(r => { const d = r?.[0]?.answers?._drref; if (d?.token) setAnswers(a => ({ ...a, _drref: d, _drreq: false })); }).catch(() => {});
    }
  }
  function applyNSNA(on) {
    setAnswers(a => {
      const n = { ...a, _nsna: on };
      if (on) {
        Object.assign(n, form.nsna.set);
        form.sections.forEach(s => { if (s.na) delete n["_na_" + s.id]; });
      }
      return n;
    });
    if (on) setErrors(e => { const n = { ...e }; Object.keys(form.nsna.set).forEach(k => delete n[k]); return n; });
  }
  function toggleNA(sec) {
    const key = "_na_" + sec.id;
    setAnswers(a => {
      const n = { ...a, [key]: !a[key] };
      if (n[key]) sec.fields.forEach(f => { delete n[f.id]; delete n[f.id + "Other"]; });
      return n;
    });
    setErrors(e => { const n = { ...e }; sec.fields.forEach(f => delete n[f.id]); return n; });
  }
  function setA(id, v) {
    setAnswers(a => {
      const n = { ...a, [id]: v };
      const ageF = allFields(form).find(f => f.auto === "age");
      if (ageF && (id === "dob" || id === "dod")) n[ageF.id] = calcAge(n.dob, n.dod);
      return n;
    });
    setErrors(e => ({ ...e, [id]: undefined }));
  }

  const normName = s => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
  // One 2nd Note per deceased: same case, or same name at the same funeral home
  async function findExisting(fhIdX, caseIdX, ans, exceptId) {
    const rows = await sb(`second_notes?select=*&funeral_home_id=eq.${fhIdX}&limit=500`);
    return rows.find(n => n.id !== exceptId && ((caseIdX && n.case_id === caseIdX) || (normName(n.deceased_name) && normName(n.deceased_name) === normName(nameOf(ans)))));
  }
  async function removePdf(path) {
    if (!path) return;
    try { await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, { method: "DELETE", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }); } catch (e) {}
  }

  async function submitEdit() {
    const n = editing;
    const c = caseId !== "none" ? cases.find(x => x.id === caseId) : null;
    const dup = await findExisting(fhId, c?.id, answers, n.id);
    if (dup) { alert(`Another 2nd Note already exists for ${dup.deceased_name}. Only one 2nd Note is allowed per deceased.`); return; }
    const now = new Date().toISOString();
    const bytes = await buildPdf(form, answers, n.submitted_at, now, (n.edit_count || 0) + 1);
    const name = fileName(answers);
    const path = c ? `${c.id}/${Date.now()}_${name}` : `second-notes/${n.id}_${Date.now()}.pdf`;
    await uploadPdf(path, bytes);
    await sb(`second_notes?id=eq.${n.id}`, { method: "PATCH", body: JSON.stringify({
      answers: await prepDrRef(n.id), deceased_name: nameOf(answers), case_id: c?.id || null, case_ref: c?.caseRef || null,
      pdf_path: path, status: c ? "linked" : "awaiting",
      edited_at: now, edited_by: user?.name || "", edit_count: (n.edit_count || 0) + 1,
      // Every edit (FD, staff or admin) goes to Updated 2nd Notes for MSS to check and accept
      accepted_at: null, accepted_by: null,
    }) });
    if (n.pdf_path && n.pdf_path !== path) await removePdf(n.pdf_path);
    const conflicts = c ? await applyToCase(c, answers, n.id, form, fhName, c.id === n.case_id ? n.answers : null) : [];
    if (drSend.current) { const id = drSend.current; drSend.current = null; await sendDrRef(id); }
    logActivity(user, "2ND NOTE EDITED", `${fhName} 2nd Note for ${nameOf(answers)} (edit ${(n.edit_count || 0) + 1})`, c?.caseRef || "", c?.id || "");
    download(bytes, name);
    setDone({ bytes, name, linked: !!c, conflicts, edited: true });
    setEditing(null); setView("done"); loadNotes();
  }

  async function submit() {
    const errs = {};
    if (!caseId) errs._case = "Choose the case, or 'Not in our care yet'";
    form.sections.filter(s => !(s.na && answers["_na_" + s.id])).flatMap(s => s.fields).forEach(f => { if (f.required && isEmpty(answers[f.id])) errs[f.id] = "Required"; });
    const drm = drMissing(answers); if (drm.length) errs._drref = "Upload for the Dr Ref: " + drm.join(", ");
    setErrors(errs);
    if (Object.keys(errs).length) {
      const names = Object.keys(errs).map(k => k === "_case" ? "Case" : k === "_drref" ? errs._drref : allFields(form).find(f => f.id === k)?.label || k);
      alert("Please complete: " + names.join(", ")); return;
    }
    setBusy(true);
    try {
      if (editing) { await submitEdit(); setBusy(false); return; }
      const c = caseId !== "none" ? cases.find(x => x.id === caseId) : null;
      let dup = await findExisting(fhId, c?.id, answers, null);
      const adopt = dup?.answers?._drOnly ? dup : null; if (adopt) dup = null;
      if (dup) {
        setBusy(false);
        if (confirm(`A 2nd Note already exists for ${dup.deceased_name}. Only one is allowed per deceased.\n\nOpen it to edit instead?`)) startEdit(dup);
        return;
      }
      const noteId = adopt ? adopt.id : crypto.randomUUID();
      const bytes = await buildPdf(form, answers);
      const name = fileName(answers);
      const path = c ? `${c.id}/${Date.now()}_${name}` : `second-notes/${noteId}.pdf`;
      await uploadPdf(path, bytes);
      const row = {
        funeral_home_id: fhId, funeral_home_name: fhName,
        case_id: c?.id || null, case_ref: c?.caseRef || null,
        deceased_name: nameOf(answers), pdf_path: path,
        submitted_by: user?.name || "", submitted_role: user?.role || "",
        status: c ? "linked" : "awaiting",
      };
      if (adopt) {
        // This deceased already has a Dr Ref requested on its own: the 2nd Note joins it (one record per deceased)
        const fresh = (await sb(`second_notes?select=answers&id=eq.${adopt.id}`))?.[0]?.answers || adopt.answers;
        const base = { ...answers }; delete base._drOnly;
        if (fresh._drref?.token) { base._drref = fresh._drref; delete base._drreq; }
        const ans = await prepDrRef(noteId, base);
        await sb(`second_notes?id=eq.${adopt.id}`, { method: "PATCH", body: JSON.stringify({ ...row, answers: ans,
          submitted_at: new Date().toISOString(), accepted_at: null, accepted_by: null, edit_count: 0, edited_at: null, edited_by: null }) });
        const dr = ans._drref;
        if (c && !adopt.case_id && dr?.receivedPath) await fetch(`${SUPABASE_URL}/storage/v1/object/copy`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ bucketId: STORAGE_BUCKET, sourceKey: dr.receivedPath, destinationKey: `${c.id}/${Date.now()}_DR_REF.${dr.receivedPath.split(".").pop()}` }) }).catch(() => {});
      } else await sb("second_notes", { method: "POST", body: JSON.stringify({ id: noteId, ...row, answers: await prepDrRef(noteId) }) });
      const conflicts = c ? await applyToCase(c, answers, noteId) : [];
      if (drSend.current) { const id = drSend.current; drSend.current = null; await sendDrRef(id); }
      logActivity(user, "2ND NOTE", `${fhName} 2nd Note for ${nameOf(answers)}${c ? "" : " (not in care yet)"}`, c?.caseRef || "", c?.id || "");
      download(bytes, name);
      setDone({ bytes, name, linked: !!c, conflicts });
      setView("done");
      loadNotes();
    } catch (e) { alert("Error: " + e.message); }
    setBusy(false);
  }

  async function linkNote(note, newCaseId) {
    const win = !isFD && !note.accepted_at ? preOpen() : null;
    const c = cases.find(x => x.id === newCaseId);
    const frm = FORMS[note.funeral_home_id];
    if (!c || !frm) { win?.close(); return; }
    if (c.funeralHomeId !== note.funeral_home_id && !confirm(`${c.firstName} ${c.lastName} is under ${c.funeralHomeName}, but this 2nd Note is from ${note.funeral_home_name}. Assign anyway?`)) { win?.close(); setLinking(null); return; }
    setBusy(true);
    try {
      const taken = (await sb(`second_notes?select=id,deceased_name&case_id=eq.${c.id}`)).find(x => x.id !== note.id);
      if (taken) { alert(`${c.firstName} ${c.lastName} already has a 2nd Note. Only one is allowed per deceased.`); win?.close(); setBusy(false); setLinking(null); return; }
      const bytes = await buildPdf(frm, note.answers, note.submitted_at, note.edited_at, note.edit_count || 0);
      const path = `${c.id}/${Date.now()}_${fileName(note.answers, frm)}`;
      await uploadPdf(path, bytes);
      const upd = { case_id: c.id, case_ref: c.caseRef, pdf_path: path, status: "linked" };
      if (!isFD && !note.accepted_at) Object.assign(upd, { accepted_at: new Date().toISOString(), accepted_by: user?.name || "" });
      await sb(`second_notes?id=eq.${note.id}`, { method: "PATCH", body: JSON.stringify(upd) });
      if (note.pdf_path && note.pdf_path !== path) await removePdf(note.pdf_path);
      const conflicts = await applyToCase(c, note.answers, note.id, frm, note.funeral_home_name);
      const dr = note.answers?._drref;
      if (dr?.receivedPath) await fetch(`${SUPABASE_URL}/storage/v1/object/copy`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ bucketId: STORAGE_BUCKET, sourceKey: dr.receivedPath, destinationKey: `${c.id}/${Date.now()}_DR_REF.${dr.receivedPath.split(".").pop()}` }) }).catch(() => {});
      logActivity(user, "2ND NOTE LINKED", `${note.deceased_name} → ${c.caseRef}`, c.caseRef, c.id);
      if (!isFD && !note.accepted_at) printPdf(bytes, win);
      alert(`Linked to ${c.caseRef}. Job Card updated.` + (conflicts.length ? `\n\nNot applied (already set):\n• ${conflicts.join("\n• ")}` : ""));
      setLinking(null); loadNotes();
    } catch (e) { win?.close(); alert("Error: " + e.message); }
    setBusy(false);
  }

  // Opens the browser print dialog for a 2nd Note PDF (bytes or stored path).
  // Safari can't print a PDF inside a hidden frame, so it opens in a new tab instead.
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
  const preOpen = () => (isSafari ? window.open("", "_blank") : null);
  async function printPdf(src, win) {
    try {
      const bytes = typeof src === "string" ? await (await fetch(pdfUrl(src) + "?t=" + Date.now())).arrayBuffer() : src;
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      if (win) { win.location.href = url; return; }
      const f = document.createElement("iframe");
      f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
      f.onload = () => setTimeout(() => {
        try { f.contentWindow.focus(); f.contentWindow.print(); }
        catch (e) { window.open(url, "_blank"); }
      }, 400);
      f.src = url;
      document.body.appendChild(f);
      setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 10 * 60 * 1000);
    } catch (e) { win?.close(); alert("Accepted, but the PDF couldn't be printed: " + e.message); }
  }

  async function acceptNote(note) {
    const win = preOpen();
    setBusy(true);
    try {
      const upd = { accepted_at: new Date().toISOString(), accepted_by: user?.name || "" };
      await sb(`second_notes?id=eq.${note.id}`, { method: "PATCH", body: JSON.stringify(upd) });
      setNotes(ns => ns.map(n => n.id === note.id ? { ...n, ...upd } : n));
      logActivity(user, "2ND NOTE ACCEPTED", `${note.funeral_home_name} 2nd Note for ${note.deceased_name}`, note.case_ref || "", note.case_id || "");
      printPdf(note.pdf_path, win);
    } catch (e) { win?.close(); alert("Error: " + e.message + (String(e.message).includes("accepted") ? "\n\nRun the 2nd Notes accept SQL in Supabase." : "")); }
    setBusy(false);
  }

  const when = ts => new Date(ts).toLocaleString("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
  const caseOptions = note => {
    const mine = inCare.filter(c => c.funeralHomeId === note.funeral_home_id);
    const other = inCare.filter(c => c.funeralHomeId !== note.funeral_home_id);
    const opt = c => <option key={c.id} value={c.id}>{c.lastName?.toUpperCase()}, {c.firstName} — {c.caseRef}</option>;
    return <>
      <optgroup label={note.funeral_home_name}>{mine.map(opt)}</optgroup>
      {other.length > 0 && <optgroup label="Other funeral homes">{other.map(opt)}</optgroup>}
    </>;
  };
  function NoteCard({ n, staff }) {
    return (
      <div className={card + (staff && !n.accepted_at ? (n.edit_count > 0 ? " border-l-4 border-l-orange-500" : " border-l-4 border-l-red-500") : "")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {staff && <div className="text-[11px] font-black uppercase tracking-widest text-gray-400">{n.funeral_home_name}</div>}
            <div className="font-black">{n.deceased_name || "—"}</div>
            <div className="text-xs text-gray-500">{n.edit_count > 0 ? `Edited ${when(n.edited_at)}` : when(n.submitted_at)} · {n.answers?.arrangedBy || n.submitted_by}</div>
            {n.edit_count > 0 && <div className="text-[11px] text-gray-400">First sent {when(n.submitted_at)} · {n.edit_count} edit{n.edit_count > 1 ? "s" : ""}</div>}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {n.accepted_at
                ? <span className="text-xs font-black uppercase text-green-700">✓ Accepted{n.accepted_by ? " · " + n.accepted_by : ""}</span>
                : staff ? (n.edit_count > 0 ? <span className="text-xs font-black uppercase text-orange-600">✎ Edited</span> : <span className="text-xs font-black uppercase text-red-600">● New</span>)
                : <span className="text-xs font-black uppercase text-gray-500">{n.edit_count > 0 ? "Edited · awaiting MSS" : "Sent · awaiting MSS"}</span>}
              {n.status === "linked"
                ? <span className="text-xs font-black uppercase text-green-700">✓ On Job Card · {n.case_ref}</span>
                : <span className="text-xs font-black uppercase text-amber-600">⏳ Not in care yet</span>}
              {n.answers?._drref?.token && (n.answers._drref.receivedAt
                ? <span className="text-xs font-black uppercase text-green-700">✓ Dr Ref received</span>
                : <span className="text-xs font-black uppercase text-blue-700">⏳ Dr Ref requested</span>)}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {n.pdf_path ? <>
            <a href={pdfUrl(n.pdf_path)} target="_blank" rel="noreferrer" className="text-xs font-black uppercase underline whitespace-nowrap">View PDF</a>
            {staff && <button type="button" onClick={() => printPdf(n.pdf_path, preOpen())} className="text-xs font-black uppercase underline whitespace-nowrap">🖨 Print</button>}
            </> : <span className="text-xs font-bold text-gray-400 whitespace-nowrap">☁️ PDF in OneDrive</span>}
          </div>
        </div>
        {(staff || isFD) && (
          <div className="flex gap-2 mt-3">
            <button disabled={busy} onClick={() => startEdit(n)} className={btn + " flex-1 border-gray-900 text-xs py-2"}>✎ Edit</button>
            {staff && !n.accepted_at && <button disabled={busy} onClick={() => acceptNote(n)} className={btn + " flex-1 bg-green-600 text-white border-green-600 text-xs py-2 disabled:opacity-50"}>✓ Accept</button>}
            {n.status !== "linked" && linking !== n.id && <button disabled={busy} onClick={() => setLinking(n.id)} className={btn + " flex-1 border-amber-500 text-amber-700 text-xs py-2"}>{staff ? "Assign to deceased" : "Link to case now in care"}</button>}
          </div>
        )}
        {n.status !== "linked" && linking === n.id && (
          <select className={inp + " mt-3"} defaultValue="" disabled={busy} onChange={e => linkNote(n, e.target.value)}>
            <option value="" disabled>Select deceased in our care…</option>
            {staff ? caseOptions(n) : fhCases.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} — {c.caseRef}</option>)}
          </select>
        )}
      </div>
    );
  }

  // ── Header ──
  const goBack = () => {
    if (view !== "list") return setView("list");
    if (!isFD && picking) return setPicking(false);
    if (!isFD && fhId) { setFhId(""); return; }
    onBack();
  };
  const header = (
    <div className="flex items-center justify-between mb-4">
      <button onClick={goBack} className="text-sm font-black uppercase text-gray-500 hover:text-gray-900">← Back</button>
      <h1 className="text-lg font-black uppercase tracking-wide">📝 {!isFD && !fhId ? "All 2nd Notes" : "2nd Notes"}</h1>
      <span className="w-12" />
    </div>
  );

  // ── Staff: All 2nd Notes ──
  if (!isFD && !fhId && !picking) {
    const isNew = n => !n.accepted_at && !(n.edit_count > 0), isEdited = n => !n.accepted_at && n.edit_count > 0;
    const newCount = notes.filter(isNew).length, editedCount = notes.filter(isEdited).length;
    const shown = notes.filter(n => tab === "all" || (tab === "new" ? isNew(n) : tab === "edited" ? isEdited(n) : !!n.accepted_at));
    return (
      <div className="max-w-xl mx-auto px-4 py-4">{header}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[["new", `New${newCount ? " (" + newCount + ")" : ""}`], ["edited", `Edited${editedCount ? " (" + editedCount + ")" : ""}`], ["accepted", "Accepted"], ["all", "All"]].map(([k, l]) =>
            <button key={k} onClick={() => setTab(k)} className={chip(tab === k) + " py-3"}>{l}</button>)}
        </div>
        {loadErr && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 mb-3">{loadErr}</div>}
        {shown.map(n => <React.Fragment key={n.id}>{NoteCard({ n, staff: true })}</React.Fragment>)}
        {!loadErr && !shown.length && <p className="text-center text-sm text-gray-400 py-6">{tab === "new" ? "No new 2nd Notes 🎉" : tab === "edited" ? "No edited 2nd Notes" : "Nothing here yet."}</p>}
        <button onClick={() => setPicking(true)} className={btn + " w-full border-gray-900 mt-2"}>+ New 2nd Note</button>
      </div>
    );
  }

  if (!isFD && !fhId) return (
    <div className="max-w-xl mx-auto px-4 py-4">{header}
      <div className={card}>
        <label className={lbl}>Funeral home</label>
        <div className="flex flex-wrap gap-2">{formFHs.map(f => <button key={f.id} onClick={() => { setFhId(f.id); setPicking(false); }} className={chip(false)}>{f.name}</button>)}</div>
        {!formFHs.length && <p className="text-sm text-gray-500">No 2nd Note forms set up yet.</p>}
      </div>
    </div>
  );

  if (!form) return (
    <div className="max-w-xl mx-auto px-4 py-4">{header}
      <div className={card}><p className="text-sm font-bold text-gray-600">Your 2nd Note form hasn't been set up yet. Please contact Mortuary Support.</p></div>
    </div>
  );

  // ── Done ──
  if (view === "done" && done) return (
    <div className="max-w-xl mx-auto px-4 py-4">{header}
      <div className={card + " text-center"}>
        <div className="text-5xl mb-3">✅</div>
        <h2 className="text-xl font-black uppercase mb-2">{done.edited ? "2nd Note updated" : "2nd Note submitted"}</h2>
        <p className="text-sm text-gray-600 mb-4">{done.linked ? "Saved to the case documents and the Job Card has been updated." : "Saved. It will be added to the Job Card once the deceased is in our care."}</p>
        {done.conflicts?.length > 0 && <div className="text-left bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs"><b>Not applied (Job Card already had a value):</b><ul className="list-disc ml-4 mt-1">{done.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
        <div className="flex gap-2">
          <button onClick={() => download(done.bytes, done.name)} className={btn + " flex-1 border-gray-900"}>⬇ Download PDF</button>
          <button onClick={() => setView("list")} className={btn + " flex-1 bg-gray-900 text-white border-gray-900"}>Done</button>
        </div>
      </div>
    </div>
  );

  // ── Form ──
  if (view === "form") return (
    <div className="max-w-xl mx-auto px-4 py-4">{header}
      <div className={card}>
        <div className="text-xs font-black uppercase tracking-widest text-gray-400">{fhName}</div>
        <div className="text-lg font-black">{form.title}</div>
        {editing && <div className="mt-2 text-xs font-black uppercase text-orange-600">✎ Editing — first sent {when(editing.submitted_at)}{editing.edit_count > 0 ? ` · ${editing.edit_count} previous edit${editing.edit_count > 1 ? "s" : ""}` : ""}</div>}
      </div>
      {form.nsna && (
        <div className={card + (answers._nsna ? " border-2 border-gray-900" : "")}>
          <label className={lbl}>Is this a MSS NSNA?</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => applyNSNA(true)} className={chip(answers._nsna === true) + " flex-1 py-3"}>Yes</button>
            <button type="button" onClick={() => applyNSNA(false)} className={chip(answers._nsna === false) + " flex-1 py-3"}>No</button>
          </div>
          {answers._nsna && <p className="text-xs text-gray-500 mt-2">Filled in: {Object.entries(form.nsna.set).map(([id, v]) => `${allFields(form).find(f => f.id === id)?.label || id}: ${v}`).join(" · ")}. You can still change any answer below.</p>}
          {answers._nsna && <button type="button" onClick={() => setNsnaShowAll(v => !v)} className="mt-2 text-xs font-black uppercase text-gray-500 underline">{nsnaShowAll ? "Hide sections not needed for NSNA" : `Show all sections (${form.sections.filter(sec => !nsnaKeep(sec)).length} hidden for NSNA)`}</button>}
        </div>
      )}
      <div className={card + (errors._case ? " border-red-400" : "")}>
        <label className={lbl}>Case {errors._case && <span className="text-red-500">— {errors._case}</span>}</label>
        <select className={inp} value={caseId} onChange={e => pickCase(e.target.value)}>
          <option value="">Select…</option>
          {fhCases.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} — {c.caseRef}</option>)}
          {editing?.case_id && !fhCases.some(c => c.id === editing.case_id) && <option value={editing.case_id}>{editing.deceased_name} — {editing.case_ref}</option>}
          <option value="none">Not in our care yet</option>
        </select>
      </div>
      {form.sections.filter(sec => !answers._nsna || nsnaShowAll || nsnaKeep(sec)).map(sec => { const na = !!(sec.na && answers["_na_" + sec.id]); return (
        <div key={sec.title} className={card}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-sm font-black uppercase tracking-wide">{sec.title}</p>
            {sec.na && <button type="button" onClick={() => toggleNA(sec)} className={chip(na)}>{na ? "✓ Not Applicable" : "Not Applicable"}</button>}
          </div>
          <div className={"space-y-4" + (na ? " opacity-30 pointer-events-none select-none" : "")} aria-disabled={na}>
            {sec.fields.map(f => {
              const v = answers[f.id], err = errors[f.id];
              return (
                <div key={f.id}>
                  <label className={lbl}>{f.label}{f.required && " *"} {err && <span className="text-red-500">— {err}</span>}</label>
                  {f.type === "text" && <input className={inp + (f.auto ? " bg-gray-50 text-gray-500" : "")} value={v || ""} readOnly={!!f.auto} placeholder={f.auto ? "Calculated from DOB & DOD" : ""} onChange={e => setA(f.id, e.target.value)} />}
                  {f.type === "date" && <input type="date" className={inp} value={v || ""} onChange={e => setA(f.id, e.target.value)} />}
                  {f.type === "time" && <TimeButtons value={v || ""} onChange={val => setA(f.id, val)} />}
                  {f.type === "textarea" && <textarea className={inp + " min-h-[90px]"} value={v || ""} onChange={e => setA(f.id, e.target.value)} />}
                  {f.type === "place" && <PlaceInput value={v || ""} onChange={val => setA(f.id, val)} />}
                  {f.type === "choice" && <div className="flex flex-wrap gap-2">{f.options.map(o => <button key={o.v} type="button" onClick={() => setA(f.id, v === o.v ? "" : o.v)} className={chip(v === o.v)}>{o.v}</button>)}</div>}
                  {f.type === "choice" && f.options.find(o => o.v === v)?.other && <input className={inp + " mt-2"} placeholder="Please specify…" value={answers[f.id + "Other"] || ""} onChange={e => setA(f.id + "Other", e.target.value)} />}
                  {f.type === "multi" && <div className="flex flex-wrap gap-2">{f.options.map(o => { const cur = v || [], on = cur.includes(o.v); return <button key={o.v} type="button" onClick={() => setA(f.id, on ? cur.filter(x => x !== o.v) : [...cur, o.v])} className={chip(on)}>{o.v}</button>; })}</div>}
                  {f.type === "check" && <button type="button" onClick={() => setA(f.id, !v)} className={chip(!!v)}>{v ? "✓ Yes" : "No"}</button>}
                </div>
              );
            })}
          </div>
        </div>
      ); })}
      <div id="np-card" className={card}>
        <p className="text-sm font-black uppercase tracking-wide mb-3">Name Plate</p>
        <NamePlateEditor value={answers._plate||defaultPlate(answers)} onChange={val=>setA("_plate",val)} person={answers}/>
      </div>
      {(isCremation(answers) || answers._drref?.token) && <DrRefCard answers={answers} setA={setA} files={drFiles} setFiles={setDrFiles} caseDocs={caseDocs} error={errors._drref} pubUrl={pubUrl}
        canResend={!!editing} onSaveDocs={saveDrDocs} busy={drBusy} onResend={async () => { if (await sendDrRef(editing.id)) { const r = await sb(`second_notes?select=answers&id=eq.${editing.id}`); if (r?.[0]) setAnswers(a => ({ ...a, _drref: r[0].answers._drref })); loadNotes(); } }}/>}
      <button disabled={busy} onClick={submit} className={btn + " w-full bg-gray-900 text-white border-gray-900 disabled:opacity-50"}>{busy ? "Submitting…" : editing ? "Submit changes" : "Submit 2nd Note"}</button>
    </div>
  );

  // ── List ──
  return (
    <div className="max-w-xl mx-auto px-4 py-4">{header}
      {!isFD && <div className="flex items-center justify-between mb-3"><span className="text-sm font-black">{fhName}</span><button onClick={() => setFhId("")} className="text-xs font-black uppercase text-gray-500 underline">Change</button></div>}
      <button onClick={startNew} className={btn + " w-full bg-gray-900 text-white border-gray-900 mb-4"}>+ New 2nd Note</button>
      {loadErr && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 mb-3">{loadErr}</div>}
      {notes.map(n => <React.Fragment key={n.id}>{NoteCard({ n, staff: !isFD })}</React.Fragment>)}
      {!loadErr && !notes.length && <p className="text-center text-sm text-gray-400 py-6">No 2nd Notes yet.</p>}
    </div>
  );
}

// ── 📄 Dr Ref on its own (FD home button). Same request as in the 2nd Note: one record per deceased. ──
export function DrRefOnly({ user, cases, onBack, api }) {
  const { sb, logActivity, SUPABASE_URL, SUPABASE_KEY, FUNERAL_HOMES, STORAGE_BUCKET } = api;
  const isFD = user?.role === "fd";
  const [fhId, setFhId] = useState(isFD ? user?.funeralHomeId || "" : "");
  const fhName = FUNERAL_HOMES.find(f => f.id === fhId)?.name || "";
  const fhList = useMemo(() => [...FUNERAL_HOMES].sort((a, b) => String(a.name).localeCompare(String(b.name))), [FUNERAL_HOMES]);
  const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const pubUrl = p => `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${String(p || "").split("/").map(encodeURIComponent).join("/")}`;
  const fmt = x => x ? new Date(x).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
  const normName = s => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
  const mine = useMemo(() => cases.filter(c => c.status === "active" && !c.checkedOut && c.funeralHomeId === fhId).sort((a, b) => (a.lastName || "").localeCompare(b.lastName || "")), [cases, fhId]);
  const [list, setList] = useState(null);
  const [pick, setPick] = useState("");
  const [man, setMan] = useState({ firstName: "", lastName: "", dob: "", dod: "" });
  const [found, setFound] = useState(null);        // the record for this deceased (2nd Note or Dr Ref only)
  const [files, setFiles] = useState({});
  const [caseDocs, setCaseDocs] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const c = pick && pick !== "none" ? cases.find(x => x.id === pick) : null;
  const who = c ? { firstName: c.firstName || "", lastName: c.lastName || "", dob: c.dob || "", dod: c.dod || "" } : man;
  const load = () => !fhId ? setList([]) : sb(`second_notes?select=*&funeral_home_id=eq.${fhId}&answers->_drref->>token=not.is.null&order=submitted_at.desc&limit=200`).then(r => setList(r || [])).catch(() => setList([]));
  useEffect(() => { setPick(""); setFound(null); setList(null); load(); }, [fhId]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [found?.id]);
  async function findRec(caseId, ans) {
    const rows = await sb(`second_notes?select=*&funeral_home_id=eq.${fhId}&limit=500`);
    return rows.find(n => (caseId && n.case_id === caseId) || (normName(n.deceased_name) && normName(n.deceased_name) === normName([ans.firstName, ans.lastName].filter(Boolean).join(" ")))) || null;
  }
  useEffect(() => { setFiles({}); setErr(""); setSent(""); setFound(null);
    if (!c) { setCaseDocs([]); return; }
    findRec(c.id, who).then(setFound).catch(() => {});
    fetch(`${SUPABASE_URL}/storage/v1/object/list/${STORAGE_BUCKET}`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: `${c.id}/`, limit: 100, sortBy: { column: "created_at", order: "desc" } }) })
      .then(r => r.json()).then(l => setCaseDocs((Array.isArray(l) ? l : []).filter(f => f.name && !f.name.endsWith("/")).map(f => ({ name: f.name.replace(/^\d+_/, "").replace(/_/g, " "), path: `${c.id}/${f.name}` })))).catch(() => setCaseDocs([]));
  }, [pick]);
  async function upFile(noteId, dd, f) {
    const ext = (f.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
    const path = `drref/${noteId}/${dd.key}_${Date.now()}.${ext}`;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, { method: "POST", headers: { ...H, "Content-Type": f.type || "application/octet-stream", "x-upsert": "true" }, body: f });
    if (!r.ok) throw new Error(dd.label + " upload failed (" + r.status + "). If the file is very large, try a smaller scan or PDF.");
    return { key: dd.key, label: dd.label, path, name: f.name };
  }
  async function email(noteId, resend) {
    const r = await fetch("/api/drref", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request", noteId, resend: !!resend }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.status);
  }
  const reload = async id => { const r = await sb(`second_notes?select=*&id=eq.${id}`); if (r?.[0]) setFound(r[0]); load(); };
  async function request() {
    setErr("");
    if (!pick) return setErr("Choose the deceased.");
    if (!who.firstName.trim() || !who.lastName.trim()) return setErr("Enter the deceased's first and last name.");
    const miss = DR_DOCS.filter(dd => dd.req && !files[dd.key] && !caseDocs.find(x => dd.re.test(x.name || ""))).map(dd => dd.label);
    if (miss.length) return setErr("Upload: " + miss.join(", "));
    setBusy(true);
    try {
      const rec = await findRec(c?.id, who);
      if (rec?.answers?._drref?.token) { setFound(rec); setBusy(false); return; }
      const noteId = rec?.id || crypto.randomUUID();
      const docs = [];
      for (const dd of DR_DOCS) { const f = files[dd.key], have = caseDocs.find(x => dd.re.test(x.name || ""));
        if (f) docs.push(await upFile(noteId, dd, f)); else if (have) docs.push({ key: dd.key, label: dd.label, path: have.path, name: have.name }); }
      const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");
      const _drref = { token, requestedAt: new Date().toISOString(), requestedBy: `${user?.name || ""}${isFD ? (fhName ? " (" + fhName + ")" : "") : " (MSS)"}`, docs, via: "Dr Ref button" };
      if (rec) await sb(`second_notes?id=eq.${rec.id}`, { method: "PATCH", body: JSON.stringify({ answers: { ...(rec.answers || {}), _drref } }) });
      else await sb("second_notes", { method: "POST", body: JSON.stringify({
        id: noteId, funeral_home_id: fhId, funeral_home_name: fhName, case_id: c?.id || null, case_ref: c?.caseRef || null,
        deceased_name: [who.firstName, who.lastName].join(" ").trim(), pdf_path: null,
        answers: { firstName: who.firstName.trim(), lastName: who.lastName.trim(), dob: who.dob, dod: who.dod, disposition: "Cremation", _drOnly: true, _drref },
        submitted_by: user?.name || "", submitted_role: user?.role || "", status: c ? "linked" : "awaiting",
        accepted_at: new Date().toISOString(), accepted_by: "Dr Ref only" }) });
      setFiles({});
      try { await email(noteId); setSent("✓ Dr Ref request emailed to the doctor. You'll be emailed when the Dr Ref comes back."); }
      catch (e) { setSent("The request is saved, but it couldn't be emailed to the doctor (" + e.message + "). Tap 'Send request to the doctor now' below, or call MSS."); }
      logActivity(user, "DR REF REQUESTED", `${fhName} Dr Ref for ${who.firstName} ${who.lastName}${c ? "" : " (not in care yet)"}`, c?.caseRef || "", c?.id || "");
      await reload(noteId);
    } catch (e) { setErr("Error: " + e.message); }
    setBusy(false);
  }
  async function saveDocs() {
    setBusy(true);
    try {
      const fresh = (await sb(`second_notes?select=answers&id=eq.${found.id}`))?.[0]?.answers || {};
      const d = fresh._drref; if (!d?.token || d.receivedAt) throw new Error(d?.receivedAt ? "The Dr Ref has already been received" : "No Dr Ref request");
      const docs = [...(d.docs || [])];
      for (const dd of DR_DOCS) { const f = files[dd.key]; if (!f) continue; const item = await upFile(found.id, dd, f); const i = docs.findIndex(x => x.key === dd.key); if (i >= 0) docs[i] = item; else docs.push(item); }
      await sb(`second_notes?id=eq.${found.id}`, { method: "PATCH", body: JSON.stringify({ answers: { ...fresh, _drref: { ...d, docs, docsUpdatedAt: new Date().toISOString(), docsUpdatedBy: user?.name || "" } } }) });
      setFiles({}); await email(found.id, true); setSent("✓ Updated Dr Ref request emailed to the doctor."); await reload(found.id);
    } catch (e) { alert("Couldn't update the Dr Ref documents: " + e.message); }
    setBusy(false);
  }
  const open = n => { setPick(""); setTimeout(() => { setFiles({}); setSent(""); setErr(""); setFound(n); }, 0); };
  // Saves the received Dr Ref straight to the device (Downloads), named after the deceased
  async function download(n) {
    const d = n.answers._drref, ext = (d.receivedPath.split(".").pop() || "pdf").toLowerCase();
    const name = `Dr_Ref_${String(n.answers?.lastName || "").toUpperCase()}_${n.answers?.firstName || ""}`.replace(/[^A-Za-z0-9]+/g, "_").replace(/_+$/, "") + "." + ext;
    try {
      const r = await fetch(pubUrl(d.receivedPath)); if (!r.ok) throw new Error(r.status);
      const url = URL.createObjectURL(await r.blob()), a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { window.open(pubUrl(d.receivedPath), "_blank"); }
  }
  const nm = n => n.answers?.lastName ? `${String(n.answers.lastName).toUpperCase()}, ${n.answers.firstName || ""}` : (n.deceased_name || "—");
  const has = found?.answers?._drref?.token;
  const pickBtn = on => "text-left px-4 py-3 rounded-xl border-2 font-black text-sm transition " + (on ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-200 text-gray-800 hover:border-gray-600");
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={has ? () => { setFound(null); setPick(""); setSent(""); } : onBack} className="mb-4 px-4 py-2 rounded-xl border-2 border-gray-900 font-black text-sm uppercase">‹ Back</button>
      <h1 className="text-2xl font-black mb-1">📄 Dr Ref</h1>
      <p className="text-sm text-gray-500 mb-4">{isFD ? "Request a Dr Ref (medical referee) for a cremation without doing a 2nd Note. It's the same request as in the 2nd Note: when you do the 2nd Note later it joins this one, and you only request it once." : "Request a Dr Ref for a funeral director's client without a 2nd Note. Choose the funeral director to see their clients. When their 2nd Note comes in later it joins this request, so it's only requested once. The funeral director and MSS are emailed when the Dr Ref comes back."}</p>
      {has ? <>
        <div className={card}><div className="font-black">{nm(found)}</div><div className="text-xs text-gray-500">{found.case_ref || "Not yet in MSS care"} · {found.funeral_home_name}</div></div>
        {sent && <p className={"mb-3 text-sm font-bold " + (sent.startsWith("✓") ? "text-green-700" : "text-red-600")}>{sent}</p>}
        <DrRefCard answers={found.answers} setA={() => {}} files={files} setFiles={setFiles} caseDocs={[]} pubUrl={pubUrl} canResend busy={busy} onSaveDocs={saveDocs}
          onResend={async () => { try { await email(found.id); setSent("✓ Dr Ref request emailed to the doctor."); await reload(found.id); } catch (e) { alert("Couldn't email the doctor: " + e.message); } }} />
      </> : <>
        {!isFD && <div className={card}>
          <label className={lbl}>Funeral director</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {fhList.map(f => <button key={f.id} type="button" onClick={() => setFhId(f.id)} className={pickBtn(fhId === f.id)}>{f.name}</button>)}
          </div>
        </div>}
        {fhId && <><div className={card}>
          <label className={lbl}>1. Deceased{!isFD && fhName ? " — " + fhName + " clients" : ""}</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {mine.map(x => <button key={x.id} type="button" onClick={() => setPick(x.id)} className={pickBtn(pick === x.id)}>
              {String(x.lastName || "").toUpperCase()}, {x.firstName}<span className={"block text-xs font-bold " + (pick === x.id ? "text-gray-300" : "text-gray-500")}>{x.caseRef}</span></button>)}
            <button type="button" onClick={() => setPick("none")} className={pickBtn(pick === "none") + " border-dashed"}>＋ Not in our care yet<span className={"block text-xs font-bold " + (pick === "none" ? "text-gray-300" : "text-gray-500")}>Enter the details</span></button>
          </div>
          {mine.length === 0 && <p className="mt-2 text-xs text-gray-500">No clients in MSS care right now.</p>}
          {pick === "none" && <div className="grid grid-cols-2 gap-2 mt-3">
            {[["firstName", "First name(s)", "text"], ["lastName", "Last name", "text"], ["dob", "Date of birth", "date"], ["dod", "Date of death", "date"]].map(([k, l, t]) =>
              <label key={k} className="block"><span className={lbl}>{l}</span><input type={t} className={inp} value={man[k]} onChange={e => setMan(m => ({ ...m, [k]: e.target.value }))} /></label>)}
          </div>}
          {found && !found.answers?._drref?.token && found.pdf_path && <p className="mt-2 text-xs text-gray-500">This deceased already has a 2nd Note; the Dr Ref will be added to it.</p>}
        </div>
        {pick && <>
          <p className={lbl + " mt-2"}>2. Documents</p>
          <DrRefCard answers={{}} setA={() => {}} files={files} setFiles={setFiles} caseDocs={caseDocs} error={err.startsWith("Upload") ? err : ""} pubUrl={pubUrl} standalone />
          {err && !err.startsWith("Upload") && <p className="text-red-600 text-sm font-bold mb-2">{err}</p>}
          <button type="button" disabled={busy} onClick={request} className="w-full py-4 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-black uppercase tracking-wide">{busy ? "Sending…" : "📄 Send Dr Ref request to the doctor"}</button>
        </>}
        <p className={lbl + " mt-8"}>{isFD ? "Your Dr Ref requests" : fhName + " Dr Ref requests"}</p>
        {list === null ? <p className="text-sm text-gray-400">Loading…</p> : list.length === 0 ? <p className="text-sm text-gray-400">None yet.</p> :
          <div className="space-y-2">{list.map(n => { const d = n.answers._drref; return (
            <div key={n.id} className="bg-white border border-gray-200 hover:border-gray-500 rounded-2xl flex items-center gap-2 pr-3">
              <button type="button" onClick={() => open(n)} className="flex-1 text-left p-3 flex items-center gap-3">
                <div className="flex-1"><div className="font-black text-sm">{nm(n)}</div><div className="text-xs text-gray-500">{n.case_ref || "Not yet in care"} · requested {fmt(d.requestedAt)}</div></div>
                {d.receivedAt ? <span className="text-xs font-black text-green-700">✓ Received</span> : <span className="text-xs font-black text-amber-700">⏳ Waiting</span>}
              </button>
              {d.receivedPath && <button type="button" onClick={() => download(n)} className="px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-black uppercase">⬇ Download</button>}
            </div>); })}</div>}
      </>}
      </>}
    </div>);
}
