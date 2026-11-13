// Public page for the medical referee: /?drref=TOKEN  (no login). Shows the deceased, the documents, and takes the Dr Ref upload.
import React, { useEffect, useState } from "react";
const SUPABASE_URL = "https://qhazwfbhbelpcfwczjdb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYXp3ZmJoYmVscGNmd2N6amRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4ODQ1MTEsImV4cCI6MjA5NjQ2MDUxMX0.2xg7Kj56r7n_x2nZxbttqZU6Rly6ZSSnpuequpyihBo";
const BUCKET = "Case-documents";

export default function DrRefPage({ token }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [file, setFile] = useState(null);
  const [doctor, setDoctor] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    document.title = "Dr Ref upload – Mortuary Support";
    fetch(`/api/drref?t=${encodeURIComponent(token)}`).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "This link is not valid."); setInfo(j); }).catch(e => setErr(e.message));
  }, [token]);

  function pick(f) {
    if (!f) return;
    if (f.size > 30 * 1024 * 1024) { alert("That file is over 30 MB. Please send a smaller PDF."); return; }
    if (!/pdf|jpe?g|png|heic|heif/i.test(f.type + f.name)) { alert("Please choose a PDF or a photo (JPG, PNG, HEIC)."); return; }
    setFile(f);
  }

  // One tap: the pre-filled, signed Cremation Permit we sent is correct → it becomes the Dr Ref
  async function approve() {
    setBusy(true);
    try {
      const r = await fetch("/api/drref", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", t: token, approved: true, doctor: doctor.trim() || info.referee, note }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
      setDone({ ...j, doctor: doctor.trim() || info.referee });
    } catch (e) { alert(e.message); }
    setBusy(false);
  }
  async function send() {
    if (!file) { alert("Please choose your Dr Ref file."); return; }
    if (!doctor.trim()) { alert("Please type your name."); return; }
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
      const path = `${info.uploadDir}/DrRef_${Date.now()}.${ext}`;
      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" }, body: file });
      if (!up.ok) throw new Error("The upload didn't go through. Please try again.");
      const r = await fetch("/api/drref", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", t: token, path, filename: file.name, doctor, note }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
      setDone({ ...j, doctor });
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  const lbl = "text-[11px] font-black tracking-widest text-gray-500 uppercase";
  const card = "bg-white border border-gray-200 rounded-2xl p-5";
  const shell = body => (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3">
        <div className="bg-gray-900 text-white font-black text-xs px-3 py-2 rounded-lg">LUMIÈRE</div>
        <div><div className="text-[11px] font-black tracking-[0.3em]">MORTUARY SUPPORT</div><div className="text-[9px] tracking-[0.4em] text-gray-500">DR REF</div></div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">{body}</div>
    </div>);
  const help = <p className="text-center text-xs text-gray-500">Questions? Call Mortuary Support on 02 8814 5500 or email info@mortuarysupport.com.au</p>;

  if (err) return shell(<><div className={card + " text-center py-10"}><div className="text-4xl">🔒</div><div className="text-xl font-black mt-2">{err}</div><p className="text-sm text-gray-600 mt-2">Please use the link in your latest request email.</p></div>{help}</>);
  if (!info) return shell(<p className="text-center text-gray-500 py-10">Loading…</p>);
  if (done) return shell(<><div className={card + " text-center py-10"}><div className="w-16 h-16 rounded-full bg-green-600 text-white text-4xl leading-[64px] mx-auto">✓</div><div className="text-2xl font-black mt-4">{done.approved ? "Approved — thank you" : "Dr Ref received — thank you"}</div><div className="text-gray-600 mt-2">{done.name}{done.caseRef ? " · " + done.caseRef : ""}</div><p className="text-sm text-gray-600 mt-4">{done.approved ? "Approved" : "Uploaded"} by {done.doctor} on {done.at}.<br />The funeral director and Mortuary Support have been notified.<br />You can close this page.</p></div>{help}</>);
  if (info.received) return shell(<><div className={card + " text-center py-10"}><div className="text-4xl">🔒</div><div className="text-xl font-black mt-2">This link has already been used</div><p className="text-sm text-gray-600 mt-2">A Dr Ref for {info.name} was uploaded on {info.receivedAt}.<br />Need to send a corrected one? Call Mortuary Support on 02 8814 5500 or email info@mortuarysupport.com.au.</p></div></>);

  return shell(<>
    <div className={card}>
      <div className={lbl}>Dr Ref requested for</div>
      <div className="text-2xl font-black mt-1">{info.name}</div>
      <div className="text-sm text-gray-600 mt-1">Born {info.dob} · Died {info.dod}{info.caseRef ? " · " + info.caseRef : ""} · {info.fh}</div>
      {info.requestedAt && <div className="inline-block mt-3 bg-amber-100 text-amber-800 font-extrabold text-xs px-3 py-1.5 rounded-full">Requested {info.requestedAt} · awaiting your Dr Ref</div>}
    </div>
    <div className={card}>
      <div className={lbl + " mb-3"}>1. Review the documents</div>
      <div className="space-y-2">{info.docs.map(d => (
        <div key={d.url} className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3">
          <b>📄 {d.label}</b>
          <a href={d.url} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl border-2 border-gray-900 font-black text-xs uppercase">View</a>
        </div>))}</div>
    </div>
    {info.permit && <div className={card + " border-2 border-green-600"}>
      <div className={lbl + " mb-2"}>2. Approve</div>
      <p className="text-sm text-gray-700 mb-3">Your <b>Medical Referee's Cremation Permit</b> is filled in for {info.name}. If the documents are correct, tap Approve. The funeral director and Mortuary Support are emailed the permit straight away.</p>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note to MSS (optional)" className="w-full border-2 border-gray-200 focus:border-gray-900 rounded-xl px-3 py-2.5 outline-none mb-3" />
      <button type="button" disabled={busy} onClick={approve} className="w-full py-5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-lg font-black uppercase tracking-wide">{busy ? "Approving…" : "✓ Approve"}</button>
      <p className="text-xs text-gray-500 mt-2 text-center">Something not right? Reply to the request email or call MSS on 02 8814 5500.</p>
    </div>}
    <div className={card}>
      <div className={lbl + " mb-3"}>{info.permit ? "Or upload your own Dr Ref instead" : "2. Upload your Dr Ref"}</div>
      {file
        ? <div className="border-2 border-green-600 bg-green-50 rounded-xl p-4 flex items-center gap-3"><div className="text-3xl">📄</div><div className="flex-1 min-w-0"><b className="break-all">{file.name}</b><div className="text-xs text-gray-600">{(file.size / 1024 / 1024).toFixed(1)} MB</div></div><label className="text-xs font-extrabold text-gray-500 underline cursor-pointer">Change file<input type="file" accept="application/pdf,image/*" className="hidden" onChange={e => pick(e.target.files[0])} /></label></div>
        : <label onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
            className={"block border-2 border-dashed rounded-xl p-7 text-center cursor-pointer " + (drag ? "border-green-600 bg-green-50" : "border-gray-400 bg-gray-50")}>
            <div className="text-3xl">⬆</div><div className="font-black mt-1">Tap to choose your Dr Ref PDF</div><div className="text-xs text-gray-500 mt-1">or drag it here · PDF or photo · up to 30 MB</div>
            <input type="file" accept="application/pdf,image/*" className="hidden" onChange={e => pick(e.target.files[0])} />
          </label>}
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        <label className="block"><span className={lbl}>Your name *</span><input value={doctor} onChange={e => setDoctor(e.target.value)} placeholder="Dr …" className="mt-1 w-full border-2 border-gray-200 focus:border-gray-900 rounded-xl px-3 py-2.5 font-bold outline-none" /></label>
        <label className="block"><span className={lbl}>Note to MSS (optional)</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. original posted today" className="mt-1 w-full border-2 border-gray-200 focus:border-gray-900 rounded-xl px-3 py-2.5 outline-none" /></label>
      </div>
      <button type="button" disabled={busy} onClick={send} className={"w-full mt-4 py-4 rounded-xl font-black uppercase tracking-wide text-white disabled:opacity-60 " + (file && doctor.trim() ? "bg-green-600 hover:bg-green-700" : "bg-gray-900")}>{busy ? "Sending…" : "Send Dr Ref to MSS"}</button>
    </div>
    {help}
  </>);
}
