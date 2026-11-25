// Public page for Leura Memorial Gardens: /?crem=TOKEN (no login). Fill in, preview and sign the
// Certificate of Cremation for an MSS NSNA cremation.
import React, { useEffect, useRef, useState } from "react";
import { makeCremDocs, LEURA } from "./cremDocs.js";
const SUPABASE_URL = "https://qhazwfbhbelpcfwczjdb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYXp3ZmJoYmVscGNmd2N6amRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4ODQ1MTEsImV4cCI6MjA5NjQ2MDUxMX0.2xg7Kj56r7n_x2nZxbttqZU6Rly6ZSSnpuequpyihBo";
const BUCKET = "Case-documents";
const todaySyd = () => new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

function SigPad({ label, value, onChange, disabled }) {
  const ref = useRef(null), drawing = useRef(false), has = useRef(false);
  useEffect(() => { const c = ref.current; if (!c) return; const r = window.devicePixelRatio || 1; c.width = c.offsetWidth * r; c.height = c.offsetHeight * r;
    const x = c.getContext("2d"); x.scale(r, r); x.lineWidth = 2.4; x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = "#111";
    if (value) { const img = new Image(); img.onload = () => x.drawImage(img, 0, 0, c.offsetWidth, c.offsetHeight); img.src = value; has.current = true; } }, []);
  const pos = e => { const b = ref.current.getBoundingClientRect(), t = e.touches?.[0] || e; return [t.clientX - b.left, t.clientY - b.top]; };
  const start = e => { if (disabled) return; e.preventDefault(); drawing.current = true; const x = ref.current.getContext("2d"); const [a, b] = pos(e); x.beginPath(); x.moveTo(a, b); };
  const move = e => { if (!drawing.current) return; e.preventDefault(); const x = ref.current.getContext("2d"); const [a, b] = pos(e); x.lineTo(a, b); x.stroke(); has.current = true; };
  const end = () => { if (!drawing.current) return; drawing.current = false; if (has.current) onChange(ref.current.toDataURL("image/png")); };
  const clear = () => { const c = ref.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); has.current = false; onChange(null); };
  return <div>
    <div className="flex items-center justify-between mb-1"><span className="text-[11px] font-black tracking-widest text-gray-500 uppercase">{label}</span>
      {!disabled && <button type="button" onClick={clear} className="text-xs font-black uppercase text-gray-500 underline">Clear</button>}</div>
    <canvas ref={ref} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      className={"w-full h-32 rounded-xl border-2 bg-white touch-none " + (value ? "border-green-500" : "border-dashed border-gray-300")} />
    <p className="text-xs text-gray-400 mt-1">{value ? "✓ Signed" : "Sign with your finger or mouse"}</p>
  </div>;
}

export default function CremPage({ token }) {
  const [info, setInfo] = useState(null), [err, setErr] = useState("");
  const [f, setF] = useState({ certNo: "", cremDate: "", gm: LEURA.gm, gmTitle: LEURA.gmTitle });
  const [gmSig, setGmSig] = useState(null);
  const [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [done, setDone] = useState(null), [ok, setOk] = useState(false);
  const set = (k, v) => { setF(p => ({ ...p, [k]: v })); setPreview(null); };
  useEffect(() => {
    document.title = "Cremation certificate – Leura Memorial Gardens";
    fetch(`/api/crem?t=${encodeURIComponent(token)}`).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "This link is not valid."); setInfo(j); }).catch(e => setErr(e.message));
  }, [token]);
  const vals = () => ({ ...f, name: info.name, signDate: todaySyd(), gmSig });
  const missing = () => [!f.certNo.trim() && "Certificate number", !f.cremDate && "Date of cremation", !f.gm.trim() && "General Manager's name",
    !gmSig && "General Manager's signature", !ok && "the confirmation tick"].filter(Boolean);
  async function showPreview() {
    setBusy(true);
    try { const r = await makeCremDocs(vals()); setPreview({ cert: URL.createObjectURL(new Blob([r.cert], { type: "application/pdf" })) }); }
    catch (e) { alert("Couldn't make the preview: " + e.message); }
    setBusy(false);
  }
  async function sign() {
    const m = missing(); if (m.length) { alert("Still needed: " + m.join(", ")); return; }
    setBusy(true);
    try {
      const r = await makeCremDocs(vals()), ts = Date.now(), paths = {};
      for (const [k, nm] of [["cert", "Certificate_of_Cremation"]]) {
        const path = `${info.uploadDir}/${nm}_${ts}.pdf`;
        const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/pdf", "x-upsert": "false" }, body: new Blob([r[k]], { type: "application/pdf" }) });
        if (!up.ok) throw new Error("The upload didn't go through. Please try again.");
        paths[k] = path;
      }
      const res = await fetch("/api/crem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", t: token, paths, certNo: f.certNo, cremDate: f.cremDate, gm: f.gm }) });
      const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || "Something went wrong. Please try again.");
      setDone(j);
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  const lbl = "text-[11px] font-black tracking-widest text-gray-500 uppercase", card = "bg-white border border-gray-200 rounded-2xl p-5", inp = "w-full mt-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-gray-900 bg-white";
  const shell = body => <div className="min-h-screen bg-gray-100 text-gray-900"><div className="max-w-2xl mx-auto px-4 py-6">
    <div className="flex items-center justify-between mb-5"><img src="/forms/leura/logo.png" alt="Leura Memorial Gardens" className="h-10" /><span className="text-xs font-bold text-gray-400 text-right">via Mortuary Support<br />02 8814 5500</span></div>{body}</div></div>;
  if (err) return shell(<div className={card}><p className="font-black text-lg mb-1">This link can't be used</p><p className="text-gray-600">{err}</p><p className="text-sm text-gray-500 mt-3">Please call Mortuary Support Services on 02 8814 5500.</p></div>);
  if (!info) return shell(<p className="text-center text-gray-400 py-20">Loading…</p>);
  const docsList = d => <div className="flex flex-wrap gap-2 mt-3">{d.map(x => <a key={x.label} href={x.url} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl border-2 border-gray-900 font-black text-xs uppercase">📄 {x.label}</a>)}</div>;
  if (done || info.signed) return shell(<div className={card + " text-center"}><div className="text-4xl mb-2">✓</div><p className="font-black text-xl">Signed — thank you</p>
    <p className="text-gray-600 mt-1">{info.name}{done ? ` · ${done.at}` : ` · signed ${info.signedAt}`}</p><p className="text-sm text-gray-500 mt-2">The certificate has been sent to Mortuary Support and the funeral director, with a copy to you.</p>
    {docsList(done?.docs || info.docs)}</div>);
  return shell(<>
    <div className={card + " mb-4"}><p className={lbl}>Certificate of Cremation</p>
      <p className="text-2xl font-black mt-1">{info.title}</p>
      <p className="text-sm text-gray-500">Born {info.dob} · Died {info.dod}{info.caseRef ? ` · MSS ${info.caseRef}` : ""}{info.fh ? ` · ${info.fh}` : ""}</p></div>

    <div className={card + " mb-4 space-y-3"}><p className="font-black uppercase text-sm">1. Cremation details</p>
      <label className="block"><span className={lbl}>Certificate number *</span><input className={inp} value={f.certNo} onChange={e => set("certNo", e.target.value)} placeholder="e.g. CR27-0099" /></label>
      <label className="block"><span className={lbl}>Date of cremation *</span><input type="date" className={inp} value={f.cremDate} max={todaySyd()} onChange={e => set("cremDate", e.target.value)} /></label></div>

    <div className={card + " mb-4 space-y-4"}><p className="font-black uppercase text-sm">2. Sign</p>
      <div className="grid sm:grid-cols-2 gap-3"><label><span className={lbl}>General Manager *</span><input className={inp} value={f.gm} onChange={e => set("gm", e.target.value)} /></label>
        <label><span className={lbl}>Title</span><input className={inp} value={f.gmTitle} onChange={e => set("gmTitle", e.target.value)} /></label></div>
      <SigPad label="General Manager's signature *" value={gmSig} onChange={v => { setGmSig(v); setPreview(null); }} />
      <p className="text-xs text-gray-500">The JP stamp ({LEURA.jp} JP · Reg. No. {LEURA.jpReg}) is added to the certificate.</p></div>

    <div className={card + " mb-4"}><p className="font-black uppercase text-sm mb-2">3. Check &amp; send</p>
      <button type="button" disabled={busy} onClick={showPreview} className="w-full py-3 rounded-xl border-2 border-gray-900 font-black uppercase text-sm disabled:opacity-50">👁 Preview certificate</button>
      {preview && <div className="mt-3">{[["cert", "Certificate of Cremation"]].map(([k, l]) =>
        <div key={k}><iframe title={l} src={preview[k]} className="w-full h-96 border border-gray-200 rounded-xl bg-white" /><a href={preview[k]} target="_blank" rel="noreferrer" className="text-xs font-black uppercase underline text-gray-500">Open {l}</a></div>)}</div>}
      <label className="flex items-start gap-2 mt-4 text-sm"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} className="w-5 h-5 mt-0.5" />
        <span>I confirm the details are correct and I agree to sign this certificate electronically.</span></label>
      <button type="button" disabled={busy} onClick={sign} className="w-full mt-4 py-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black uppercase disabled:opacity-50">{busy ? "Please wait…" : "✍ Sign & send"}</button>
      <p className="text-xs text-gray-400 mt-2 text-center">The signed certificate goes to Mortuary Support and the funeral director, with a copy to you.</p></div>
  </>);
}
