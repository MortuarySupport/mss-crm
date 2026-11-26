// Leura Memorial Gardens: Certificate of Cremation, filled in and signed online (MSS NSNA cases).
// Recreated from Leura's own documents, with their permission.
const PDFLIB = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js";
export const LEURA = {
  company: "Leura Memorial Gardens Holdings Pty Ltd",
  address: "1 Kitchener Road, Leura NSW 2780",
  gm: "Jonathan Murphy", gmTitle: "General Manager",
  declarant: "Daniel Bredal", declarantTitle: "Funeral Consultant",
  jp: "Jonathan Stephen Murphy", jpReg: "262175",
  urn: "natural scatter urn",
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ordSuf = d => ((d % 100 >= 11 && d % 100 <= 13) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[d % 10] || "th"));
// "2026-07-22" -> {d:22, suf:"nd", rest:"July 2026"}
export const dParts = ymd => { const [y, m, d] = String(ymd || "").slice(0, 10).split("-").map(Number); return y ? { d, suf: ordSuf(d), month: MONTHS[m - 1], year: y } : null; };

let assets = null;
async function loadAssets() {
  if (assets) return assets;
  const get = p => fetch(p).then(r => { if (!r.ok) throw new Error("Missing " + p); return r.arrayBuffer(); });
  const [logo, banner] = await Promise.all([get("/forms/leura/logo.png"), get("/forms/leura/banner.jpg")]);
  return (assets = { logo, banner });
}
const dataBytes = u => { const b = atob(String(u).split(",")[1] || ""); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };

/**
 * v: { name, certNo, cremDate (YYYY-MM-DD), signDate (YYYY-MM-DD), gm, gmTitle, gmSig (PNG data URL, optional for previews) }
 * returns { cert: Uint8Array }
 */
export async function makeCremDocs(v) {
  const { PDFDocument, StandardFonts, rgb } = await import(/* @vite-ignore */ PDFLIB);
  const A = await loadAssets();
  const W = 595.32, Hh = 841.92, K = rgb(0.07, 0.07, 0.07);
  const cr = dParts(v.cremDate), sg = dParts(v.signDate);

  async function base() {
    const pdf = await PDFDocument.create(); const page = pdf.addPage([W, Hh]);
    const F = { tr: await pdf.embedFont(StandardFonts.TimesRoman), tb: await pdf.embedFont(StandardFonts.TimesRomanBold), ti: await pdf.embedFont(StandardFonts.TimesRomanItalic), tbi: await pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
      h: await pdf.embedFont(StandardFonts.Helvetica), hb: await pdf.embedFont(StandardFonts.HelveticaBold), hi: await pdf.embedFont(StandardFonts.HelveticaOblique) };
    const logo = await pdf.embedPng(A.logo), banner = await pdf.embedJpg(A.banner);
    const lw = 300, lh = lw * logo.height / logo.width; page.drawImage(logo, { x: (W - lw) / 2, y: Hh - 70 - lh, width: lw, height: lh });
    const bw = 442, bh = bw * banner.height / banner.width; page.drawImage(banner, { x: (W - bw) / 2, y: Hh - 680 - bh, width: bw, height: bh });
    const sig = async (u, x, yTop, w, h) => { if (!u) return; const img = await pdf.embedPng(dataBytes(u)); const s = Math.min(w / img.width, h / img.height); page.drawImage(img, { x: x + (w - img.width * s) / 2, y: Hh - yTop - h + (h - img.height * s) / 2, width: img.width * s, height: img.height * s }); };
    // text helpers (y = baseline measured from the top of the page)
    const tw = (t, f, s) => f.widthOfTextAtSize(t, s);
    const center = (t, f, s, y) => page.drawText(t, { x: (W - tw(t, f, s)) / 2, y: Hh - y, size: s, font: f, color: K });
    // a date with a raised ordinal: [ "22", "nd", " July 2026" ] centred or at x
    const ordinal = (p, f, s, y, x = null, tail = "") => { if (!p) return 0; const a = String(p.d), b = p.suf, c = ` ${p.month} ${p.year}${tail}`;
      const w = tw(a, f, s) + tw(b, f, s * 0.62) + tw(c, f, s); let cx = x == null ? (W - w) / 2 : x;
      page.drawText(a, { x: cx, y: Hh - y, size: s, font: f, color: K }); cx += tw(a, f, s);
      page.drawText(b, { x: cx, y: Hh - y + s * 0.38, size: s * 0.62, font: f, color: K }); cx += tw(b, f, s * 0.62);
      page.drawText(c, { x: cx, y: Hh - y, size: s, font: f, color: K }); return w; };
    return { pdf, page, F, sig, tw, center, ordinal };
  }

  // ── Certificate of Cremation ──
  const C = await base(); { const { page, F, center, ordinal, sig, tw } = C;
    center(v.certNo || "", F.ti, 14, 198);
    center("Certificate of Cremation", F.tb, 22, 233);
    center("This is to certify that the Late", F.tr, 13.5, 266);
    center(v.name || "", F.tb, 21, 307);
    center("was cremated on the", F.tb, 13.5, 372);
    ordinal(cr, F.tb, 16.5, 425);
    center("at", F.tr, 13.5, 475);
    center(LEURA.company, F.tb, 13.5, 522);
    // "Signed this 10th Day of August 2026" (bold italic, smaller)
    if (sg) { const s = 10.5, pre = "Signed this ", a = String(sg.d), b = sg.suf, c = ` Day of ${sg.month} ${sg.year}`;
      const w = tw(pre, F.tbi, s) + tw(a, F.tbi, s) + tw(b, F.tbi, s * 0.62) + tw(c, F.tbi, s); let x = (W - w) / 2, y = 566;
      [[pre, s, 0], [a, s, 0], [b, s * 0.62, s * 0.38], [c, s, 0]].forEach(([t, z, up]) => { page.drawText(t, { x, y: 841.92 - y + up, size: z, font: F.tbi, color: K }); x += tw(t, F.tbi, z); }); }
    await sig(v.gmSig, 225, 574, 170, 48);
    page.drawLine({ start: { x: 205, y: 841.92 - 624 }, end: { x: 390, y: 841.92 - 624 }, thickness: 0.6, color: K });
    center(`${v.gm || LEURA.gm} - ${v.gmTitle || LEURA.gmTitle}`, F.tr, 8, 636);
  }

  return { cert: await C.pdf.save() };
}
