// Turns the app's plain-text emails into a branded HTML email (the plain text is still sent alongside).
// Headings = lines in CAPITALS, "Label: value" = table rows, links = buttons, ⚠️ lines = warning box.
const SITE = "https://mss-deploy.vercel.app";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONT = "font-family:Arial,Helvetica,sans-serif;";
const isHeading = l => l.length > 3 && l.length < 70 && /[A-Z]/.test(l) && l === l.toUpperCase() && !/^https?:/i.test(l) && !/:\s*\S/.test(l);
const isUrl = l => /^https?:\/\/\S+$/i.test(l);

function rows(line) {
  // "DOB: 1 Jan | DOD: 2 Feb" or "First Name: A    Last Name: B" → several label/value pairs
  return line.split(/\s*\|\s*|\s{3,}/).map(p => { const m = p.match(/^([^:]{1,40}):\s*(.*)$/); return m ? [m[1].trim(), m[2].trim()] : null; });
}

export function textToHtml(text, subject) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out = [];
  let table = [];
  const flush = () => { if (table.length) { out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px">${table.join("")}</table>`); table = []; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l || /^[─━—\-=]{4,}$/.test(l)) { flush(); continue; }
    if (isUrl(l)) {
      flush();
      const prev = out.length ? out[out.length - 1] : "";
      if (/secondnote=/.test(l)) out.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td style="background:#111111;border-radius:10px"><a href="${esc(l)}" style="${FONT}display:inline-block;padding:14px 26px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;letter-spacing:1px">📝 COMPLETE THE 2ND NOTE →</a></td></tr></table>`);
      else if (/drref=/.test(l)) out.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td style="background:#111111;border-radius:10px"><a href="${esc(l)}" style="${FONT}display:inline-block;padding:14px 26px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none">OPEN →</a></td></tr></table>`);
      else out.push(`<p style="${FONT}margin:0 0 10px;font-size:13px"><a href="${esc(l)}" style="color:#1d4ed8;word-break:break-all">${esc(l.length > 70 ? l.slice(0, 67) + "…" : l)}</a></p>`);
      void prev;
      continue;
    }
    // "Document – click here to download:" followed by its link → one download link
    const dl = l.match(/^(.*?)\s*[–-]\s*click here to download:?$/i);
    if (dl) {
      let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && isUrl(lines[j].trim())) { flush(); out.push(`<p style="${FONT}margin:0 0 8px;font-size:14px">⬇ <a href="${esc(lines[j].trim())}" style="color:#1d4ed8;font-weight:bold;text-decoration:underline">${esc(dl[1])}</a></p>`); i = j; continue; }
    }
    if (/^⚠|IMPORTANT/.test(l)) { flush(); out.push(`<div style="${FONT}background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:12px 14px;margin:8px 0 14px;font-size:14px;color:#78350f;font-weight:bold">${esc(l)}</div>`); continue; }
    if (isHeading(l)) { flush(); out.push(`<div style="${FONT}font-size:11px;font-weight:bold;letter-spacing:2px;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb;padding:16px 0 6px;margin:0 0 6px">${esc(l)}</div>`); continue; }
    if (/^(phone|email|mobile):/i.test(l)) { flush(); out.push(`<p style="${FONT}margin:0 0 2px;font-size:13px;color:#4b5563">${esc(l)}</p>`); continue; }
    const r = rows(l);
    if (r.length && r.every(Boolean) && !/^(hi|dear)\b/i.test(l)) {
      r.forEach(([k, v]) => { const hot = /infectious/i.test(k) && /yes/i.test(v);
        table.push(`<tr><td style="${FONT}padding:5px 12px 5px 0;font-size:13px;color:#6b7280;width:170px;vertical-align:top">${esc(k)}</td><td style="${FONT}padding:5px 0;font-size:14px;color:${hot ? "#b91c1c" : "#111827"};font-weight:bold;vertical-align:top">${esc(v || "—")}</td></tr>`); });
      continue;
    }
    flush();
    out.push(`<p style="${FONT}margin:0 0 12px;font-size:14px;line-height:1.55;color:#111827">${esc(l)}</p>`);
  }
  flush();
  return wrapHtml(out.join("\n"), subject);
}

// The branded email frame (logo header, white card, MSS footer) around any email body
export function wrapHtml(body, subject) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject || "")}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="padding:22px 28px 16px;border-bottom:3px solid #111111"><img src="${SITE}/email-logo.png" width="220" alt="Mortuary Support | Lumière" style="display:block;border:0;width:220px;height:auto"></td></tr>
<tr><td style="padding:22px 28px 8px">${body}</td></tr>
<tr><td style="${FONT}padding:16px 28px 22px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;line-height:1.5">Mortuary Support Services · 02 8814 5500 · <a href="mailto:info@mortuarysupport.com.au" style="color:#6b7280">info@mortuarysupport.com.au</a><br>Reply to this email to reach the MSS team.</td></tr>
</table></td></tr></table></body></html>`;
}
