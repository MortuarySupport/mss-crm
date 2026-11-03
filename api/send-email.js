// Vercel serverless function: sends app emails through Resend.
// Needs RESEND_API_KEY and EMAIL_FROM (e.g. "Lumière <lumiere@mortuarysupport.com.au>")
// in Vercel > Project > Settings > Environment Variables. Replies go to info@.
// Until those are set it returns 501 and the app opens a pre-filled email instead.
const ALLOWED = /@(mortuarysupport\.com\.au)$/i; // only our own mailboxes for now

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) return res.status(501).json({ error: "Email not set up" });
  const { to, subject, text, attachments } = req.body || {};
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!list.length || list.some(a => !ALLOWED.test(String(a).trim()))) return res.status(400).json({ error: "Recipient not allowed" });
  if (typeof subject !== "string" || typeof text !== "string" || subject.length > 300 || text.length > 20000) return res.status(400).json({ error: "Bad message" });
  const att = (Array.isArray(attachments) ? attachments : []).slice(0, 5)
    .filter(a => a && typeof a.path === "string" && a.path.startsWith("https://qhazwfbhbelpcfwczjdb.supabase.co/storage/"))
    .map(a => ({ filename: String(a.filename || "document.pdf").slice(0, 120), path: a.path }));
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: list, reply_to: "info@mortuarysupport.com.au", subject, text, attachments: att }),
  });
  if (!r.ok) return res.status(502).json({ error: "Send failed", detail: (await r.text()).slice(0, 300) });
  return res.status(200).json({ ok: true });
}
