// MSS NSNA cremations at Leura Memorial Gardens: Leura signs the Certificate of Cremation online.
//   POST {action:"request", caseId, resend?, by?}  -> after check-out: emails Leura the secure signing link (once, unless resend)
//   GET  ?t=TOKEN                                   -> details for the signing page
//   POST {action:"complete", t, paths:{cert}, certNo, cremDate, gm} -> files the signed PDF, emails MSS + FD
//   POST {action:"resend-signed", noteId, by?}      -> emails the signed documents to the FD again
import crypto from "crypto";
import { textToHtml, wrapHtml } from "./_emailHtml.js";
import FUNERAL_HOMES from "./_funeralHomes.js";
const SUPABASE_URL = "https://qhazwfbhbelpcfwczjdb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYXp3ZmJoYmVscGNmd2N6amRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4ODQ1MTEsImV4cCI6MjA5NjQ2MDUxMX0.2xg7Kj56r7n_x2nZxbttqZU6Rly6ZSSnpuequpyihBo";
const BUCKET = "Case-documents";
const CREM_TO = process.env.CREM_TO || "info@leuramemorialgardens.com.au";
const CREM_NAME = "Leura Memorial Gardens";
const INFO = "info@mortuarysupport.com.au";
const TZ = "Australia/Sydney";
const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" };
const sb = async (p, o = {}) => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.prefer ? { Prefer: o.prefer } : {}) } }); if (!r.ok) throw new Error(await r.text()); const t = await r.text(); return t ? JSON.parse(t) : null; };
const pub = p => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p.split("/").map(encodeURIComponent).join("/")}`;
const when = s => new Date(s).toLocaleString("en-AU", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const longDate = s => { if (!s) return "—"; const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return y ? new Date(Date.UTC(y, m - 1, d, 2)).toLocaleDateString("en-AU", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }) : String(s); };
const nameOf = a => [a.firstName, a.lastName].filter(Boolean).join(" ");
const title = a => `${String(a.lastName || "").toUpperCase()}, ${a.firstName || ""}`.trim();
const isTok = t => /^[a-f0-9]{48}$/.test(t);
const FOOT = "\n\nAny questions please don't hesitate to contact us.\n\nThe Team at Mortuary Support | Lumière\nPhone: 02 8814 5500\nEmail: info@mortuarysupport.com.au";

async function send(msg) {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("Email not set up");
  msg = { ...msg, html: msg.html ? wrapHtml(msg.html, msg.subject) : textToHtml(msg.text, msg.subject) };
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, reply_to: INFO, ...msg }) });
  if (!r.ok) throw new Error("Email failed: " + (await r.text()).slice(0, 200));
}
const one = async q => (await sb(`second_notes?select=*&${q}&limit=1`))?.[0];
const isNSNA = n => n?.answers?._nsna === true;

export default async function handler(req, res) {
  try {
    const base = process.env.APP_URL || `https://${req.headers.host}`;
    if (req.method === "GET") {
      const t = String(req.query?.t || "");
      if (!isTok(t)) return res.status(404).json({ error: "This link is not valid." });
      const n = await one(`answers->_crem->>token=eq.${t}`);
      if (!n) return res.status(404).json({ error: "This link is not valid." });
      const a = n.answers || {}, d = a._crem || {};
      return res.status(200).json({
        name: nameOf(a), title: title(a), dob: longDate(a.dob), dod: longDate(a.dod), caseRef: n.case_ref || "", fh: n.funeral_home_name || "",
        sentAt: d.sentAt ? when(d.sentAt) : "", signed: !!d.signedAt, signedAt: d.signedAt ? when(d.signedAt) : "", signedBy: d.gm || "",
        uploadDir: `crem/${n.id}`, docs: d.signedAt ? [{ label: "Certificate of Cremation", url: pub(d.certPath) }] : [],
      });
    }
    if (req.method !== "POST") return res.status(405).end();
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    // After check-out (or the Resend button): email Leura the signing link
    if (b.action === "request") {
      const n = b.noteId ? await one(`id=eq.${encodeURIComponent(b.noteId)}`) : await one(`case_id=eq.${encodeURIComponent(b.caseId || "")}&answers->>_nsna=eq.true&order=submitted_at.desc`);
      if (!n || !isNSNA(n)) return res.status(200).json({ ok: true, skipped: "Not an MSS NSNA" });
      const a = n.answers || {}; let d = a._crem || {};
      if (d.signedAt) return res.status(200).json({ ok: true, already: "signed" });
      if (d.sentAt && !b.resend) return res.status(200).json({ ok: true, already: "sent" });
      if (!d.token) d = { ...d, token: crypto.randomBytes(24).toString("hex"), requestedAt: new Date().toISOString() };
      const link = `${base}/?crem=${d.token}`, again = !!(b.resend && d.sentAt);
      const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827"><p>Hi ${CREM_NAME} Team,</p>
<p>${again ? "<b>Reminder:</b> the" : "The"} cremation certificate is ready for you to sign for:</p>
<table style="border-collapse:collapse;margin-bottom:14px">${[["Deceased", `<b>${nameOf(a)}</b>`], ["Date of birth", longDate(a.dob)], ["Date of death", longDate(a.dod)], ["MSS case number", n.case_ref || "—"], ["Funeral director", n.funeral_home_name || "—"]].map(([k, v]) => `<tr><td style="padding:3px 18px 3px 0;color:#6b7280">${k}</td><td>${v}</td></tr>`).join("")}</table>
<p>The certificate is already filled in on your letterhead. Please add the certificate number and cremation date, check the details, and sign.</p>
<p style="margin:22px 0"><a href="${link}" style="background:#111827;color:#fff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:10px;display:inline-block">✍ REVIEW &amp; SIGN</a></p>
<p style="font-size:12px;color:#6b7280">This link is only for this deceased; please don't forward it. Questions: reply to this email or call MSS on 02 8814 5500.<br>${link}</p><p>The Team at Mortuary Support | Lumière</p></div>`;
      const text = `Hi ${CREM_NAME} Team,\n\n${again ? "Reminder: the" : "The"} cremation certificate is ready to sign for ${nameOf(a)} (died ${longDate(a.dod)}), MSS case ${n.case_ref || "—"}, funeral director ${n.funeral_home_name}.\n\nReview & sign: ${link}${FOOT}`;
      await send({ to: [CREM_TO], cc: [INFO], subject: `${again ? "Reminder: " : ""}Cremation certificate to sign – ${title(a)}${n.case_ref ? " – " + n.case_ref : ""}`, html, text });
      const now = new Date().toISOString();
      d = { ...d, sentAt: d.sentAt || now, sentTo: CREM_TO, ...(again ? { resent: [...(d.resent || []), { at: now, by: String(b.by || "").slice(0, 80) }] } : {}) };
      await sb(`second_notes?id=eq.${n.id}`, { method: "PATCH", body: JSON.stringify({ answers: { ...a, _crem: d } }) });
      return res.status(200).json({ ok: true, to: CREM_TO, resent: again });
    }

    // Leura signed on the page: the PDF is uploaded; file them and send them out
    if (b.action === "complete") {
      const t = String(b.t || "");
      if (!isTok(t)) return res.status(404).json({ error: "This link is not valid." });
      const n = await one(`answers->_crem->>token=eq.${t}`);
      if (!n) return res.status(404).json({ error: "This link is not valid." });
      const a = n.answers || {}, d = a._crem || {};
      if (d.signedAt) return res.status(409).json({ error: "These documents have already been signed." });
      const p = b.paths || {}, dir = `crem/${n.id}/`;
      for (const k of ["cert"]) { const x = String(p[k] || ""); if (!x.startsWith(dir) || x.includes("..")) return res.status(400).json({ error: "Upload not found." });
        const h = await fetch(pub(x), { method: "HEAD" }); if (!h.ok) return res.status(400).json({ error: "The documents didn't upload. Please try again." }); }
      const clean = (v, n2 = 120) => String(v || "").trim().slice(0, n2);
      const now = new Date().toISOString();
      const nd = { ...d, signedAt: now, certNo: clean(b.certNo, 40), cremDate: clean(b.cremDate, 10), gm: clean(b.gm), certPath: p.cert };
      await sb(`second_notes?id=eq.${n.id}`, { method: "PATCH", body: JSON.stringify({ answers: { ...a, _crem: nd } }) });
      if (n.case_id) for (const [k, lbl] of [["cert", "CREMATION_CERTIFICATE"]])
        await fetch(`${SUPABASE_URL}/storage/v1/object/copy`, { method: "POST", headers: H, body: JSON.stringify({ bucketId: BUCKET, sourceKey: p[k], destinationKey: `${n.case_id}/${Date.now()}_${lbl}.pdf` }) }).catch(() => {});
      const fh = FUNERAL_HOMES.find(f => f.id === n.funeral_home_id) || {};
      const to = [...new Set([INFO, ...(fh.contacts || [])])];
      const text = `Hi ${n.funeral_home_name || ""} Team,\n\nThe Certificate of Cremation for ${nameOf(a)} has been signed by ${CREM_NAME}.\n\nCREMATION\nName: ${nameOf(a)}\nCase Reference: ${n.case_ref || "—"}\nCertificate: ${nd.certNo}\nCremated: ${longDate(nd.cremDate)}\nSigned: ${when(now)}\n\nThe certificate is attached and saved to the case.${FOOT}`;
      const files = [{ filename: `Certificate of Cremation – ${a.lastName || "deceased"}.pdf`, path: pub(p.cert) }];
      await send({ to, cc: [CREM_TO], subject: `Cremation certificate signed – ${title(a)}${n.case_ref ? " – " + n.case_ref : ""}`, text, attachments: files });
      return res.status(200).json({ ok: true, name: nameOf(a), at: when(now), docs: [{ label: "Certificate of Cremation", url: pub(p.cert) }, { label: "Statutory Declaration", url: pub(p.stat) }] });
    }

    // Signed already: send the signed documents to the FD again
    if (b.action === "resend-signed") {
      const n = await one(`id=eq.${encodeURIComponent(b.noteId || "")}`);
      const a = n?.answers || {}, d = a._crem || {};
      if (!d.signedAt) return res.status(400).json({ error: "Leura hasn't signed these documents yet." });
      const fh = FUNERAL_HOMES.find(f => f.id === n.funeral_home_id) || {};
      const to = [...new Set([INFO, ...(fh.contacts || [])])];
      await send({ to, subject: `Cremation certificate – ${title(a)}${n.case_ref ? " – " + n.case_ref : ""}`,
        text: `Hi ${n.funeral_home_name || ""} Team,\n\nAs requested, here is the signed Certificate of Cremation for ${nameOf(a)}${n.case_ref ? " (" + n.case_ref + ")" : ""}.\n\nCertificate: ${d.certNo || "—"}\nCremated: ${longDate(d.cremDate)}\nSigned by ${CREM_NAME}: ${when(d.signedAt)}${FOOT}`,
        attachments: [{ filename: `Certificate of Cremation – ${a.lastName || "deceased"}.pdf`, path: pub(d.certPath) }] });
      await sb(`second_notes?id=eq.${n.id}`, { method: "PATCH", body: JSON.stringify({ answers: { ...a, _crem: { ...d, fdResent: [...(d.fdResent || []), { at: new Date().toISOString(), by: String(b.by || "").slice(0, 80) }] } } }) }).catch(() => {});
      return res.status(200).json({ ok: true, to });
    }
    return res.status(400).json({ error: "Unknown action" });
  } catch (e) { return res.status(500).json({ error: String(e.message || e).slice(0, 300) }); }
}
