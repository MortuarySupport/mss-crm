import sys, os
root = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Downloads/MSS_Project/MSS_Deploy")
f = os.path.join(root, "src", "App.jsx")
c = open(f).read()
steps = [
  ('import { createPortal } from "react-dom";\n',
   'import { createPortal } from "react-dom";\nimport SecondNotes from "./SecondNotes.jsx";\n',
   "import"),
  ('    {label:"📋 MY CASES",action:"mycases",show:isMSS||isFD},\n',
   '    {label:"📋 MY CASES",action:"mycases",show:isMSS||isFD},\n    {label:"📝 2ND NOTES",action:"secondnotes",show:isMSS||isFD},\n',
   "home button"),
  ('  if(action==="mycases") return wrap(',
   '  if(action==="secondnotes") return wrap(<ErrorBoundary><SecondNotes user={user} cases={cases} onUpdateCase={handleUpdateCase} onBack={()=>setAction(null)} api={{sb,updateCase,logActivity,SUPABASE_URL,SUPABASE_KEY,FUNERAL_HOMES,STORAGE_BUCKET}}/></ErrorBoundary>);\n  if(action==="mycases") return wrap(',
   "route"),
]
for old, new, name in steps:
    if new.strip() in c:
        print(f"skip ({name} already added)"); continue
    if c.count(old) != 1:
        print(f"ERROR: could not find {name}"); sys.exit(1)
    c = c.replace(old, new); print(f"ok: {name}")
open(f, "w").write(c)
print("App.jsx patched")
