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

// ── Find the four corners of the sheet and straighten it to an A4 page ──
// Works on a small copy: blur, split paper from background (Otsu), take the biggest
// bright blob, then its corners. Returns corners in full-size pixels, or null.
function findCorners(src, vw, vh) {
  const S = 360 / Math.max(vw, vh), w = Math.max(8, Math.round(vw * S)), h = Math.max(8, Math.round(vh * S));
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true }); ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  // 5x5 box blur so printed text doesn't break up the page
  const b = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) { s += g[yy * w + xx]; n++; } }
    b[y * w + x] = s / n;
  }
  // Otsu threshold
  const hist = new Array(256).fill(0); for (let i = 0; i < w * h; i++) hist[Math.min(255, b[i] | 0)]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = w * h - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; thr = t; } }
  // biggest bright blob
  const lab = new Int32Array(w * h).fill(-1); let bestN = 0, bestId = -1, id = 0; const q = new Int32Array(w * h);
  for (let s0 = 0; s0 < w * h; s0++) {
    if (lab[s0] !== -1 || b[s0] <= thr) continue;
    let qh = 0, qt = 0, n = 0; q[qt++] = s0; lab[s0] = id;
    while (qh < qt) { const p = q[qh++]; n++; const x = p % w, y = (p / w) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const np = ny * w + nx; if (lab[np] === -1 && b[np] > thr) { lab[np] = id; q[qt++] = np; } } }
    if (n > bestN) { bestN = n; bestId = id; } id++;
  }
  if (bestId < 0 || bestN < w * h * 0.12 || bestN > w * h * 0.97) return null;
  // corners = extreme points of the blob along the two diagonals
  let tl = [0, 0, Infinity], br = [0, 0, -Infinity], tr = [0, 0, -Infinity], bl = [0, 0, Infinity];
  for (let p = 0; p < w * h; p++) { if (lab[p] !== bestId) continue; const x = p % w, y = (p / w) | 0, a = x + y, e = x - y;
    if (a < tl[2]) tl = [x, y, a]; if (a > br[2]) br = [x, y, a]; if (e > tr[2]) tr = [x, y, e]; if (e < bl[2]) bl = [x, y, e]; }
  const pts = [tl, tr, br, bl].map(([x, y]) => [(x + 0.5) / S, (y + 0.5) / S]);
  // sanity: the four corners must make a reasonable shape
  const dist = (a, b2) => Math.hypot(a[0] - b2[0], a[1] - b2[1]);
  const sides = [dist(pts[0], pts[1]), dist(pts[1], pts[2]), dist(pts[2], pts[3]), dist(pts[3], pts[0])];
  if (Math.min(...sides) < Math.max(vw, vh) * 0.15) return null;
  // the page must fill most of the area between its corners (rejects odd shapes)
  const area = Math.abs(pts.reduce((s, p, i) => { const n2 = pts[(i + 1) % 4]; return s + p[0] * n2[1] - n2[0] * p[1]; }, 0)) / 2;
  if (bestN / (S * S) < area * 0.8) return null;
  return pts;
}
// Solve the 3x3 perspective map from the output rectangle to the four corners
function homography(srcPts, dstPts) {
  const A = [], B = [];
  for (let i = 0; i < 4; i++) { const [x, y] = srcPts[i], [u, v] = dstPts[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v); }
  for (let c2 = 0; c2 < 8; c2++) { let m = c2; for (let r = c2 + 1; r < 8; r++) if (Math.abs(A[r][c2]) > Math.abs(A[m][c2])) m = r;
    [A[c2], A[m]] = [A[m], A[c2]]; [B[c2], B[m]] = [B[m], B[c2]];
    for (let r = 0; r < 8; r++) { if (r === c2) continue; const f = A[r][c2] / A[c2][c2]; for (let k = c2; k < 8; k++) A[r][k] -= f * A[c2][k]; B[r] -= f * B[c2]; } }
  const hm = B.map((v, i) => v / A[i][i]); return [...hm, 1];
}
// Straighten the sheet into an exact A4-proportioned image (portrait, or landscape if the sheet is wider)
function warpToA4(src, vw, vh, pts) {
  const wTop = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), wBot = Math.hypot(pts[2][0] - pts[3][0], pts[2][1] - pts[3][1]);
  const hL = Math.hypot(pts[3][0] - pts[0][0], pts[3][1] - pts[0][1]), hR = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
  const land = (wTop + wBot) > (hL + hR);
  const long = Math.min(MAX_SIDE, Math.round(Math.max(wTop, wBot, hL, hR) * 1.15));
  const ow = land ? long : Math.round(long / Math.SQRT2), oh = land ? Math.round(long / Math.SQRT2) : long;
  const H = homography([[0, 0], [ow, 0], [ow, oh], [0, oh]], pts);
  const sctx = src.getContext("2d", { willReadFrequently: true }), sd = sctx.getImageData(0, 0, vw, vh).data;
  const out = document.createElement("canvas"); out.width = ow; out.height = oh;
  const octx = out.getContext("2d", { willReadFrequently: true }), img = octx.createImageData(ow, oh), od = img.data;
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const z = H[6] * x + H[7] * y + 1, sx = (H[0] * x + H[1] * y + H[2]) / z, sy = (H[3] * x + H[4] * y + H[5]) / z;
    const x0 = Math.max(0, Math.min(vw - 2, sx | 0)), y0 = Math.max(0, Math.min(vh - 2, sy | 0)), fx = Math.min(1, Math.max(0, sx - x0)), fy = Math.min(1, Math.max(0, sy - y0));
    const i00 = (y0 * vw + x0) * 4, i10 = i00 + 4, i01 = i00 + vw * 4, i11 = i01 + 4, o = (y * ow + x) * 4;
    for (let k = 0; k < 3; k++) od[o + k] = (sd[i00 + k] * (1 - fx) + sd[i10 + k] * fx) * (1 - fy) + (sd[i01 + k] * (1 - fx) + sd[i11 + k] * fx) * fy;
    od[o + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}


// Photo of the camera view, turned the way the Rotate button says
function grabFrame(video, rotation) {
  const vw = video.videoWidth, vh = video.videoHeight, rot = ((rotation % 360) + 360) % 360, sw = rot % 180 !== 0;
  const c = document.createElement("canvas"); c.width = sw ? vh : vw; c.height = sw ? vw : vh;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.translate(c.width / 2, c.height / 2); x.rotate(rot * Math.PI / 180); x.drawImage(video, -vw / 2, -vh / 2, vw, vh);
  return c;
}
const defaultCorners = (w, h) => { const m = 0.04; return [[w * m, h * m], [w * (1 - m), h * m], [w * (1 - m), h * (1 - m)], [w * m, h * (1 - m)]]; };

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
    const s = p.a4 ? Math.min(W / p.w, H / p.h) : Math.min((W - 20) / p.w, (H - 20) / p.h);
    const page = doc.addPage([W, H]);
    page.drawImage(img, { x: (W - p.w * s) / 2, y: (H - p.h * s) / 2, width: p.w * s, height: p.h * s });
  }
  return doc.save();
}

// iPhone / iPad / Android: use the phone's own cameras (back camera first, with a Flip button)
const IS_MOBILE = typeof navigator !== "undefined" && (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

export default function DocumentScanner({ labels, defaultLabel, fileBase, onSave, onClose, prefixLabel = true, readLabels = [], onRead, lockedLabels = [] }) {
  const videoRef = useRef(null), streamRef = useRef(null);
  const [cams, setCams] = useState([]);
  const [camId, setCamId] = useState(store.get());
  const [facing, setFacing] = useState("environment");
  const [err, setErr] = useState("");
  const [label, setLabel] = useState(defaultLabel || labels.find(l => !lockedLabels.includes(l)) || labels[0]);
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState(true);
  const [clean, setClean] = useState(true);
  const [pages, setPages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [adjust, setAdjust] = useState(null);   // {url,w,h,pts,auto} while corners are being checked
  const rawRef = useRef(null), dragRef = useRef(-1), adjBoxRef = useRef(null);
  const boxRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const sideways = rotation % 180 !== 0;

  async function start(id, face) {
    stop();
    setErr("");
    try {
      const video = { width: { ideal: 3264 }, height: { ideal: 2448 } };
      if (IS_MOBILE) {
        video.facingMode = { ideal: face || facing };
        const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
        return;
      }
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
      if (id && !IS_MOBILE) { store.set(""); return start(""); } // remembered camera unplugged - fall back
      setErr(e?.name === "NotAllowedError"
        ? "Camera access was blocked. Click the camera icon in the address bar (or Safari ▸ Settings for This Website) and allow the camera, then try again."
        : IS_MOBILE ? "Couldn't start the camera. Close other apps using the camera, then try again." : "No camera found. Check the document camera's USB cable is plugged into the MacBook.");
    }
  }
  function stop() { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; }

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) { setErr("This browser can't use cameras. Please use Safari or Chrome."); return; }
    start(camId);
    return stop;
  }, []);

  function useAdjusted() {
    const raw = rawRef.current; if (!raw || !adjust) return;
    const page = warpToA4(raw, raw.width, raw.height, adjust.pts);
    if (clean) enhance(page.getContext("2d", { willReadFrequently: true }), page.width, page.height);
    setPages(p => [...p, { url: page.toDataURL("image/jpeg", JPEG_Q), w: page.width, h: page.height, a4: true }]);
    setAdjust(null); rawRef.current = null;
  }
  function dragTo(e) {
    const i = dragRef.current, el = adjBoxRef.current; if (i < 0 || !el || !adjust) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(adjust.w, (e.clientX - r.left) / r.width * adjust.w)), y = Math.max(0, Math.min(adjust.h, (e.clientY - r.top) / r.height * adjust.h));
    setAdjust(a => ({ ...a, pts: a.pts.map((p, j) => j === i ? [x, y] : p) }));
  }
  function capture() {
    if (crop) {
      const v = videoRef.current; if (!v || !v.videoWidth) return;
      setFlash(true); setTimeout(() => setFlash(false), 150);
      const raw = grabFrame(v, rotation), found = findCorners(raw, raw.width, raw.height);
      rawRef.current = raw;
      setAdjust({ url: raw.toDataURL("image/jpeg", 0.85), w: raw.width, h: raw.height, pts: found || defaultCorners(raw.width, raw.height), auto: !!found });
      return;
    }
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
              {adjust && <div className="absolute inset-0 bg-gray-900 flex items-center justify-center p-2">
                <div ref={adjBoxRef} className="relative" style={{ aspectRatio: `${adjust.w}/${adjust.h}`, maxWidth: "100%", maxHeight: "100%", width: box.w && box.h ? Math.min(box.w - 16, (box.h - 16) * adjust.w / adjust.h) : "100%", touchAction: "none" }}
                  onPointerMove={dragTo} onPointerUp={() => { dragRef.current = -1; }} onPointerLeave={() => { dragRef.current = -1; }}>
                  <img src={adjust.url} alt="Captured page" className="absolute inset-0 w-full h-full select-none" draggable={false} />
                  <svg viewBox={`0 0 ${adjust.w} ${adjust.h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                    <polygon points={adjust.pts.map(p => p.join(",")).join(" ")} fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth={Math.max(adjust.w, adjust.h) * 0.004} />
                    {adjust.pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={Math.max(adjust.w, adjust.h) * 0.025} fill="rgba(255,255,255,0.9)" stroke="#16a34a" strokeWidth={Math.max(adjust.w, adjust.h) * 0.005} style={{ cursor: "grab" }}
                      onPointerDown={e => { e.preventDefault(); dragRef.current = i; try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch (x) {} }} onPointerMove={dragTo} onPointerUp={() => { dragRef.current = -1; }} />)}
                  </svg>
                </div>
              </div>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {adjust && <div className="w-full">
                <p className="text-xs font-bold text-gray-700 mb-2">{adjust.auto ? "Check the green box sits on the corners of the page — drag a corner to fix it." : "Drag the 4 corners onto the corners of the page."} It will be straightened to an A4 page.</p>
                <div className="flex gap-2">
                  <button onClick={useAdjusted} className="flex-1 py-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black uppercase tracking-wide">✓ Use Page {pages.length + 1}</button>
                  <button onClick={() => { setAdjust(null); rawRef.current = null; }} className="px-4 py-4 rounded-xl border-2 border-gray-300 text-gray-700 font-black uppercase text-xs">↺ Retake</button>
                </div>
              </div>}
              {!adjust && <button onClick={capture} disabled={!!err} className="flex-1 min-w-[160px] py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-wide disabled:opacity-40">● Capture Page {pages.length + 1}</button>}
              {IS_MOBILE && <button onClick={() => { const f = facing === "environment" ? "user" : "environment"; setFacing(f); start("", f); }} className={chip(false)}>🔄 Flip camera</button>}
              <button onClick={() => setRotation(r => (r + 90) % 360)} className={chip(false)}>⟳ Rotate</button>
              <button onClick={() => setCrop(!crop)} className={chip(crop)}>Auto-crop</button>
              <button onClick={() => setClean(!clean)} className={chip(clean)}>Scan look</button>
            </div>
            {!IS_MOBILE && cams.length > 1 && (
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
