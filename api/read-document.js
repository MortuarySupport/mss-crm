// Vercel serverless function: reads a scanned MCCD / Coroner's BO / Life Extinct / VOD
// with Claude and returns the deceased's details for the check-in form.
// Needs the environment variable ANTHROPIC_API_KEY (Vercel > Project > Settings > Environment Variables).
// Optional: ANTHROPIC_MODEL (defaults to claude-sonnet-5-5).

const READABLE = ["MCCD", "Coroners BO", "LE", "VOD"];
const DOC_NAMES = {
  "MCCD": "NSW Medical Certificate of Cause of Death (MCCD)",
  "Coroners BO": "NSW Coroner's order for burial / cremation (Coroner's BO)",
  "LE": "Life Extinct form",
  "VOD": "Verification of Death form",
};

const PROMPT = (label) => `This is a scanned document from New South Wales, Australia, received by a mortuary.
Staff said it is a ${DOC_NAMES[label]}. First check what it really is, then read the details of the DECEASED person (not the doctor, informant or next of kin).

Reply with ONLY a JSON object, no other text, with exactly these keys:
{"docType":"","firstName":"","lastName":"","dob":"","dod":"","sex":"","placeOfDeath":"","placeType":""}

Rules:
- docType: what the document actually is, one of:
  "MCCD" = Medical Certificate of Cause of Death (a doctor certifies the cause of death),
  "Coroners BO" = a Coroner's order or certificate allowing burial or cremation,
  "LE" = Life Extinct form (paramedic, police or doctor confirms life is extinct),
  "VOD" = Verification of Death form (a nurse or doctor verifies the death),
  "CRA" = Cremation Risk Advice (a doctor's form about cremation risks such as pacemakers or implants),
  "Other" = anything else. Use "" only if you cannot tell.
- Leave a value as "" if it is missing, or if the handwriting is not clearly legible. Never guess.
- firstName: given name(s) only. lastName: family name only. Use normal capitalisation (e.g. "Mary Anne", "O'Brien").
- dob and dod: format YYYY-MM-DD. Dates on these forms are written day/month/year.
- sex: "Male", "Female" or "".
- placeOfDeath: the name of the hospital, nursing home or facility, or the suburb if it was a private home.
- placeType: one of "Hospital", "Nursing Home", "Home", "Other", or "".`;

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: "not_configured" });

  // Only accept requests from this site
  const origin = req.headers.origin || "";
  const host = req.headers.host || "";
  if (origin && !origin.endsWith("//" + host)) return res.status(403).json({ error: "forbidden" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const { label, images } = body || {};
  if (!READABLE.includes(label)) return res.status(400).json({ error: "This document type is not read" });
  if (!Array.isArray(images) || !images.length || images.length > 3) return res.status(400).json({ error: "1 to 3 pages only" });
  if (images.some(i => typeof i !== "string" || i.length > 1500000)) return res.status(400).json({ error: "Page too large" });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: [
            ...images.map(data => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
            { type: "text", text: PROMPT(label) },
          ],
        }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j?.error?.message || "Claude API error" });
    const text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return res.status(200).json({ fields: {} });
    let f = {};
    try { f = JSON.parse(m[0]); } catch (e) { f = {}; }
    const s = v => (typeof v === "string" ? v.trim().slice(0, 120) : "");
    const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(s(v)) ? s(v) : "");
    const types = ["MCCD", "Coroners BO", "LE", "VOD", "CRA", "Other"];
    return res.status(200).json({
      docType: types.includes(s(f.docType)) ? s(f.docType) : "",
      fields: {
        firstName: s(f.firstName), lastName: s(f.lastName),
        dob: date(f.dob), dod: date(f.dod),
        sex: ["Male", "Female"].includes(s(f.sex)) ? s(f.sex) : "",
        placeOfDeath: s(f.placeOfDeath),
        placeType: ["Hospital", "Nursing Home", "Home", "Other"].includes(s(f.placeType)) ? s(f.placeType) : "",
      },
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
