// Copies the funeral home list (names + contact emails) from src/App.jsx into api/_funeralHomes.js
// so the morning email knows who to send to. Runs automatically before every build.
import fs from "fs";
const src = fs.readFileSync("src/App.jsx", "utf8");
const i = src.indexOf("const FUNERAL_HOMES = [");
if (i < 0) throw new Error("FUNERAL_HOMES not found in src/App.jsx");
const j = src.indexOf("\n];", i);
const list = Function('"use strict";return ' + src.slice(src.indexOf("[", i), j + 2))();
const out = list.map(f => ({ id: f.id, name: f.name, contacts: (f.contacts || []).map(e => String(e).trim()).filter(Boolean) }));
fs.writeFileSync("api/_funeralHomes.js", "// Generated from src/App.jsx by scripts/fh-export.mjs - do not edit here\nexport default " + JSON.stringify(out, null, 1) + ";\n");
console.log("Funeral homes for morning email:", out.length);
