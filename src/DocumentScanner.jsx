import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ─── DOCUMENT SCANNER ─────────────────────────────────────────────────────────
// Uses a USB document camera (seen by the Mac as a webcam) to photograph paperwork,
// tidies each page (crop to the paper + clean black-and-white look), and saves all
// pages as one PDF. onSave(file, label) receives the finished PDF.

const CAM_KEY = "mss_scanner_camera";
const MAX_SIDE = 2200;          // px, long side of each saved page
const JPEG_Q = 0.8;

const store = {
  get() { try { return localStorage.getItem(CAM_KEY) || ""; } catch (e) { return ""; } },
  set(v) { try { localStorage.setItem(CAM_KEY, v); } catch (e) {} },
};

// Finds the sheet of paper (bright area) on a darker background and returns a crop box.
function findPaper(ctx, w, h) {
  const step = Math.max(1, Math.floor(Math.max(w, h) / 400));
  const { data } = ctx.getImageData(0, 0, w, h);
  const lum = (x, y) => { const i = (y * w + x) * 4; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; };
  // threshold halfway between dark background and bright paper
  const samples = [];
  for (let y = 0; y < h; y += step * 4) for (let x = 0; x < w; x += step * 4) samples.push(lum(x, y));
  samples.sort((a, b) => a - b);
  const lo = samples[Math.floor(samples.length * 0.1)], hi = samples[Math.floor(samples.length * 0.9)];
  if (hi - lo < 40) return null; // no clear paper edge - keep full frame
  const thr = (lo + hi) / 2;
  const rowHits = new Array(h).fill(0), colHits = new Array(w).fill(0);
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (lum(x, y) > thr) { rowHits[y]++; colHits[x]++; }
  const minRow = (w / step) * 0.25, minCol = (h / step) * 0.25;
  let top = 0, bottom = h - 1, left = 0, right = w - 1;
  while (top < h && rowHits[top] < minRow) top += 1;
  while (bottom > top && rowHits[bottom] < minRow) bottom -= 1;
  while (left < w && colHits[left] < minCol) left += 1;
  while (right > left && colHits[right] < minCol) right -= 1;
  const cw = right - left, ch = bottom - top;
  if (cw < w * 0.3 || ch < h * 0.3) return null;
  const m = Math.round(Math.min(cw, ch) * 0.01);
  return { x: Math.max(0, left - m), y: Math.max(0, top - m), w: Math.min(w, cw + 2 * m), h: Math.min(h, ch + 2 * m) };
}

// Greyscale + stretch contrast so it reads like a scan.
function enhance(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = g; hist[g]++;
  }
  const total = w * h; let acc = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.02) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.25) { hi = i; break; } } // paper is most of the page
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) / span) * 255));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

function processFrame(video, rotation, doCrop, doEnhance) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const src = document.createElement("canvas"); src.width = vw; src.height = vh;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(video, 0, 0, vw, vh);
  const box = doCrop ? findPaper(sctx, vw, vh) : null;
  const c = box || { x: 0, y: 0, w: vw, h: vh };
  const rot = ((rotation % 360) + 360) % 360, sideways = rot === 90 || rot === 270;
  const scale = Math.min(1, MAX_SIDE / Math.max(c.w, c.h));
  const ow = Math.round((sideways ? c.h : c.w) * scale), oh = Math.round((sideways ? c.w : c.h) * scale);
  const out = document.createElement("canvas"); out.width = ow; out.height = oh;
  const octx = out.getContext("2d", { willReadFrequently: true });
  octx.translate(ow / 2, oh / 2); octx.rotate((rot * Math.PI) / 180);
  const dw = c.w * scale, dh = c.h * scale;
  octx.drawImage(src, c.x, c.y, c.w, c.h, -dw / 2, -dh / 2, dw, dh);
  octx.setTransform(1, 0, 0, 1, 0, 0);
  if (doEnhance) enhance(octx, ow, oh);
  return { url: out.toDataURL("image/jpeg", JPEG_Q), w: ow, h: oh };
}

// Smaller copy of each page for reading (fewer tokens, faster)
function forReading(p) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1568 / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.8).split(",")[1]);
    };
    img.onerror = reject; img.src = p.url;
  });
}

async function pagesToPdf(pages) {
  const { PDFDocument } = await import("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js");
  const doc = await PDFDocument.create();
  for (const p of pages) {
    const bytes = Uint8Array.from(atob(p.url.split(",")[1]), ch => ch.charCodeAt(0));
    const img = await doc.embedJpg(bytes);
    const land = p.w > p.h, W = land ? 841.89 : 595.28, H = land ? 595.28 : 841.89; // A4
    const s = Math.min((W - 20) / p.w, (H - 20) / p.h);
    const page = doc.addPage([W, H]);
    page.drawImage(img, { x: (W - p.w * s) / 2, y: (H - p.h * s) / 2, width: p.w * s, height: p.h * s });
  }
  return doc.save();
}

export default function DocumentScanner({ labels, defaultLabel, fileBase, onSave, onClose, prefixLabel = true, readLabels = [], onRead, lockedLabels = [] }) {
  const videoRef = useRef(null), streamRef = useRef(null);
  const [cams, setCams] = useState([]);
  const [camId, setCamId] = useState(store.get());
  const [err, setErr] = useState("");
  const [label, setLabel] = useState(defaultLabel || labels.find(l => !lockedLabels.includes(l)) || labels[0]);
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState(true);
  const [clean, setClean] = useState(true);
  const [pages, setPages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const boxRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const sideways = rotation % 180 !== 0;

  async function start(id) {
    stop();
    setErr("");
    try {
      const video = { width: { ideal: 3264 }, height: { ideal: 2448 } };
      if (id) video.deviceId = { exact: id };
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      const list = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
      setCams(list);
      const active = stream.getVideoTracks()[0]?.getSettings?.().deviceId || id;
      // First time: prefer the external document camera over the Mac's built-in FaceTime camera
      if (!id && !store.get()) {
        const ext = list.find(d => !/facetime|built-in|integrated/i.test(d.label));
        if (ext && ext.deviceId !== active) { store.set(ext.deviceId); setCamId(ext.deviceId); return start(ext.deviceId); }
      }
      if (active) { setCamId(active); store.set(active); }
    } catch (e) {
      if (id) { store.set(""); return start(""); } // remembered camera unplugged - fall back
      setErr(e?.name === "NotAllowedError"
        ? "Camera access was blocked. Click the camera icon in the address bar (or Safari ▸ Settings for This Website) and allow the camera, then try again."
        : "No camera found. Check the document camera's USB cable is plugged into the MacBook.");
    }
  }
  function stop() { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; }

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) { setErr("This browser can't use cameras. Please use Safari or Chrome."); return; }
    start(camId);
    return stop;
  }, []);

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setFlash(true); setTimeout(() => setFlash(false), 150);
    setPages(p => [...p, processFrame(v, rotation, crop, clean)]);
  }
  const move = (i, d) => setPages(p => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });

  async function save() {
    if (!pages.length) return;
    setBusy(true);
    try {
      const bytes = await pagesToPdf(pages);
      const safe = s => String(s || "").replace(/[^a-zA-Z0-9]/g, "_");
      const name = `${prefixLabel ? safe(label) + "_" : ""}${safe(fileBase?.fh || "FD")}_${safe(fileBase?.lastName || "Unknown")}_${fileBase?.dod ? fileBase.dod.split("-").reverse().join("") : ""}.pdf`.replace(/_\.pdf$/, ".pdf");
      await onSave(new File([bytes], name, { type: "application/pdf" }), label);
      if (onRead && readLabels.includes(label)) {
        try { const imgs = await Promise.all(pages.slice(0, 3).map(forReading)); onRead(imgs, label); } catch (e) {}
      }
      stop(); onClose();
    } catch (e) { alert("Couldn't save the scan: " + e.message); }
    setBusy(false);
  }

  const chip = on => `px-3 py-2 rounded-xl border-2 text-xs font-black uppercase transition ${on ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-300 text-gray-600 hover:border-gray-700"}`;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483646, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div className="bg-white rounded-2xl w-full max-w-6xl h-full flex flex-col overflow-hidden" style={{ maxHeight: "calc(100dvh - 24px)" }}>
        <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-gray-900 text-white rounded-t-2xl">
          <div className="font-black uppercase tracking-wide">📷 Scan Paperwork</div>
          <button onClick={() => { stop(); onClose(); }} className="text-sm font-black uppercase opacity-70 hover:opacity-100">✕ Close</button>
        </div>
        <div className="p-3 sm:p-4 flex-1 min-h-0 overflow-y-auto md:overflow-hidden grid gap-3 md:gap-4 md:grid-cols-[1fr_260px] md:grid-rows-[minmax(0,1fr)]">
          <div className="flex flex-col min-h-0">
            <div ref={boxRef} className="relative bg-gray-900 rounded-xl overflow-hidden h-[42vh] md:h-auto md:flex-1 md:min-h-0">
              {err
                ? <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-white text-sm">{err}</div>
                : <video ref={videoRef} playsInline muted autoPlay className="absolute object-contain" style={sideways && box.w ? { width: box.h, height: box.w, left: "50%", top: "50%", transform: `translate(-50%,-50%) rotate(${rotation}deg)` } : { inset: 0, width: "100%", height: "100%", transform: `rotate(${rotation}deg)` }} />}
              {flash && <div className="absolute inset-0 bg-white opacity-70" />}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button onClick={capture} disabled={!!err} className="flex-1 min-w-[160px] py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-wide disabled:opacity-40">● Capture Page {pages.length + 1}</button>
              <button onClick={() => setRotation(r => (r + 90) % 360)} className={chip(false)}>⟳ Rotate</button>
              <button onClick={() => setCrop(!crop)} className={chip(crop)}>Auto-crop</button>
              <button onClick={() => setClean(!clean)} className={chip(clean)}>Scan look</button>
            </div>
            {cams.length > 1 && (
              <select className="mt-2 w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm" value={camId} onChange={e => { store.set(e.target.value); setCamId(e.target.value); start(e.target.value); }}>
                {cams.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>)}
              </select>
            )}
            <p className="text-xs text-gray-500 mt-2 hidden sm:block">Tip: put the page on a dark surface, set the camera light to High and press the camera's focus button before capturing.</p>
          </div>
          <div className="flex flex-col min-h-0">
            <div className="text-xs font-black uppercase text-gray-500 tracking-widest mb-2">Document</div>
            <div className="flex flex-wrap gap-2 mb-2">{labels.map(l => lockedLabels.includes(l)
              ? <button key={l} disabled title="Scan the death paperwork first" className={chip(false) + " opacity-30 cursor-not-allowed"}>🔒 {l}</button>
              : <button key={l} onClick={() => setLabel(l)} className={chip(label === l)}>{l}</button>)}</div>
            {lockedLabels.length > 0 && <p className="text-xs font-bold text-red-600 mb-2">Scan ONE of these first: {readLabels.join(" or ")}. Other documents unlock after that.</p>}
            {readLabels.length > 0 && <p className="text-xs text-gray-500 mb-4">{readLabels.includes(label) ? "✨ The details on this document will be read and filled in for you to check." : "This document is saved only (not read)."}</p>}
            <div className="text-xs font-black uppercase text-gray-500 tracking-widest mb-2">Pages ({pages.length})</div>
            <div className="space-y-2 max-h-[30vh] md:max-h-none md:flex-1 md:min-h-0 overflow-y-auto">
              {pages.map((p, i) => (
                <div key={i} className="flex items-center gap-2 border border-gray-200 rounded-xl p-2">
                  <img src={p.url} alt={`Page ${i + 1}`} className="w-16 h-20 object-contain bg-gray-100 rounded" />
                  <div className="flex-1 text-xs font-black">Page {i + 1}</div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => move(i, -1)} className="text-xs px-2 border rounded">▲</button>
                    <button onClick={() => move(i, 1)} className="text-xs px-2 border rounded">▼</button>
                  </div>
                  <button onClick={() => setPages(ps => ps.filter((_, j) => j !== i))} className="text-red-500 font-black text-sm px-1">✕</button>
                </div>
              ))}
              {!pages.length && <p className="text-xs text-gray-400">No pages yet. Capture each page in order.</p>}
            </div>
            <button onClick={save} disabled={!pages.length || busy} className="shrink-0 w-full mt-4 py-3 rounded-xl bg-gray-900 text-white font-black uppercase disabled:opacity-40">
              {busy ? "Saving…" : `${onRead && readLabels.includes(label) ? "Save & Read Details" : "Save " + label} (${pages.length} page${pages.length === 1 ? "" : "s"})`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
