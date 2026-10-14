import React, { useState, useEffect, useMemo, useRef } from "react";
import FORMS from "./secondNoteForms.json";

// ─── 2ND NOTES ────────────────────────────────────────────────────────────────
// Each funeral home has its own form in secondNoteForms.json (fields, PDF
// positions, Job Card mapping) and its blank PDF in /public/forms/.
// Adding a new FD = add a JSON entry + drop their PDF in public/forms.

const INK = [0.05, 0.15, 0.45];
const isEmpty = v => v == null || v === "" || (Array.isArray(v) && v.length === 0);

function fmtDate(iso, style) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
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
  return String(v);
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
async function buildPdf(form, answers, submittedAt) {
  const { PDFDocument, rgb, StandardFonts } = await import("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js");
  const tpl = await fetch(form.template);
  if (!tpl.ok) throw new Error("Form template not found: " + form.template);
  const doc = await PDFDocument.load(await tpl.arrayBuffer());
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.getPages()[0];
  const H = page.getSize().height;
  const ink = rgb(...INK);

  const text = (s, x, lb, maxW, size = 11) => {
    while (size > 7 && font.widthOfTextAtSize(s, size) > maxW) size -= 0.5;
    page.drawText(s, { x, y: H - (lb - 7), size, font, color: ink });
  };
  const circle = ([x0, t, x1, b]) => page.drawEllipse({
    x: (x0 + x1) / 2, y: H - (t + b + 1) / 2,
    xScale: (x1 - x0) / 2 + 3, yScale: (b - t) / 2 + 1,
    borderColor: ink, borderWidth: 1.2,
  });

  for (const f of allFields(form)) {
    const v = answers[f.id];
    if (isEmpty(v) || v === false) continue;
    if (f.type === "date" && f.slots) {
      const [y, m, d] = v.split("-");
      [d, m, y].forEach((part, i) => {
        const [a, b] = f.slots[i];
        const w = font.widthOfTextAtSize(part, 10);
        page.drawText(part, { x: (a + b) / 2 - w / 2, y: H - (f.at[1] - 7), size: 10, font, color: ink });
      });
    } else if (["text", "date", "time", "place"].includes(f.type)) {
      if (f.at) text(display(f, v), ...f.at);
    } else if (f.type === "choice") {
      const o = f.options.find(o => o.v === v);
      if (o?.box) circle(o.box);
      if (o?.textAt) text((o.prefix || "") + display(f, v, answers), ...o.textAt);
      if (f.at) text((f.printLabel || "") + display(f, v, answers), ...f.at);
    } else if (f.type === "check") {
      circle(f.box);
    } else if (f.type === "textarea") {
      const size = 10.5, lines = f.lines;
      let li = 0, cur = "";
      const flush = () => { if (li < lines.length && cur) { const [x, lb] = lines[li]; page.drawText(cur, { x, y: H - (lb - 7), size, font, color: ink }); } li++; cur = ""; };
      for (const w of String(v).split(/\s+/)) {
        const tryS = cur ? cur + " " + w : w;
        if (li < lines.length && font.widthOfTextAtSize(tryS, size) > lines[li][2]) { flush(); cur = w; }
        else cur = tryS;
      }
      flush();
    }
  }
  if (form.stamp) {
    const t = new Date(submittedAt || Date.now());
    const d = t.toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "2-digit", year: "numeric" });
    const h = t.toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s/g, "").toLowerCase();
    text(`${form.stamp.prefix || ""}${d} ${h}`, ...form.stamp.at, form.stamp.size || 9);
  }
  for (const p of form.prints || []) {
    const s = p.compose.map(id => answers[id]).filter(v => !isEmpty(v)).join(" ");
    if (s) text(s, ...p.at);
  }
  return await doc.save();
}

// ─── JOB CARD MERGE (fills empty fields only) ────────────────────────────────
function mergeIntoJobCard(caseData, form, answers, meta) {
  const prep = { ...(caseData.prep || {}) };
  const conflicts = [];
  for (const f of allFields(form)) {
    const a = answers[f.id];
    if (!f.job || isEmpty(a)) continue;
    let val = a;
    if (f.map) val = f.map[a];
    if (f.match) {
      const hit = f.match.find(([re]) => new RegExp(re, "i").test(a));
      val = hit ? hit[1] : undefined;
    }
    if (isEmpty(val)) continue;
    if (isEmpty(prep[f.job])) {
      prep[f.job] = val;
      if (f.jobAlso) Object.entries(f.jobAlso).forEach(([k, v]) => { if (isEmpty(prep[k])) prep[k] = v; });
    } else if (JSON.stringify(prep[f.job]) !== JSON.stringify(val)) {
      const kept = Array.isArray(prep[f.job]) ? prep[f.job].join(", ") : String(prep[f.job]);
      conflicts.push(`${f.label}: 2nd Note says "${display(f, a, answers)}", Job Card kept "${kept}"`);
    }
  }
  // Append the full 2nd Note summary to Job Card comments (never overwrites)
  const marker = `2ND NOTE #${meta.noteId.slice(0, 6)}`;
  if (!(prep.comments || "").includes(marker)) {
    const lines = form.sections.map(s => s.fields
      .filter(f => f.summary !== false && !isEmpty(answers[f.id]) && answers[f.id] !== false)
      .map(f => `${f.label}: ${display(f, answers[f.id], answers)}`).join(" · ")).filter(Boolean);
    const block = [
      `── ${marker} · ${meta.fhName} · ${fmtDate(new Date().toISOString().slice(0, 10))} · ${meta.by} ──`,
      ...lines,
      ...(conflicts.length ? ["⚠ NOT APPLIED (Job Card already set): " + conflicts.join(" | ")] : []),
    ].join("\n");
    prep.comments = prep.comments ? prep.comments + "\n\n" + block : block;
  }
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
  const [done, setDone] = useState(null);
  const [linking, setLinking] = useState(null);
  const [picking, setPicking] = useState(false);
  const [tab, setTab] = useState("new");

  const form = FORMS[fhId];
  const fhName = FUNERAL_HOMES.find(f => f.id === fhId)?.name || "";
  const formFHs = FUNERAL_HOMES.filter(f => FORMS[f.id]);
  const inCare = useMemo(() => cases.filter(c => c.status === "active" && !c.checkedOut), [cases]);
  const fhCases = useMemo(() => inCare.filter(c => c.funeralHomeId === fhId), [inCare, fhId]);

  useEffect(() => { loadNotes(); }, [fhId]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [view]);

  async function loadNotes() {
    try {
      const q = "second_notes?select=*&order=submitted_at.desc&limit=100" + (fhId ? `&funeral_home_id=eq.${fhId}` : "");
      setNotes(await sb(q)); setLoadErr("");
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

  async function applyToCase(c, ans, noteId, frm = form, fhN = fhName) {
    const { prep, conflicts } = mergeIntoJobCard(c, frm, ans, { noteId, fhName: fhN, by: ans.arrangedBy || user.name });
    await updateCase(c.id, { prep });
    onUpdateCase(c.id, { prep });
    return conflicts;
  }

  function startNew() {
    const arr = allFields(form).find(f => f.id === "arrangedBy");
    const first = (user?.name || "").split(" ")[0].toLowerCase();
    const pre = arr?.type === "choice" ? (arr.options.find(o => o.v.toLowerCase() === first)?.v || "") : (user?.name || "");
    setAnswers({ arrangedBy: pre }); setCaseId(""); setErrors({}); setDone(null); setView("form");
  }
  function pickCase(id) {
    setCaseId(id);
    const c = cases.find(x => x.id === id);
    if (c) {
      const age = calcAge(c.dob, c.dod);
      setAnswers(a => ({ ...a, firstName: c.firstName || "", lastName: c.lastName || "", dod: c.dod || "", dob: c.dob || "", age }));
    }
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

  async function submit() {
    const errs = {};
    if (!caseId) errs._case = "Choose the case, or 'Not in our care yet'";
    allFields(form).forEach(f => { if (f.required && isEmpty(answers[f.id])) errs[f.id] = "Required"; });
    setErrors(errs);
    if (Object.keys(errs).length) { alert("Please complete the highlighted fields."); return; }
    setBusy(true);
    try {
      const noteId = crypto.randomUUID();
      const c = caseId !== "none" ? cases.find(x => x.id === caseId) : null;
      const bytes = await buildPdf(form, answers);
      const name = fileName(answers);
      const path = c ? `${c.id}/${Date.now()}_${name}` : `second-notes/${noteId}.pdf`;
      await uploadPdf(path, bytes);
      await sb("second_notes", { method: "POST", body: JSON.stringify({
        id: noteId, funeral_home_id: fhId, funeral_home_name: fhName,
        case_id: c?.id || null, case_ref: c?.caseRef || null,
        deceased_name: nameOf(answers), answers, pdf_path: path,
        submitted_by: user?.name || "", submitted_role: user?.role || "",
        status: c ? "linked" : "awaiting",
      }) });
      const conflicts = c ? await applyToCase(c, answers, noteId) : [];
      logActivity(user, "2ND NOTE", `${fhName} 2nd Note for ${nameOf(answers)}${c ? "" : " (not in care yet)"}`, c?.caseRef || "", c?.id || "");
      download(bytes, name);
      setDone({ bytes, name, linked: !!c, conflicts });
      setView("done");
      loadNotes();
    } catch (e) { alert("Error: " + e.message); }
    setBusy(false);
  }

  async function linkNote(note, newCaseId) {
    const c = cases.find(x => x.id === newCaseId);
    const frm = FORMS[note.funeral_home_id];
    if (!c || !frm) return;
    if (c.funeralHomeId !== note.funeral_home_id && !confirm(`${c.firstName} ${c.lastName} is under ${c.funeralHomeName}, but this 2nd Note is from ${note.funeral_home_name}. Assign anyway?`)) { setLinking(null); return; }
    setBusy(true);
    try {
      const bytes = await buildPdf(frm, note.answers, note.submitted_at);
      const path = `${c.id}/${Date.now()}_${fileName(note.answers, frm)}`;
      await uploadPdf(path, bytes);
      const upd = { case_id: c.id, case_ref: c.caseRef, pdf_path: path, status: "linked" };
      if (!isFD && !note.accepted_at) Object.assign(upd, { accepted_at: new Date().toISOString(), accepted_by: user?.name || "" });
      await sb(`second_notes?id=eq.${note.id}`, { method: "PATCH", body: JSON.stringify(upd) });
      const conflicts = await applyToCase(c, note.answers, note.id, frm, note.funeral_home_name);
      logActivity(user, "2ND NOTE LINKED", `${note.deceased_name} → ${c.caseRef}`, c.caseRef, c.id);
      alert(`Linked to ${c.caseRef}. Job Card updated.` + (conflicts.length ? `\n\nNot applied (already set):\n• ${conflicts.join("\n• ")}` : ""));
      setLinking(null); loadNotes();
    } catch (e) { alert("Error: " + e.message); }
    setBusy(false);
  }

  async function acceptNote(note) {
    setBusy(true);
    try {
      const upd = { accepted_at: new Date().toISOString(), accepted_by: user?.name || "" };
      await sb(`second_notes?id=eq.${note.id}`, { method: "PATCH", body: JSON.stringify(upd) });
      setNotes(ns => ns.map(n => n.id === note.id ? { ...n, ...upd } : n));
      logActivity(user, "2ND NOTE ACCEPTED", `${note.funeral_home_name} 2nd Note for ${note.deceased_name}`, note.case_ref || "", note.case_id || "");
    } catch (e) { alert("Error: " + e.message + (String(e.message).includes("accepted") ? "\n\nRun the 2nd Notes accept SQL in Supabase." : "")); }
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
      <div className={card + (staff && !n.accepted_at ? " border-l-4 border-l-red-500" : "")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {staff && <div className="text-[11px] font-black uppercase tracking-widest text-gray-400">{n.funeral_home_name}</div>}
            <div className="font-black">{n.deceased_name || "—"}</div>
            <div className="text-xs text-gray-500">{when(n.submitted_at)} · {n.answers?.arrangedBy || n.submitted_by}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {n.accepted_at
                ? <span className="text-xs font-black uppercase text-green-700">✓ Accepted{n.accepted_by ? " · " + n.accepted_by : ""}</span>
                : staff ? <span className="text-xs font-black uppercase text-red-600">● New</span> : <span className="text-xs font-black uppercase text-gray-500">Sent · awaiting MSS</span>}
              {n.status === "linked"
                ? <span className="text-xs font-black uppercase text-green-700">✓ On Job Card · {n.case_ref}</span>
                : <span className="text-xs font-black uppercase text-amber-600">⏳ Not in care yet</span>}
            </div>
          </div>
          <a href={pdfUrl(n.pdf_path)} target="_blank" rel="noreferrer" className="text-xs font-black uppercase underline whitespace-nowrap">View PDF</a>
        </div>
        {(staff || n.status !== "linked") && (
          <div className="flex gap-2 mt-3">
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
    const newCount = notes.filter(n => !n.accepted_at).length;
    const shown = notes.filter(n => tab === "all" || (tab === "new" ? !n.accepted_at : !!n.accepted_at));
    return (
      <div className="max-w-xl mx-auto px-4 py-4">{header}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[["new", `New${newCount ? " (" + newCount + ")" : ""}`], ["accepted", "Accepted"], ["all", "All"]].map(([k, l]) =>
            <button key={k} onClick={() => setTab(k)} className={chip(tab === k) + " py-3"}>{l}</button>)}
        </div>
        {loadErr && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 mb-3">{loadErr}</div>}
        {shown.map(n => <React.Fragment key={n.id}>{NoteCard({ n, staff: true })}</React.Fragment>)}
        {!loadErr && !shown.length && <p className="text-center text-sm text-gray-400 py-6">{tab === "new" ? "No new 2nd Notes 🎉" : "Nothing here yet."}</p>}
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
        <h2 className="text-xl font-black uppercase mb-2">2nd Note submitted</h2>
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
      </div>
      <div className={card + (errors._case ? " border-red-400" : "")}>
        <label className={lbl}>Case {errors._case && <span className="text-red-500">— {errors._case}</span>}</label>
        <select className={inp} value={caseId} onChange={e => pickCase(e.target.value)}>
          <option value="">Select…</option>
          {fhCases.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} — {c.caseRef}</option>)}
          <option value="none">Not in our care yet</option>
        </select>
      </div>
      {form.sections.map(sec => (
        <div key={sec.title} className={card}>
          <p className="text-sm font-black uppercase tracking-wide mb-3">{sec.title}</p>
          <div className="space-y-4">
            {sec.fields.map(f => {
              const v = answers[f.id], err = errors[f.id];
              return (
                <div key={f.id}>
                  <label className={lbl}>{f.label}{f.required && " *"} {err && <span className="text-red-500">— {err}</span>}</label>
                  {f.type === "text" && <input className={inp + (f.auto ? " bg-gray-50 text-gray-500" : "")} value={v || ""} readOnly={!!f.auto} placeholder={f.auto ? "Calculated from DOB & DOD" : ""} onChange={e => setA(f.id, e.target.value)} />}
                  {f.type === "date" && <input type="date" className={inp} value={v || ""} onChange={e => setA(f.id, e.target.value)} />}
                  {f.type === "time" && <input type="time" step="900" className={inp} value={v || ""} onChange={e => setA(f.id, e.target.value)} />}
                  {f.type === "textarea" && <textarea className={inp + " min-h-[90px]"} value={v || ""} onChange={e => setA(f.id, e.target.value)} />}
                  {f.type === "place" && <PlaceInput value={v || ""} onChange={val => setA(f.id, val)} />}
                  {f.type === "choice" && <div className="flex flex-wrap gap-2">{f.options.map(o => <button key={o.v} type="button" onClick={() => setA(f.id, v === o.v ? "" : o.v)} className={chip(v === o.v)}>{o.v}</button>)}</div>}
                  {f.type === "choice" && f.options.find(o => o.v === v)?.other && <input className={inp + " mt-2"} placeholder="Please specify…" value={answers[f.id + "Other"] || ""} onChange={e => setA(f.id + "Other", e.target.value)} />}
                  {f.type === "check" && <button type="button" onClick={() => setA(f.id, !v)} className={chip(!!v)}>{v ? "✓ Yes" : "No"}</button>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <button disabled={busy} onClick={submit} className={btn + " w-full bg-gray-900 text-white border-gray-900 disabled:opacity-50"}>{busy ? "Submitting…" : "Submit 2nd Note"}</button>
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
