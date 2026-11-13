// Dr Ref (medical referee) requests to Certa, and the secure upload link they use to send the Dr Ref back.
//   POST {action:"request", noteId}           -> emails Certa the request (once per note)
//   GET  ?t=TOKEN                              -> details + documents for the upload page
//   POST {action:"complete", t, path, filename, doctor, note} -> files the Dr Ref and tells the FD + MSS
import { textToHtml, wrapHtml } from "./_emailHtml.js";
import FUNERAL_HOMES from "./_funeralHomes.js";
const SUPABASE_URL = "https://qhazwfbhbelpcfwczjdb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYXp3ZmJoYmVscGNmd2N6amRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4ODQ1MTEsImV4cCI6MjA5NjQ2MDUxMX0.2xg7Kj56r7n_x2nZxbttqZU6Rly6ZSSnpuequpyihBo";
const BUCKET = "Case-documents";
// Dr Ref requests go to Dr Geoff Morgans (MSS is copied in). DRREF_TO can point them elsewhere (never Certa).
const DRREF_TO = process.env.DRREF_TO && !/certa/i.test(process.env.DRREF_TO) ? process.env.DRREF_TO : "gmorgans@chmc.com.au";
const DRREF_NAME = "Dr Geoff Morgans";
const INFO = "info@mortuarysupport.com.au";
const TZ = "Australia/Sydney";
const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" };
const sb = async (p, o = {}) => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.prefer ? { Prefer: o.prefer } : {}) } }); if (!r.ok) throw new Error(await r.text()); const t = await r.text(); return t ? JSON.parse(t) : null; };
const pub = p => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p.split("/").map(encodeURIComponent).join("/")}`;
const longDate = s => { if (!s) return "—"; const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return y ? new Date(Date.UTC(y, m - 1, d, 2)).toLocaleDateString("en-AU", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }) : s; };
const when = s => new Date(s).toLocaleString("en-AU", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nameOf = a => a.deceasedName || [a.firstName, a.lastName].filter(Boolean).join(" ");
const title = a => `${String(a.lastName || "").toUpperCase()}, ${a.firstName || ""}`.trim();

async function send(msg) {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("Email not set up");
  // Same branded layout as all other Lumière emails
  msg = { ...msg, html: msg.html ? wrapHtml(msg.html, msg.subject) : textToHtml(msg.text, msg.subject) };
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, reply_to: INFO, ...msg }) });
  if (!r.ok) throw new Error("Email failed: " + (await r.text()).slice(0, 200));
}
async function noteBy(q) { const rows = await sb(`second_notes?select=*&${q}&limit=1`); return rows && rows[0]; }

export default async function handler(req, res) {
  try {
    const base = process.env.APP_URL || `https://${req.headers.host}`;
    if (req.method === "GET") {
      const t = String(req.query?.t || "");
      if (!/^[a-f0-9]{48}$/.test(t)) return res.status(404).json({ error: "This link is not valid." });
      const n = await noteBy(`answers->_drref->>token=eq.${t}`);
      if (!n) return res.status(404).json({ error: "This link is not valid." });
      const a = n.answers || {}, d = a._drref || {};
      return res.status(200).json({
        name: title(a), dob: longDate(a.dob), dod: longDate(a.dod), caseRef: n.case_ref || "", fh: n.funeral_home_name || "",
        requestedAt: d.requestedAt ? when(d.requestedAt) : "", received: !!d.receivedAt, receivedAt: d.receivedAt ? when(d.receivedAt) : "",
        uploadDir: `drref/${n.id}`, docs: (d.docs || []).map(x => ({ label: x.label, url: pub(x.path) })),
        permit: (d.docs || []).some(x => x.key === "permit"), referee: DRREF_NAME, approved: d.receivedVia === "approved",
      });
    }
    if (req.method !== "POST") return res.status(405).end();
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    if (b.action === "request") {
      const n = await noteBy(`id=eq.${encodeURIComponent(b.noteId || "")}`);
      const a = n?.answers || {}, d = a._drref;
      if (!d?.token) return res.status(400).json({ error: "No Dr Ref request on this 2nd Note" });
      if (d.sentAt && !b.resend) return res.status(200).json({ ok: true, already: true });
      const fh = FUNERAL_HOMES.find(f => f.id === n.funeral_home_id) || {};
      const link = `${base}/?drref=${d.token}`;
      // Attach what fits in one email (about 18 MB); anything bigger is opened from the upload page instead
      const sized = await Promise.all(d.docs.map(async x => { let size = 0; try { const h = await fetch(pub(x.path), { method: "HEAD" }); size = Number(h.headers.get("content-length")) || 0; } catch {} return { ...x, size }; }));
      let room = 18 * 1024 * 1024; const attach = [], big = [];
      for (const x of [...sized].sort((p, q) => p.size - q.size)) { if (x.size <= room) { attach.push(x); room -= x.size; } else big.push(x); }
      const updated = !!(b.resend && d.sentAt);
      const rows = [["Deceased", `<b>${esc(nameOf(a))}</b>`], ["Date of birth", longDate(a.dob)], ["Date of death", longDate(a.dod)], ["Case number", esc(n.case_ref || "Not yet in MSS care")], ["Funeral director", esc(n.funeral_home_name + (fh.phone ? " · " + fh.phone : ""))], ["Requested by", esc(d.requestedBy || "")]];
      const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827"><p>Dear Doctor,</p><p>A Dr Ref (medical referee's certificate) is requested for the cremation of:</p>
<table style="border-collapse:collapse;margin-bottom:14px">${rows.map(([k, v]) => `<tr><td style="padding:3px 18px 3px 0;color:#6b7280">${k}</td><td>${v}</td></tr>`).join("")}</table>
${updated ? "<p><b>This is an updated request: the documents have changed since our earlier email. Please use these ones.</b></p>" : ""}<p>${attach.length ? "Attached: " + attach.map(x => esc(x.label)).join(", ") + "." : ""}${big.length ? ` <b>Too large to attach:</b> ${big.map(x => esc(x.label)).join(", ")}. Open ${big.length > 1 ? "them" : "it"} with the Upload Dr Ref button below.` : ""} ${d.docs.some(x => x.key === "permit") ? "Your Medical Referee's Cremation Permit is attached, filled in for this deceased. Please review the documents and, if everything is correct, tap <b>Review &amp; approve</b> below and then <b>Approve</b>. If you'd rather send your own Dr Ref, you can upload it on the same page." : "When your Dr Ref is complete, please upload it using the button below — it goes straight into the deceased's file."}</p>
<p style="margin:22px 0"><a href="${link}" style="background:#111827;color:#fff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:10px;display:inline-block">${d.docs.some(x => x.key === "permit") ? "✓ REVIEW &amp; APPROVE" : "⬆ UPLOAD DR REF"}</a></p>
<p style="font-size:12px;color:#6b7280">This link is only for this deceased; please don't forward it. Questions: reply to this email or call MSS on 02 8814 5500.<br>${link}</p><p>The Team at Mortuary Support | Lumière</p></div>`;
      const text = `Dear Doctor,\n\nA Dr Ref is requested for the cremation of ${nameOf(a)} (born ${longDate(a.dob)}, died ${longDate(a.dod)}), case ${n.case_ref || "not yet in MSS care"}, funeral director ${n.funeral_home_name}.\n\n${updated ? "UPDATED REQUEST: the documents have changed since our earlier email.\n\n" : ""}Documents attached: ${attach.map(x => x.label).join(", ") || "none"}.${big.length ? " Too large to attach (open from the link): " + big.map(x => x.label).join(", ") + "." : ""}\n\n${d.docs.some(x => x.key === "permit") ? "Your Cremation Permit is attached, filled in. Review and approve it here (this deceased only)" : "Upload your Dr Ref here (this deceased only)"}: ${link}\n\nQuestions: reply to this email or call MSS on 02 8814 5500.\n\nThe Team at Mortuary Support | Lumière`;
      await send({ to: [DRREF_TO], cc: [INFO], subject: `${updated ? "UPDATED " : ""}Dr Ref request – ${title(a)}${n.case_ref ? " – " + n.case_ref : ""}`, html, text, attachments: attach.map(x => ({ filename: `${x.label} – ${a.lastName || "deceased"}.${(x.path.split(".").pop() || "pdf")}`, path: pub(x.path) })) });
      const answers = { ...a, _drref: { ...d, sentAt: new Date().toISOString(), sentTo: DRREF_TO } };
      await sb(`second_notes?id=eq.${n.id}`, { method: "PATCH", body: JSON.stringify({ answers }) });
      return res.status(200).json({ ok: true, to: DRREF_NAME });
    }

    if (b.action === "complete") {
      const t = String(b.t || "");
      if (!/^[a-f0-9]{48}$/.test(t)) return res.status(404).json({ error: "This link is not valid." });
      const n = await noteBy(`answers->_drref->>token=eq.${t}`);
      if (!n) return res.status(404).json({ error: "This link is not valid." });
      const a = n.answers || {}, d = a._drref || {};
      if (d.receivedAt) return res.status(409).json({ error: "This link has already been used." });
      // Approve = the pre-filled Cremation Permit we sent is correct; it becomes the Dr Ref. Otherwise the doctor uploaded his own.
      const approved = !!b.approved, permitDoc = (d.docs || []).find(x => x.key === "permit");
      if (approved && !permitDoc) return res.status(400).json({ error: "There's no permit to approve. Please upload your Dr Ref instead." });
      const path = approved ? permitDoc.path : String(b.path || ""), doctor = (String(b.doctor || "").trim() || (approved ? DRREF_NAME : "")).slice(0, 120), note = String(b.note || "").trim().slice(0, 500);
      if (!path.startsWith(`drref/${n.id}/`) || path.includes("..")) return res.status(400).json({ error: "Upload not found." });
      if (!doctor) return res.status(400).json({ error: "Please type your name." });
      const head = await fetch(pub(path), { method: "HEAD" });
      if (!head.ok) return res.status(400).json({ error: "The file didn't upload. Please try again." });
      const now = new Date().toISOString();
      const answers = { ...a, _drref: { ...d, receivedAt: now, receivedBy: doctor, receivedNote: note, receivedPath: path, receivedName: approved ? "Medical Referee's Cremation Permit (approved)" : String(b.filename || "Dr Ref").slice(0, 150), receivedVia: approved ? "approved" : "upload" } };
      await sb(`second_notes?id=eq.${n.id}`, { method: "PATCH", body: JSON.stringify({ answers }) });
      if (n.case_id) await fetch(`${SUPABASE_URL}/storage/v1/object/copy`, { method: "POST", headers: H, body: JSON.stringify({ bucketId: BUCKET, sourceKey: path, destinationKey: `${n.case_id}/${Date.now()}_DR_REF.${path.split(".").pop()}` }) }).catch(() => {});
      const fh = FUNERAL_HOMES.find(f => f.id === n.funeral_home_id) || {};
      const to = [...new Set([INFO, ...(fh.contacts || [])])];
      const text = approved
        ? `Hi ${n.funeral_home_name} Team,\n\nThe Dr Ref for ${nameOf(a)}${n.case_ref ? " (" + n.case_ref + ")" : ""} has been APPROVED by ${doctor}.\n\nApproved: ${when(now)}${note ? "\nNote: " + note : ""}\n\nThe Medical Referee's Cremation Permit is attached${n.case_id ? " and saved to the case documents in Lumière" : ""}.\n\nThe Team at Mortuary Support | Lumière\nPhone: 02 8814 5500\nEmail: ${INFO}`
        : `Hi ${n.funeral_home_name} Team,\n\nThe Dr Ref for ${nameOf(a)}${n.case_ref ? " (" + n.case_ref + ")" : ""} has been received from ${DRREF_NAME}.\n\nUploaded by: ${doctor} on ${when(now)}${note ? "\nNote: " + note : ""}\n\nThe Dr Ref is attached${n.case_id ? " and saved to the case documents in Lumière" : ""}.\n\nThe Team at Mortuary Support | Lumière\nPhone: 02 8814 5500\n${INFO}`;
      await send({ to, subject: `Dr Ref ${approved ? "approved" : "received"} – ${title(a)}${n.case_ref ? " – " + n.case_ref : ""}`, text, attachments: [{ filename: `${approved ? "Cremation Permit" : "Dr Ref"} – ${a.lastName || "deceased"}.${path.split(".").pop()}`, path: pub(path) }] }).catch(() => {});
      return res.status(200).json({ ok: true, approved, name: title(a), caseRef: n.case_ref || "", at: when(now) });
    }
    if (b.action === "resend") {
      const n = await noteBy(`id=eq.${encodeURIComponent(b.noteId || "")}`);
      const a = n?.answers || {}, d = a._drref || {};
      if (!d.receivedPath) return res.status(400).json({ error: "No Dr Ref has been received for this deceased yet." });
      const fh = FUNERAL_HOMES.find(f => f.id === n.funeral_home_id) || {};
      const to = [...new Set(fh.contacts || [])];
      if (!to.length) return res.status(400).json({ error: "No email address is set up for " + (n.funeral_home_name || "this funeral home") + "." });
      const text = `Hi ${n.funeral_home_name} Team,\n\nAs requested, here is the Dr Ref for ${nameOf(a)}${n.case_ref ? " (" + n.case_ref + ")" : ""}.\n\nReceived from ${DRREF_NAME} (${d.receivedBy || "medical referee"}) on ${when(d.receivedAt)}.\n\nAny questions please contact us.\n\nThe Team at Mortuary Support | Lumière\nPhone: 02 8814 5500\n${INFO}`;
      await send({ to, subject: `Dr Ref – ${title(a)}${n.case_ref ? " – " + n.case_ref : ""}`, text, attachments: [{ filename: `Dr Ref – ${a.lastName || "deceased"}.${d.receivedPath.split(".").pop()}`, path: pub(d.receivedPath) }] });
      const answers = { ...a, _drref: { ...d, resent: [...(d.resent || []), { at: new Date().toISOString(), by: String(b.by || "").slice(0, 80), to }] } };
      await sb(`second_notes?id=eq.${n.id}`, { method: "PATCH", body: JSON.stringify({ answers }) }).catch(() => {});
      return res.status(200).json({ ok: true, to });
    }
    return res.status(400).json({ error: "Unknown action" });
  } catch (e) { return res.status(500).json({ error: String(e.message || e).slice(0, 300) }); }
}
