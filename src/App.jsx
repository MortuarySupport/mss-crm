import React, { useState, useEffect, useRef } from "react";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://qhazwfbhbelpcfwczjdb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYXp3ZmJoYmVscGNmd2N6amRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4ODQ1MTEsImV4cCI6MjA5NjQ2MDUxMX0.2xg7Kj56r7n_x2nZxbttqZU6Rly6ZSSnpuequpyihBo";

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function getUsers() {
  return sb("users?select=*");
}

async function getCases() {
  return sb("cases?select=*&order=created_at.desc");
}

async function insertCase(record) {
  return sb("cases", {
    method: "POST",
    body: JSON.stringify(record),
    prefer: "return=representation",
  });
}

async function updateCase(id, updates) {
  return sb(`cases?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
    prefer: "return=representation",
  });
}

async function updateUserPin(id, pin) {
  return sb(`users?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ pin }),
    prefer: "return=representation",
  });
}


// ─── SUPABASE STORAGE ─────────────────────────────────────────────────────────
const STORAGE_BUCKET = "Case-documents";

async function uploadDocument(caseId, file, label) {
  const ext = file.name.split(".").pop();
  const path = `${caseId}/${Date.now()}_${label.replace(/\s+/g,"_")}.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": file.type,
      "x-upsert": "true",
    },
    body: file,
  });
  if(!res.ok) throw new Error(await res.text());
  return path;
}

async function listDocuments(caseId) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${STORAGE_BUCKET}`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix: `${caseId}/`, limit: 100 }),
  });
  if(!res.ok) return [];
  const data = await res.json();
  return data||[];
}

async function deleteDocument(path) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: "DELETE",
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  return res.ok;
}

function getDocumentUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MORTUARY_EMAIL = "info@mortuarysupport.com.au";
const FUNERAL_HOMES = [
  { id:"FH01", name:"Amazing Funerals",                contacts:["info@amazingfunerals.com.au"] },
  { id:"FH02", name:"Blessed Funerals",                 contacts:["carmel.pisto@blessedfunerals.com.au","tony.sprem@blessedfunerals.com.au"] },
  { id:"FH03", name:"Darrin Burns Funerals",            contacts:["info@dbff.com.au"] },
  { id:"FH04", name:"Divine Family Funerals",           contacts:["desi@divinefamilyfunerals.com.au"] },
  { id:"FH05", name:"Farwell Funerals",                 contacts:["info@farewells.com.au"] },
  { id:"FH06", name:"Funerals By Design (SFCo)",        contacts:["Karin@funeralsbydesign.com.au"] },
  { id:"FH07", name:"Global Funerals",                  contacts:["info@globalfunerals.com.au"] },
  { id:"FH08", name:"Hansol Funerals",                  contacts:["hansolfuneralservices@gmail.com"] },
  { id:"FH09", name:"Highland Funerals",                contacts:["info@highlandfunerals.com.au"] },
  { id:"FH10", name:"Kellie Hart Funerals",             contacts:["kellie@kelliehartfunerals.com.au"] },
  { id:"FH11", name:"Over The Rainbow Funerals (SFCo)", contacts:["info@overtherainbowfunerals.com.au"] },
  { id:"FH12", name:"Serenity Family Funerals",         contacts:["debbie@serenityfamilyfunerals.com.au"] },
  { id:"FH13", name:"Sydney Funerals",                  contacts:["peter@sydneyfunerals.com","Info@sydneyfunerals.com"] },
  { id:"FH14", name:"The Last Time",                    contacts:["Sydney@thelasttime.com.au"] },
  { id:"FH15", name:"Timmins Funerals",                 contacts:["funeral.directors1@outlook.com"] },
  { id:"FH16", name:"Tomorrow Funerals",                contacts:["kate@tomorrowfunerals.com.au"] },
  { id:"FH17", name:"Your Funeral Director",            contacts:["nicky@yourfuneraldirector.com.au"] },
];

const PAPERWORK_OPTIONS = ["MCCD","BO","CRA","VOD","LE"];
const TRANSFER_FROM_OPTIONS = ["Hospital","Nursing Home","Coroners","Home","Repatriation","Other"];
const CORONER_OPTIONS = ["Sydney","Newcastle","Wollongong","Canberra"];
const DISPOSITION_OPTIONS = ["Burial","Cremation","Repatriation"];
const PREP_OPTIONS = [
  {label:"No Prep",short:"NSNA"},{label:"Basic Prep",short:"BP"},
  {label:"Temp Prep",short:"TP"},{label:"Full Embalm",short:"FE"},
  {label:"Repatriation",short:"REP"},
];
const DESTINATIONS = [
  "Northern Suburbs Memorial Gardens","Macquarie Park Cemetery","Rookwood General Cemetery",
  "Eastern Suburbs Memorial Park","Woronora Memorial Park","Forest Lawn Memorial Park",
  "Frenchs Forest Bushland Cemetery","Castlebrook Memorial Park",
];
const BILLABLE_ITEMS = [
  "After Hours Body Prep or Sealing Surcharge","Assist in Witness Dressing - Per Person",
  "Body Bag","Capri Pants","Casual Labour Hire - 4hrs min, PP","Chapel Hire",
  "Coffin Packaging for Transportation","Crucifix/Cross - Large","Crucifix/Cross - Small",
  "Dr Referee","Dr ID - Inperson","Dr ID - Virtual","ED - ESMP | WMP",
  "ED - Forest Lawn | L'pool | Kemps Crk","ED - Mac Park | North Sub | Pine | Castle",
  "ED - Rookwood (All) | Frenchs | Penrith","ED - Weekend/AH","Family Meeting Room",
  "Gravemarker Assembly","Hair Colouring","Hearse Hire - Dual","Hearse Hire - Single",
  "Name Plate - Silver Large","Name Plate - Gold Large","Name Plate Etching",
  "Open/Close Mortuary A/H","Repatriation Service Fee","Shroud","Transfer - Home",
  "Transfers - Hospital or Coroner","Transfer Time - Mon to Fri","Transfer Time - Weekend",
  "Tyvek Suits","Viewing Room","Viewing Room Host",
];
const OTHER_ITEMS = {
  "Aspiration/Cavity/Bio-Seal":["Aspiration","Cavity Treatment","Bio-Seal"],
  "Case Type":["Individual","List A","Covid","Infectious Case","Reconstruction"],
};
const CHECKOUT_ITEMS = ["Check Name Plate","Check ID Tag","Collect Paperwork","Erase from Board","Check / Collect Valuables"];
const VIEWING_SLOTS = [];
for(let h=9;h<=21;h++){
  VIEWING_SLOTS.push(`${String(h).padStart(2,"0")}:00`);
  if(h<21) VIEWING_SLOTS.push(`${String(h).padStart(2,"0")}:30`);
}

const TRANSFER_BY_PRESETS = { "All Hours":["Jimmy","Jacquie","Peter"], "MSS":["Angus","Peter","Scott"] };
const TRANSFER_BY_COMPANIES_PRIMARY = ["All Hours","MSS","Statewide"];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function genId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`; }
function fmt(iso) { if(!iso) return "—"; const[y,m,d]=iso.split("-"); return`${d}/${m}/${y}`; }
function fmtDT(iso) { if(!iso) return "—"; return new Date(iso).toLocaleString("en-AU"); }
function calcAge(dob,dod) {
  if(!dob||!dod) return null;
  const b=new Date(dob),d=new Date(dod);
  let a=d.getFullYear()-b.getFullYear();
  if(d.getMonth()-b.getMonth()<0||(d.getMonth()===b.getMonth()&&d.getDate()<b.getDate())) a--;
  return a>=0?a:null;
}
function genCaseRef(cases) { return `MSS_${(cases.length+1).toString().padStart(5,"0")}`; }
function getFHContacts(fhId) { return FUNERAL_HOMES.find(f=>f.id===fhId)?.contacts||[]; }
function sexShort(s) { return s==="Male"?"M":s==="Female"?"F":"O"; }
function sortAlpha(arr,key="name") { return [...arr].sort((a,b)=>a[key].localeCompare(b[key])); }
function today() { return new Date().toISOString().slice(0,10); }
function minDOB() { const d=new Date(); d.setFullYear(d.getFullYear()-110); return d.toISOString().slice(0,10); }
function next4WeekDates() {
  const dates=[],d=new Date();
  for(let i=0;i<=28;i++){const dd=new Date(d);dd.setDate(d.getDate()+i);dates.push(dd.toISOString().slice(0,10));}
  return dates;
}
function getBookedSlots(cases,excludeId) {
  const b=new Set();
  cases.filter(c=>c.id!==excludeId&&c.prep?.viewingSlot).forEach(c=>b.add(c.prep.viewingSlot));
  return b;
}
function twoWeeksAgo() { const d=new Date(); d.setDate(d.getDate()-14); return d; }

// Map DB row to app case format
function dbToCase(row) {
  return {
    id: row.id,
    caseRef: row.case_ref,
    firstName: row.first_name,
    lastName: row.last_name,
    dob: row.dob,
    dod: row.dod,
    sex: row.sex,
    ageAtDeath: row.age_at_death,
    transferredFrom: row.transferred_from,
    transferredBy: row.transferred_by,
    transferPersonName: row.transfer_person_name,
    transferDate: row.transfer_date,
    valuables: row.valuables,
    paperwork: row.paperwork,
    funeralHomeId: row.funeral_home_id,
    funeralHomeName: row.funeral_home_name,
    checkedInBy: row.checked_in_by,
    checkedInRole: row.checked_in_role,
    checkedInAt: row.checked_in_at,
    status: row.status,
    prepStatus: row.prep_status,
    step: row.step,
    checkedOut: row.checked_out,
    checkout: row.checkout_data,
    prep: row.prep||{},
    billable: row.billable||{},
    otherUsed: row.other_used||{},
    statusItems: row.status_items||{},
  };
}

// Map app case to DB row
function caseToDb(c) {
  return {
    id: c.id,
    case_ref: c.caseRef,
    first_name: c.firstName,
    last_name: c.lastName,
    dob: c.dob,
    dod: c.dod,
    sex: c.sex,
    age_at_death: c.ageAtDeath,
    transferred_from: c.transferredFrom,
    transferred_by: c.transferredBy,
    transfer_person_name: c.transferPersonName,
    transfer_date: c.transferDate,
    valuables: c.valuables,
    paperwork: c.paperwork,
    funeral_home_id: c.funeralHomeId,
    funeral_home_name: c.funeralHomeName,
    checked_in_by: c.checkedInBy,
    checked_in_role: c.checkedInRole,
    checked_in_at: c.checkedInAt,
    status: c.status||"active",
    prep_status: c.prepStatus||"not-started",
    step: c.step||1,
    checked_out: c.checkedOut||false,
    checkout_data: c.checkout||null,
    prep: c.prep||{},
    billable: c.billable||{},
    other_used: c.otherUsed||{},
    status_items: c.statusItems||{},
  };
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = {
  inp:"w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 text-base focus:outline-none focus:border-gray-800 transition placeholder-gray-400",
  sel:"w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 text-base focus:outline-none focus:border-gray-800 transition",
  btnDark:"px-6 py-3 rounded-xl bg-gray-900 hover:bg-gray-700 text-white font-bold text-sm uppercase tracking-wide transition",
  btnGhost:"px-6 py-3 rounded-xl border-2 border-gray-300 text-gray-700 hover:border-gray-900 font-bold text-sm uppercase tracking-wide transition",
  btnLg:"w-full py-5 rounded-2xl bg-gray-900 hover:bg-gray-700 text-white font-bold text-sm uppercase tracking-wide transition",
  btnLgGhost:"w-full py-5 rounded-2xl border-2 border-gray-200 hover:border-gray-900 text-gray-800 font-bold text-sm uppercase tracking-wide transition bg-white",
  card:"bg-white border border-gray-200 rounded-2xl p-6 mb-4",
  section:"text-xs font-bold text-gray-500 uppercase tracking-widest mb-3",
  label:"block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2",
  tb:(a)=>`px-4 py-2.5 rounded-xl border-2 text-sm font-bold transition ${a?"bg-gray-900 text-white border-gray-900":"bg-white text-gray-600 border-gray-300 hover:border-gray-700"}`,
  tbGreen:(a)=>`px-4 py-2.5 rounded-xl border-2 text-sm font-bold transition ${a?"bg-green-600 text-white border-green-600":"bg-white text-gray-600 border-gray-300 hover:border-gray-700"}`,
  tbRed:(a)=>`px-4 py-2.5 rounded-xl border-2 text-sm font-bold transition ${a?"bg-red-500 text-white border-red-500":"bg-white text-gray-600 border-gray-300 hover:border-gray-700"}`,
  tbYellow:(a)=>`px-4 py-2.5 rounded-xl border-2 text-sm font-bold transition ${a?"bg-amber-400 text-white border-amber-400":"bg-white text-gray-600 border-gray-300 hover:border-gray-700"}`,
};

// ─── LOGO ─────────────────────────────────────────────────────────────────────
function MSSLogo({ size="md" }) {
  const dim=size==="lg"?120:size==="sm"?44:80;
  return (
    <div className="flex items-center gap-4">
      <div style={{width:dim,height:dim*0.72,border:"2px solid #222",position:"relative",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <div style={{position:"absolute",top:6,left:6,right:6,height:1,background:"#aaa"}}/>
        <div style={{position:"absolute",bottom:6,left:6,right:6,height:1,background:"#aaa"}}/>
        <span style={{fontFamily:"'Georgia',serif",fontWeight:900,fontSize:dim*0.32,color:"#222",letterSpacing:2}}>MSS</span>
      </div>
      <div style={{borderLeft:"1.5px solid #ccc",paddingLeft:14}}>
        <div style={{fontFamily:"'Georgia',serif",fontWeight:700,fontSize:dim*0.22,color:"#222",letterSpacing:4,textTransform:"uppercase"}}>MORTUARY</div>
        <div style={{fontFamily:"'Arial',sans-serif",fontWeight:300,fontSize:dim*0.12,color:"#999",letterSpacing:6,textTransform:"uppercase",marginTop:2}}>SUPPORT SERVICES</div>
      </div>
    </div>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
function Field({label,required,children}) {
  return (
    <div className="mb-5">
      <label className={s.label}>{label}{required&&<span className="text-red-500 ml-1">*</span>}</label>
      {children}
    </div>
  );
}
function Divider() { return <div className="border-t-2 border-gray-100 my-5"/>; }
function BackBtn({onClick,label="Back"}) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-700 transition mb-5">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
      {label}
    </button>
  );
}
function StatusDot({status}) {
  const m={"not-started":"bg-red-500","in-progress":"bg-amber-500","completed":"bg-green-500"};
  return <span className={`inline-block w-3 h-3 rounded-full flex-shrink-0 ${m[status]||"bg-gray-300"}`}/>;
}
function Toggle({label,checked,onChange}) {
  return (
    <label className="flex items-center gap-3 py-2 cursor-pointer">
      <div onClick={onChange} className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 relative cursor-pointer ${checked?"bg-gray-900":"bg-gray-300"}`}>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked?"translate-x-7":"translate-x-1"}`}/>
      </div>
      <span className="text-sm font-medium text-gray-800">{label}</span>
    </label>
  );
}
function MultiToggle({options,selected,onToggle}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o=>(
        <button key={o} type="button" onClick={()=>onToggle(o)} className={s.tb(selected.includes(o))}>{o}</button>
      ))}
    </div>
  );
}
function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-10 h-10 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin"/>
    </div>
  );
}

// ─── INLINE EDIT (Admin) ──────────────────────────────────────────────────────
function InlineEdit({isAdmin,value,display,onSave,type="text",options}) {
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(value||"");
  if(!isAdmin) return <span className="text-gray-900 font-medium">{display||value||"—"}</span>;
  if(editing) {
    return options
      ? <select className={s.sel} value={val} onChange={e=>setVal(e.target.value)} onBlur={()=>{onSave(val);setEditing(false);}} autoFocus>
          {options.map(o=><option key={o}>{o}</option>)}
        </select>
      : <input type={type} className={s.inp} value={val} onChange={e=>setVal(e.target.value)} onBlur={()=>{onSave(val);setEditing(false);}} autoFocus/>;
  }
  return (
    <span onClick={()=>{setVal(value||"");setEditing(true);}} className="cursor-pointer border-b border-dashed border-gray-300 hover:border-gray-700 text-gray-900 font-medium transition">
      {display||value||"—"} <span className="text-gray-300 text-xs ml-1">✎</span>
    </span>
  );
}



// ─── APPROVALS VIEW ───────────────────────────────────────────────────────────
function ApprovalsView({user,cases,onUpdateCase,onBack}){
  const isAdmin=user?.role==="admin";
  const isMSS=user?.role==="mss"||isAdmin;
  useEffect(()=>window.scrollTo({top:0,behavior:"smooth"}),[]);

  const pendingCases=cases.filter(c=>c.checkedOut&&c.status==="pending-lock")
    .sort((a,b)=>new Date(b.checkout?.checkedOutAt||0)-new Date(a.checkout?.checkedOutAt||0));

  async function approveCase(c){
    try{
      await updateCase(c.id,{status:"approved"});
      onUpdateCase(c.id,{status:"approved"});
      const prep=c.prep||{},billable=c.billable||{},otherUsed=c.otherUsed||{};
      const to="accounts@mortuarysupport.com.au";
      const subj=encodeURIComponent(`Job Card — ${c.firstName} ${c.lastName} — ${c.caseRef}`);
      const body=encodeURIComponent(buildApproveEmail(c,prep,billable,otherUsed));
      window.open(`mailto:${to}?subject=${subj}&body=${body}`);
    }catch(err){alert("Error: "+err.message);}
  }

  return(
    <div className="max-w-3xl mx-auto px-4 py-8">
      <BackBtn onClick={onBack} label="BACK TO HOME"/>
      <h2 className="text-2xl font-black text-gray-900 mb-1 uppercase">Approvals</h2>
      <p className="text-gray-500 text-sm font-bold uppercase mb-5">{pendingCases.length} case{pendingCases.length!==1?"s":""} awaiting approval</p>
      {pendingCases.length===0&&(
        <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
          <p className="text-2xl mb-2">✅</p>
          <p className="text-green-700 font-black uppercase">All cases approved</p>
        </div>
      )}
      <div className="space-y-4">
        {pendingCases.map(c=>(
          <div key={c.id} className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-xl font-black text-gray-900 uppercase">{(c.lastName||"").toUpperCase()}, {c.firstName}</div>
                <div className="text-xs font-bold text-gray-400 uppercase mt-1">{c.caseRef} · {c.funeralHomeName} · Checked Out: {fmtDT(c.checkout?.checkedOutAt)}</div>
              </div>
              <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 rounded-full px-2 py-0.5 font-black uppercase flex-shrink-0">Pending</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 mb-4">
              <span className="font-bold uppercase">Prep: <span className="text-gray-800">{(c.prep?.prepOptions||[]).map(p=>PREP_OPTIONS.find(x=>x.label===p)?.short||p).join(", ")||"—"}</span></span>
              <span className="font-bold uppercase">Disposition: <span className="text-gray-800">{c.prep?.disposition||"—"}</span></span>
              <span className="font-bold uppercase">Destination: <span className="text-gray-800">{c.checkout?.destination||"—"}</span></span>
              <span className="font-bold uppercase">Signed: <span className="text-gray-800">{c.checkout?.signedName||"—"}</span></span>
              <span className="font-bold uppercase">Billable: <span className="text-gray-800">{Object.keys(c.billable||{}).filter(k=>c.billable[k]).length} items</span></span>
            </div>
            <button onClick={()=>approveCase(c)}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-wide transition">
              ✓ APPROVE & SEND JOB CARD
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── LOCK VIEW ────────────────────────────────────────────────────────────────
function LockView({cases,onUpdateCase,onBack}){
  useEffect(()=>window.scrollTo({top:0,behavior:"smooth"}),[]);

  const approvedCases=cases.filter(c=>c.status==="approved")
    .sort((a,b)=>new Date(b.checkout?.checkedOutAt||0)-new Date(a.checkout?.checkedOutAt||0));

  async function lockCase(id){
    try{await updateCase(id,{status:"locked"});onUpdateCase(id,{status:"locked"});}
    catch(err){alert("Error: "+err.message);}
  }

  async function unlockCase(id){
    try{await updateCase(id,{status:"pending-lock"});onUpdateCase(id,{status:"pending-lock"});}
    catch(err){alert("Error: "+err.message);}
  }

  // Also show locked cases so admin can unlock
  const lockedCases=cases.filter(c=>c.status==="locked")
    .sort((a,b)=>new Date(b.checkout?.checkedOutAt||0)-new Date(a.checkout?.checkedOutAt||0));

  return(
    <div className="max-w-3xl mx-auto px-4 py-8">
      <BackBtn onClick={onBack} label="BACK TO HOME"/>
      <h2 className="text-2xl font-black text-gray-900 mb-1 uppercase">Lock Cases</h2>
      <p className="text-gray-500 text-sm font-bold uppercase mb-5">{approvedCases.length} approved · {lockedCases.length} locked</p>

      {approvedCases.length===0&&(
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center mb-6">
          <p className="text-gray-400 font-black uppercase">No approved cases to lock</p>
        </div>
      )}

      {approvedCases.length>0&&(
        <>
          <p className={`${s.section} mb-3`}>APPROVED — READY TO LOCK</p>
          <div className="space-y-3 mb-6">
            {approvedCases.map(c=>(
              <div key={c.id} className="bg-white border border-blue-200 rounded-2xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-xl font-black text-gray-900 uppercase">{(c.lastName||"").toUpperCase()}, {c.firstName}</div>
                    <div className="text-xs font-bold text-gray-400 uppercase mt-1">{c.caseRef} · {c.funeralHomeName}</div>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 border border-blue-300 rounded-full px-2 py-0.5 font-black uppercase flex-shrink-0">Approved</span>
                </div>
                <button onClick={()=>lockCase(c.id)}
                  className="w-full py-3 rounded-xl bg-gray-900 hover:bg-gray-700 text-white font-black text-sm uppercase tracking-wide transition">
                  🔒 LOCK CASE
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {lockedCases.length>0&&(
        <>
          <p className={`${s.section} mb-3`}>LOCKED CASES</p>
          <div className="space-y-3">
            {lockedCases.map(c=>(
              <div key={c.id} className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-xl font-black text-gray-900 uppercase">{(c.lastName||"").toUpperCase()}, {c.firstName}</div>
                    <div className="text-xs font-bold text-gray-400 uppercase mt-1">{c.caseRef} · {c.funeralHomeName}</div>
                  </div>
                  <span className="text-xs bg-gray-900 text-white rounded-full px-2 py-0.5 font-black uppercase flex-shrink-0">Locked</span>
                </div>
                <button onClick={()=>unlockCase(c.id)}
                  className="w-full py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-sm uppercase tracking-wide transition">
                  🔓 UNLOCK CASE
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── BOTTOM NAV (Admin/MSS only) ──────────────────────────────────────────────
function BottomNav({onAction,onNav,activeTab,action}){
  const items=[
    {id:"checkin",label:"CHECK IN",icon:"M12 5v14M5 12l7-7 7 7"},
    {id:"mortuary",label:"MORTUARY",icon:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"},
    {id:"checkout",label:"CHECK OUT",icon:"M12 19V5M5 12l7 7 7-7"},
    {id:"records",label:"RECORDS",icon:"M4 6h16M4 10h16M4 14h16M4 18h16"},
    {id:"calendar",label:"CALENDAR",icon:"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"},
    {id:"reports",label:"REPORTS",icon:"M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"},
    {id:"approvals",label:"APPROVALS",icon:"M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"},
  ];

  const isActive=(id)=>{
    if(["checkin","mortuary","checkout"].includes(id)) return action===id;
    return activeTab===id&&!["checkin","mortuary","checkout"].includes(action);
  };

  function handleTap(id){
    if(["checkin","mortuary","checkout"].includes(id)) onAction(id);
    else onNav(id);
  }

  return(
    <nav className="sticky bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-gray-200 shadow-lg mt-8">
      <div className="max-w-5xl mx-auto flex">
        {items.map(item=>(
          <button key={item.id} onClick={()=>handleTap(item.id)}
            className={`flex-1 flex flex-col items-center justify-center py-2 px-1 transition ${isActive(item.id)?"text-gray-900 bg-gray-50":"text-gray-400 hover:text-gray-700"}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive(item.id)?2.5:1.8} className="mb-0.5">
              <path d={item.icon} strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className={`text-xs font-black uppercase tracking-tight leading-none ${isActive(item.id)?"text-gray-900":"text-gray-400"}`}>{item.label}</span>
            {isActive(item.id)&&<div className="w-1 h-1 rounded-full bg-gray-900 mt-0.5"/>}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ─── HEADER ───────────────────────────────────────────────────────────────────
function Header({user,onSignOut,onNav,activeTab}) {
  const isAdmin=user?.role==="admin",isMSS=user?.role==="mss"||isAdmin;
  const isFD=user?.role==="fd",isTransfer=user?.role==="transfer";
  const tabs=isAdmin?[["home","HOME"],["records","RECORDS"],["reports","REPORTS"],["calendar","CALENDAR"],["pins","PINS"]]
    :isMSS?[["home","HOME"],["records","RECORDS"],["reports","REPORTS"],["calendar","CALENDAR"],["mypin","MY PIN"]]
    :isFD?[["home","Home"],["records","My Cases"],["calendar","Calendar"]]
    :isTransfer?[["home","Home"],["transfers","My Transfers"]]
    :[["home","Home"]];
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <MSSLogo size="sm"/>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500 hidden sm:block">{user?.name} · <span className="font-bold text-gray-800">{user?.roleLabel}</span></span>
          <button onClick={onSignOut} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:border-gray-800 text-xs font-semibold transition">Sign Out</button>
        </div>
      </div>
      {tabs.length>1&&(
        <div className="max-w-5xl mx-auto px-4 flex">
          {tabs.map(([id,label])=>(
            <button key={id} onClick={()=>onNav(id)}
              className={`px-5 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition ${activeTab===id?"border-gray-900 text-gray-900":"border-transparent text-gray-400 hover:text-gray-700"}`}>
              {label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}


// ─── DOCUMENT SECTION ─────────────────────────────────────────────────────────
const DOC_LABELS = ["MCCD","VOD","BO","LE","OTHER"];

function DocumentSection({caseId, funeralHomeName, lastName, dod}){
  const[docs,setDocs]=useState([]);
  const[loading,setLoading]=useState(true);
  const[uploading,setUploading]=useState(false);
  const[showUpload,setShowUpload]=useState(false);
  const[label,setLabel]=useState("MCCD");

  useEffect(()=>{loadDocs();},[caseId]);

  async function loadDocs(){
    setLoading(true);
    try{const list=await listDocuments(caseId);setDocs(list.filter(f=>f.name&&!f.name.endsWith("/")));}
    catch(e){console.error(e);}
    setLoading(false);
  }

  function buildFileName(file){
    const ext=file.name.split(".").pop();
    const fd=(funeralHomeName||"Unknown").replace(/[^a-zA-Z0-9]/g,"_");
    const ln=(lastName||"Unknown").replace(/[^a-zA-Z0-9]/g,"_");
    const dateStr=dod?dod.split("-").reverse().join(""):new Date().toLocaleDateString("en-AU").replace(/\//g,"");
    return `${label}_${fd}_${ln}_${dateStr}.${ext}`;
  }

  async function handleUpload(e){
    const file=e.target.files?.[0];
    if(!file) return;
    if(file.size>5*1024*1024){alert("File too large. Maximum size is 5MB.");e.target.value="";return;}
    setUploading(true);
    try{
      const fileName=buildFileName(file);
      // Create a renamed file object
      const renamedFile=new File([file],fileName,{type:file.type});
      await uploadDocument(caseId,renamedFile,label);
      await loadDocs();
      setShowUpload(false);
    }catch(err){alert("Upload failed: "+err.message);}
    setUploading(false);
    e.target.value="";
  }

  async function handleDelete(path){
    if(!window.confirm("Delete this document?")) return;
    await deleteDocument(path);
    await loadDocs();
  }

  function getDocLabel(name){
    // Show the full filename without timestamp prefix
    const parts=name.split("_");
    if(parts.length>=2){
      const labelPart=parts.slice(1).join("_").replace(/\.[^.]+$/,"").replace(/_/g," ");
      return labelPart;
    }
    return name;
  }

  function isImage(name){return /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(name);}

  // Preview the filename that will be used
  const previewName=`${label}_${(funeralHomeName||"FD").replace(/[^a-zA-Z0-9]/g,"_")}_${(lastName||"Lastname").replace(/[^a-zA-Z0-9]/g,"_")}_${dod?dod.split("-").reverse().join(""):""}.[ext]`;

  return(
    <div className={`${s.card} mt-4`}>
      <div className="flex items-center justify-between mb-3">
        <p className={s.section+" mb-0"}>DOCUMENTS</p>
        <button onClick={()=>setShowUpload(!showUpload)}
          className="px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-xs font-black uppercase tracking-wide transition">
          + ATTACH
        </button>
      </div>

      {showUpload&&(
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
          <div className={s.label}>DOCUMENT TYPE</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {DOC_LABELS.map(l=>(
              <button key={l} type="button" onClick={()=>setLabel(l)}
                className={s.tb(label===l)}>{l}</button>
            ))}
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 mb-3">
            <p className="text-xs font-black text-gray-400 uppercase mb-0.5">File will be saved as:</p>
            <p className="text-xs font-black text-gray-900 break-all">{previewName}.[ext]</p>
          </div>
          <div className={s.label}>SELECT FILE (PHOTO OR PDF)</div>
          <label className="block w-full py-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-600 text-center cursor-pointer transition bg-white">
            <div className="text-2xl mb-1">📎</div>
            <div className="text-sm font-black uppercase text-gray-600">{uploading?"UPLOADING…":"TAP TO CHOOSE FILE OR TAKE PHOTO"}</div>
            <input type="file" accept="image/*,application/pdf" capture="environment"
              className="hidden" onChange={handleUpload} disabled={uploading}/>
          </label>
        </div>
      )}

      {loading&&<p className="text-xs font-bold text-gray-400 uppercase text-center py-3">Loading…</p>}
      {!loading&&docs.length===0&&<p className="text-xs font-bold text-gray-400 uppercase text-center py-3">No documents attached</p>}

      <div className="space-y-2">
        {docs.map(doc=>{
          const path=`${caseId}/${doc.name}`;
          const url=getDocumentUrl(path);
          const docLabel=getDocLabel(doc.name);
          const img=isImage(doc.name);
          const uploadedAt=doc.created_at?new Date(doc.created_at).toLocaleDateString("en-AU"):"";
          return(
            <div key={doc.name} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
              <div className="text-2xl flex-shrink-0">{img?"🖼️":"📄"}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black uppercase text-gray-900 truncate">{docLabel}</div>
                {uploadedAt&&<div className="text-xs text-gray-400 font-bold uppercase">{uploadedAt}</div>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a href={url} target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-xs font-black uppercase transition">
                  VIEW
                </a>
                <a href={url} download={doc.name}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:border-gray-700 text-xs font-black uppercase transition">
                  ↓
                </a>
                <button onClick={()=>handleDelete(path)}
                  className="px-2 py-1.5 rounded-lg border border-red-200 text-red-400 hover:border-red-500 hover:text-red-600 text-xs font-black transition">
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CASE VIEW CARD ───────────────────────────────────────────────────────────
function CaseViewCard({c,isAdmin,onSave}) {
  const prep=c.prep||{};
  const prepShorts=(prep.prepOptions||[]).map(p=>PREP_OPTIONS.find(x=>x.label===p)?.short||p).join(", ")||"—";
  const age=calcAge(c.dob,c.dod);
  function save(field,val){onSave&&onSave({[field]:val});}
  function savePrep(field,val){onSave&&onSave({prep:{...prep,[field]:val}});}
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="text-2xl font-black text-gray-900 mb-1">
        {isAdmin?<><InlineEdit isAdmin value={c.lastName?.toUpperCase()} onSave={v=>save("last_name",v)}/>, <InlineEdit isAdmin value={c.firstName} onSave={v=>save("first_name",v)}/></>
          :<>{(c.lastName||"").toUpperCase()}, {c.firstName}</>}
        {" — "}<span className="text-lg font-bold text-gray-500">{sexShort(c.sex)}</span>
      </div>
      <div className="text-sm text-gray-600 mb-3">
        {isAdmin?<><InlineEdit isAdmin value={c.dob} onSave={v=>save("dob",v)} type="date" display={fmt(c.dob)}/> – <InlineEdit isAdmin value={c.dod} onSave={v=>save("dod",v)} type="date" display={fmt(c.dod)}/></>
          :<>{fmt(c.dob)} – {fmt(c.dod)}</>}
        {" "}&nbsp;|&nbsp; <span className="font-bold text-gray-900">Age: {age!==null?age:"—"}</span>
      </div>
      <Divider/>
      <div className="grid grid-cols-1 gap-1 text-sm">
        <div><span className="text-gray-500">Paperwork: </span><span className="font-bold text-gray-900">{c.paperwork||"None"}</span>&nbsp;|&nbsp;<span className="text-gray-500">Disposition: </span>{isAdmin?<InlineEdit isAdmin value={prep.disposition} onSave={v=>savePrep("disposition",v)} options={DISPOSITION_OPTIONS}/>:<span className="font-bold text-gray-900">{prep.disposition||"—"}</span>}</div>
        <div><span className="text-gray-500">Preparation: </span><span className="font-bold text-gray-900">{prepShorts}</span>&nbsp;|&nbsp;<span className="text-gray-500">Collection: </span>{isAdmin?<InlineEdit isAdmin value={prep.collectionDate} onSave={v=>savePrep("collectionDate",v)} type="date" display={fmt(prep.collectionDate)}/>:<span className="font-bold text-gray-900">{fmt(prep.collectionDate)||"—"}</span>}</div>
        <div><span className="text-gray-500">Funeral Director: </span>{isAdmin?<InlineEdit isAdmin value={c.funeralHomeName} onSave={v=>save("funeral_home_name",v)}/>:<span className="font-bold text-gray-900">{c.funeralHomeName||"—"}</span>}&nbsp;|&nbsp;<span className="text-gray-500">Person: </span>{isAdmin?<InlineEdit isAdmin value={c.transferPersonName} onSave={v=>save("transfer_person_name",v)}/>:<span className="font-bold text-gray-900">{c.transferPersonName||"—"}</span>}</div>
      </div>
    </div>
  );
}

// ─── DATE INPUT ───────────────────────────────────────────────────────────────
function DOBPicker({value,onChange,maxDate,minDate}) {
  return (
    <div>
      <input type="date" className={s.inp} value={value||""} min={minDate||""} max={maxDate||today()} onChange={e=>onChange(e.target.value)}/>
      {value&&<p className="text-sm text-gray-600 mt-1 font-medium">{fmt(value)}</p>}
    </div>
  );
}

// ─── TRANSFER FROM ────────────────────────────────────────────────────────────
function TransferFromPicker({value,subValue,onChangeType,onChangeSub}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {TRANSFER_FROM_OPTIONS.map(o=><button key={o} type="button" onClick={()=>onChangeType(o)} className={s.tb(value===o)}>{o}</button>)}
      </div>
      {(value==="Hospital"||value==="Nursing Home")&&<input className={s.inp} placeholder={`${value} name…`} value={subValue} onChange={e=>onChangeSub(e.target.value)}/>}
      {value==="Coroners"&&<select className={s.sel} value={subValue||"Sydney"} onChange={e=>onChangeSub(e.target.value)}>{CORONER_OPTIONS.map(o=><option key={o}>{o}</option>)}</select>}
      {value==="Other"&&<input className={s.inp} placeholder="Describe origin…" value={subValue} onChange={e=>onChangeSub(e.target.value)}/>}
    </div>
  );
}

// ─── TRANSFER BY PICKER ───────────────────────────────────────────────────────
function TransferByPicker({value,onChange}) {
  const [company,setCompany]=useState(()=>value?.includes(" > ")?value.split(" > ")[0]:TRANSFER_BY_COMPANIES_PRIMARY.includes(value)?value:value||"");
  const [manual,setManual]=useState(false);
  const [manualVal,setManualVal]=useState("");
  const presets=TRANSFER_BY_PRESETS[company]||[];
  const isStatewide=company==="Statewide";
  const isAllHoursOrMSS=(company==="All Hours"||company==="MSS"||company==="Statewide")&&company!=="ALL";
  const selectedName=value?.includes(" > ")?value.split(" > ")[1]:"";
  function selectCompany(c){setCompany(c);setManual(false);setManualVal("");if(c==="Statewide")onChange("");else if(c==="ALL")onChange("");else if(!TRANSFER_BY_PRESETS[c])onChange(c);else onChange("");}
  return (
    <div>
      <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">COMPANY</div>
      <div className="flex flex-wrap gap-2 mb-3">
        {TRANSFER_BY_COMPANIES_PRIMARY.map(c=><button key={c} type="button" onClick={()=>selectCompany(c)} className={s.tb(company===c)}>{c}</button>)}
      </div>
      {!isAllHoursOrMSS && <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">FUNERAL DIRECTORS</div>}
      {(!isAllHoursOrMSS||company==="ALL") && <div className="flex flex-wrap gap-2 mb-3">
        {sortAlpha(FUNERAL_HOMES,"name").map(f=><button key={f.id} type="button" onClick={()=>selectCompany(f.name)} className={`px-3 py-2 rounded-xl border-2 text-xs font-bold transition ${company===f.name?"bg-gray-900 text-white border-gray-900":"bg-white text-gray-600 border-gray-300 hover:border-gray-700"}`}>{f.name}</button>)}</div>}
      {company&&(
        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
          {isStatewide&&<input className={s.inp} placeholder="Type full name…" value={manualVal} onChange={e=>{setManualVal(e.target.value);onChange(`Statewide > ${e.target.value}`);}}/>}
          {presets.length>0&&!manual&&(
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Select Person</div>
              <div className="flex flex-wrap gap-2">
                {presets.map(n=><button key={n} type="button" onClick={()=>onChange(`${company} > ${n}`)} className={`py-3 px-5 rounded-xl border-2 text-base font-bold transition ${selectedName===n?"bg-gray-900 text-white border-gray-900":"bg-white text-gray-700 border-gray-200 hover:border-gray-700"}`}>{n}</button>)}
                <button type="button" onClick={()=>{setManual(true);onChange("");}} className="py-3 px-5 rounded-xl border-2 text-base font-bold text-gray-600 border-gray-200 hover:border-gray-700 bg-white transition">Other…</button>
              </div>
            </div>
          )}
          {presets.length>0&&manual&&(
            <div>
              <input className={s.inp} placeholder="Type full name…" value={manualVal} onChange={e=>{setManualVal(e.target.value);onChange(`${company} > ${e.target.value}`);}} autoFocus/>
              <button onClick={()=>{setManual(false);onChange("");}} className="text-xs text-gray-400 underline mt-1">← Back</button>
            </div>
          )}
          {!isStatewide&&presets.length===0&&company&&<div className="text-sm text-gray-600 font-medium">{company} selected ✓</div>}
        </div>
      )}
    </div>
  );
}

// ─── VALUABLES PICKER ─────────────────────────────────────────────────────────
function ValuablesPicker({nilVals,vals,valsText,otherItems,otherText,onSetNilVals,onSetVals,onSetValsText,onToggleOther,onSetOtherText,error}) {
  return (
    <div>
      {/* Section 1: NIL VALS or VALS — mutually exclusive */}
      <div className={s.label}>VALUABLES</div>
      <div className="flex gap-2 mb-3">
        <button type="button" onClick={()=>{onSetNilVals(true);onSetVals(false);onSetValsText("");}}
          className={`flex-1 py-3 rounded-xl border-2 font-black text-sm uppercase transition ${nilVals?"bg-gray-900 text-white border-gray-900":"border-gray-300 text-gray-600 hover:border-gray-700"}`}>
          NIL VALS
        </button>
        <button type="button" onClick={()=>{onSetVals(true);onSetNilVals(false);}}
          className={`flex-1 py-3 rounded-xl border-2 font-black text-sm uppercase transition ${vals?"bg-gray-900 text-white border-gray-900":"border-gray-300 text-gray-600 hover:border-gray-700"}`}>
          VALS
        </button>
      </div>
      {vals&&(
        <input className={`${s.inp} mb-3`} placeholder="Describe valuables (e.g. gold ring x1, silver necklace)…"
          value={valsText} onChange={e=>onSetValsText(e.target.value)}/>
      )}

      {/* Section 2: Other Items */}
      <div className={s.label}>OTHER ITEMS</div>
      <div className="flex flex-wrap gap-2 mb-2">
        {["ROSARY","CLOTHES FOR DRESSING","DENTURES"].map(o=>(
          <button key={o} type="button" onClick={()=>onToggleOther(o)}
            className={s.tb(otherItems.includes(o))}>{o}</button>
        ))}
        <button type="button" onClick={()=>onToggleOther("OTHER")}
          className={s.tb(otherItems.includes("OTHER"))}>OTHER</button>
      </div>
      {otherItems.includes("OTHER")&&(
        <input className={s.inp} placeholder="Describe other items…"
          value={otherText} onChange={e=>onSetOtherText(e.target.value)}/>
      )}
      {error&&<p className="text-red-500 text-xs mt-1 font-bold">{error}</p>}
    </div>
  );
}

// ─── TRANSFER PERSON PICKER ───────────────────────────────────────────────────
function TransferPersonPicker({user,value,onChange}) {
  const [manual,setManual]=useState(false);
  const presets=user?.presetNames||[];
  useEffect(()=>{if(presets.length===0)setManual(true);},[]);
  if(presets.length===0||manual) return (
    <div>
      <input className={s.inp} placeholder="Enter full name…" value={value} onChange={e=>onChange(e.target.value)}/>
      {presets.length>0&&<button onClick={()=>{setManual(false);onChange("");}} className="text-xs text-gray-400 underline mt-1">← Back to preset names</button>}
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-2">
      {presets.map(n=><button key={n} type="button" onClick={()=>onChange(n)} className={`py-4 rounded-xl border-2 font-bold text-base transition ${value===n?"bg-gray-900 text-white border-gray-900":"bg-white text-gray-800 border-gray-200 hover:border-gray-700"}`}>{n}</button>)}
      <button type="button" onClick={()=>{setManual(true);onChange("");}} className="py-4 rounded-xl border-2 font-bold text-base text-gray-600 border-gray-200 hover:border-gray-700 bg-white transition">Other…</button>
    </div>
  );
}

// ─── VIEWING SECTION ──────────────────────────────────────────────────────────
function ViewingSection({prep,updPrepMulti,bookedSlots}) {
  const viewing=prep.viewing||"",vLoc=prep.viewingLocation||"",vHost=prep.viewingHost||"",vDate=prep.viewingDate||"",vSlot=prep.viewingSlot||"";
  const futureDates=next4WeekDates();
  return (
    <div>
      <div className={s.label}>Viewing</div>
      <div className="flex gap-2 mb-4">
        <button type="button" onClick={()=>updPrepMulti({viewing:"Yes",viewingLocation:"",viewingHost:"",viewingDate:"",viewingSlot:""})} className={s.tbGreen(viewing==="Yes")}>Yes</button>
        <button type="button" onClick={()=>updPrepMulti({viewing:"No",viewingLocation:"",viewingHost:"",viewingDate:"",viewingSlot:""})} className={s.tbRed(viewing==="No")}>No</button>
        <button type="button" onClick={()=>updPrepMulti({viewing:"TBA",viewingLocation:"",viewingHost:"",viewingDate:"",viewingSlot:""})} className={s.tbYellow(viewing==="TBA")}>TBA</button>
      </div>
      {viewing==="Yes"&&(
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className={s.label}>Location</div>
          <div className="flex gap-2 mb-4">
            {["MSS","Offsite","Time of Service"].map(o=><button key={o} type="button" onClick={()=>updPrepMulti({viewingLocation:o,viewingHost:"",viewingDate:"",viewingSlot:""})} className={s.tbGreen(vLoc===o)}>{o}</button>)}
          </div>
          {vLoc==="MSS"&&(
            <div>
              <div className={s.label}>Hosted By</div>
              <div className="flex gap-2 mb-4">
                {["MSS","Funeral Director","TBA"].map(o=><button key={o} type="button" onClick={()=>updPrepMulti({viewingHost:o,viewingDate:"",viewingSlot:""})} className={s.tbGreen(vHost===o)}>{o}</button>)}
              </div>
              {vHost&&(
                <div>
                  <div className={s.label}>Viewing Date (next 4 weeks)</div>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {futureDates.map(d=>{
                      const dd=new Date(d);
                      return <button key={d} type="button" onClick={()=>updPrepMulti({viewingDate:d,viewingSlot:""})} className={`py-2 px-1 rounded-xl border-2 text-xs font-bold transition text-center ${vDate===d?"bg-green-600 text-white border-green-600":"bg-white text-gray-700 border-gray-200 hover:border-green-500"}`}><div>{dd.toLocaleDateString("en-AU",{weekday:"short"})}</div><div>{dd.toLocaleDateString("en-AU",{day:"numeric",month:"short"})}</div></button>;
                    })}
                  </div>
                  {vDate&&(
                    <div>
                      <div className={s.label}>Time Slot — {fmt(vDate)}</div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {VIEWING_SLOTS.map(sl=>{const key=`${vDate}_${sl}`;const booked=bookedSlots.has(key);const selected=vSlot===key;return <button key={sl} type="button" disabled={booked&&!selected} onClick={()=>updPrepMulti({viewingSlot:selected?"":key})} className={`py-2 rounded-xl border-2 text-sm font-bold transition ${selected?"bg-green-600 text-white border-green-600":booked?"bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed":"bg-white text-gray-700 border-gray-200 hover:border-green-500"}`}>{sl}</button>;})}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {vLoc==="Offsite"&&<p className="text-sm text-green-700 font-semibold">Offsite — no further details required.</p>}
              {vLoc==="Time of Service"&&<p className="text-sm text-green-700 font-semibold">Viewing at time of service.</p>}
            </div>
          )}
        </div>
      )}
      {viewing==="No"&&<div className="bg-red-50 border border-red-200 rounded-xl p-4"><p className="text-red-700 font-semibold text-sm">No viewing scheduled.</p></div>}
      {viewing==="TBA"&&<div className="bg-amber-50 border border-amber-200 rounded-xl p-4"><p className="text-amber-700 font-semibold text-sm">Viewing to be advised.</p></div>}
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({onLogin,users}) {
  const [pin,setPin]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);

  function attempt() {
    if(pin.length<4) return;
    setLoading(true); setError("");
    setTimeout(()=>{
      const u=users.find(x=>x.pin===pin);
      if(u){
        const roleLabel=u.role==="admin"?"Admin":u.role==="mss"?"MSS Staff":u.role==="transfer"?"Transfer Team":"Funeral Director";
        onLogin({...u,roleLabel,funeralHomeId:u.funeral_home_id,presetNames:u.preset_names||[]});
        return;
      }
      setError("Invalid PIN. Please try again.");
      setLoading(false); setPin("");
    },300);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start pt-8 px-4 pb-8">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-4"><MSSLogo size="md"/></div>
        <p className="text-center text-gray-500 text-sm mb-5">Baulkham Hills</p>
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          <p className={s.label}>Enter Your PIN</p>
          <input type="password" maxLength={6} className={`${s.inp} text-center text-4xl tracking-[0.8em] py-6 mb-4`}
            placeholder="••••" value={pin} autoFocus
            onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,6))}
            onKeyDown={e=>e.key==="Enter"&&attempt()}/>
          {error&&<p className="text-red-500 text-sm text-center mb-3 font-semibold">{error}</p>}
          <button onClick={attempt} disabled={pin.length<4||loading}
            className={`${s.btnDark} w-full text-xl py-5 disabled:opacity-40 disabled:cursor-not-allowed`}>
            {loading?"Verifying…":"Enter"}
          </button>
        </div>
        <p className="text-center text-gray-400 text-xs mt-5">Contact your administrator if you have lost your PIN</p>
      </div>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function HomeScreen({user,onAction}) {
  const isAdmin=user?.role==="admin";
  const isMSS=user?.role==="mss"||isAdmin;
  const isTransfer=user?.role==="transfer";
  const isFD=user?.role==="fd";
  useEffect(()=>window.scrollTo({top:0,behavior:"smooth"}),[]);
  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <p className="text-gray-600 text-sm">Welcome, <span className="font-bold text-gray-900">{user?.name}</span></p>
        <p className="text-gray-400 text-xs mt-1">{user?.roleLabel} · Baulkham Hills</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={()=>onAction("checkin")} className={s.btnLg}>CHECK IN</button>
        {isMSS?<button onClick={()=>onAction("mortuary")} className={s.btnLg}>MORTUARY</button>:<div/>}
        <button onClick={()=>onAction("checkout")} className={s.btnLg}>CHECK OUT</button>
        {(isMSS||isFD)?<button onClick={()=>onAction("mycases")} className={s.btnLg}>MY CASES</button>:<div/>}
        {isMSS&&<button onClick={()=>onAction("reports")} className={s.btnLg}>REPORTS</button>}
        {(isMSS||isFD)&&<button onClick={()=>onAction("calendar")} className={s.btnLg}>CALENDAR</button>}
        {isMSS&&<button onClick={()=>onAction("approvals")} className={s.btnLg}>APPROVALS</button>}
        {isAdmin&&<button onClick={()=>onAction("lockview")} className={s.btnLg}>LOCK CASES</button>}
        {isTransfer&&<button onClick={()=>onAction("transfers")} className={s.btnLg}>MY TRANSFERS</button>}
      </div>
    </div>
  );
}

// ─── EMAIL BUILDERS ───────────────────────────────────────────────────────────
const MSS_FOOTER = `

Any questions please don't hesitate to contact us.

The Team at MSS Mortuary Support Services
Phone: 02 8814 5500
Email: info@mortuarysupport.com.au`;

function buildCheckInEmail(r) {
  const needsMccd = r.paperwork && (r.paperwork.includes("VOD") || r.paperwork.includes("LE"));
  const mccdWarning = needsMccd ? `\n⚠️ IMPORTANT: Please obtain the MCCD from the doctor and email it through to us — we cannot prepare the deceased until we receive it.` : "";
  return `Hi ${r.funeralHomeName} Team,\n\nThis is to notify you that ${r.firstName} ${r.lastName} has been checked into MSS Mortuary Support Services.\n\n─────────────────────────────\nDECEASED DETAILS\n─────────────────────────────\nName: ${r.firstName} ${r.lastName}\nDOB: ${fmt(r.dob)} | DOD: ${fmt(r.dod)} | Age: ${r.ageAtDeath ?? "—"} | Sex: ${r.sex || "—"}\nCase Reference: ${r.caseRef}\n\n─────────────────────────────\nTRANSFER DETAILS\n─────────────────────────────\nTransferred From: ${r.transferredFrom || "—"}\nTransferred By: ${r.transferredBy || "—"}\nTransfer Date: ${fmt(r.transferDate)}\n\n─────────────────────────────\nON ARRIVAL\n─────────────────────────────\nPaperwork Received: ${r.paperwork || "None"}\nValuables: ${r.valuables || "Nil"}\nSize: ${r.size || "—"} | Fridge: ${r.fridge || "—"} | Weight: ${r.weight || "—"}\n${mccdWarning}\nPlease also send through the 2nd note with preparation instructions when you can.\n\nTheir current status is: NOT STARTED\nYou will receive an email notification once they are ready for collection.${MSS_FOOTER}`;
}

function buildCompletedEmail(c, prep, billable, otherUsed) {
  const prepList = (prep.prepOptions || []).map(p => PREP_OPTIONS.find(x => x.label === p)?.short || p).join(", ") || "—";
  const billableList = Object.keys(billable || {}).filter(k => billable[k]).join(", ") || "None";
  const otherList = Object.keys(otherUsed || {}).filter(k => otherUsed[k]).join(", ") || "None";
  const viewingDetail = prep.viewing === "Yes"
    ? `Yes${prep.viewingLocation ? " — " + prep.viewingLocation : ""}${prep.viewingHost ? " (Hosted by " + prep.viewingHost + ")" : ""}${prep.viewingSlot ? " @ " + prep.viewingSlot.split("_")[1] : ""}`
    : prep.viewing || "—";
  return `Hi ${c.funeralHomeName} Team,\n\n${c.firstName} ${c.lastName} is now ready for collection from MSS Mortuary Support Services.\n\n─────────────────────────────\nDECEASED DETAILS\n─────────────────────────────\nName: ${c.firstName} ${c.lastName}\nDOB: ${fmt(c.dob)} | DOD: ${fmt(c.dod)} | Age: ${c.ageAtDeath ?? "—"} | Sex: ${c.sex || "—"}\nCase Reference: ${c.caseRef}\n\n─────────────────────────────\nPREPARATION SUMMARY\n─────────────────────────────\nPreparation: ${prepList}\nDisposition: ${prep.disposition || "—"}\nViewing: ${viewingDetail}\nCollection Date: ${fmt(prep.collectionDate) || "—"}\nFuneral Date: ${fmt(prep.funeralDate) || "—"}\nComments: ${prep.comments || "None"}\n\n─────────────────────────────\nPAPERWORK & VALUABLES\n─────────────────────────────\nPaperwork: ${c.paperwork || "None"}\nValuables: ${c.valuables || "Nil"}\n\n─────────────────────────────\nITEMS USED\n─────────────────────────────\n${otherList}\n\n─────────────────────────────\nBILLABLE ITEMS\n─────────────────────────────\n${billableList}\n\nPlease contact us to arrange collection.${MSS_FOOTER}`;
}

function buildCheckOutEmail(c, coData) {
  return `Hi ${c.funeralHomeName} Team,\n\n${c.firstName} ${c.lastName} has just departed MSS Mortuary Support Services and is on their way.\n\n─────────────────────────────\nDEPARTURE DETAILS\n─────────────────────────────\nName: ${c.firstName} ${c.lastName}\nCase Reference: ${c.caseRef}\nDeparted: ${fmtDT(coData?.checkedOutAt || new Date().toISOString())}\nDisposition: ${coData?.disposition || "—"}\nDestination: ${coData?.destination || "—"}\nSigned By: ${coData?.signedName || "—"}\n\nThank you for entrusting MSS with the care of ${c.firstName} ${c.lastName}.${MSS_FOOTER}`;
}


function buildApproveEmail(c, prep, billable, otherUsed) {
  const prepList = (prep.prepOptions || []).map(p => PREP_OPTIONS.find(x => x.label === p)?.short || p).join(", ") || "—";
  const billableList = Object.keys(billable || {}).filter(k => billable[k]).join("\n  - ") || "None";
  const otherList = Object.keys(otherUsed || {}).filter(k => otherUsed[k]).join(", ") || "None";
  return `Hi Accounts Team,

The following case has been approved and is ready for invoicing.

─────────────────────────────
JOB CARD
─────────────────────────────
Case Reference: ${c.caseRef}
Funeral Director: ${c.funeralHomeName || "—"}

DECEASED: ${c.firstName} ${c.lastName}
DOB: ${fmt(c.dob)} | DOD: ${fmt(c.dod)} | Age: ${c.ageAtDeath ?? "—"} | Sex: ${c.sex || "—"}

─────────────────────────────
CHECK IN DETAILS
─────────────────────────────
Checked In: ${fmtDT(c.checkedInAt)} by ${c.checkedInBy || "—"}
Transferred From: ${c.transferredFrom || "—"}
Transferred By: ${c.transferredBy || "—"}
Paperwork: ${c.paperwork || "None"}
Valuables: ${c.valuables || "Nil"}
Size: ${c.size || "—"} | Fridge: ${c.fridge || "—"} | Weight: ${c.weight || "—"}

─────────────────────────────
PREPARATION
─────────────────────────────
Preparation: ${prepList}
Disposition: ${prep.disposition || "—"}
Viewing: ${prep.viewing || "—"}${prep.viewingLocation ? " — " + prep.viewingLocation : ""}
Collection Date: ${fmt(prep.collectionDate) || "—"}
Funeral Date: ${fmt(prep.funeralDate) || "—"}
Comments: ${prep.comments || "None"}

─────────────────────────────
ITEMS USED
─────────────────────────────
${otherList}

─────────────────────────────
BILLABLE ITEMS
─────────────────────────────
  - ${billableList}

─────────────────────────────
CHECK OUT DETAILS
─────────────────────────────
Checked Out: ${fmtDT(c.checkout?.checkedOutAt)} by ${c.checkout?.signedName || "—"}
Destination: ${c.checkout?.destination || "—"}
${MSS_FOOTER}`;
}

// ─── CHECK IN ─────────────────────────────────────────────────────────────────
function CheckInFlow({user,cases,onComplete,onBack}) {
  const [step,setStep]=useState(1);
  const [checkinRole,setCheckinRole]=useState(user?.role==="fd"?"FUNERAL DIRECTOR":user?.role==="transfer"?"TRANSFER TEAM":"");
  const [selFH,setSelFH]=useState(user?.role==="fd"?user.funeralHomeId:null);
  const [otherFHName,setOtherFHName]=useState("");
  const [errors,setErrors]=useState({});
  const [submitted,setSubmitted]=useState(null);
  const [saving,setSaving]=useState(false);
  useEffect(()=>{if(submitted)window.scrollTo({top:0,behavior:"smooth"});},[submitted]);
  const [form,setForm]=useState({firstName:"",lastName:"",dob:"",dod:"",sex:"",transferFrom:"",transferFromSub:"",transferredBy:"",transferDate:today(),paperwork:[],nilVals:false,vals:false,valsText:"",otherItems:[],otherText:"",size:"",fridge:"",weight:""});
  const isFD=user?.role==="fd",isTransfer=user?.role==="transfer";
  const sortedFH=sortAlpha(FUNERAL_HOMES,"name");
  const isAllHoursOrMSS=!form.transferredBy||(form.transferredBy?.startsWith("All Hours")||form.transferredBy?.startsWith("MSS")||form.transferredBy?.startsWith("Statewide")||form.transferredBy==="ALL");
  useEffect(()=>window.scrollTo({top:0,behavior:"smooth"}),[step]);

  function setF(k,v){setForm(f=>({...f,[k]:v}));setErrors(e=>({...e,[k]:""}))}
  function togglePW(p){setF("paperwork",form.paperwork.includes(p)?form.paperwork.filter(x=>x!==p):[...form.paperwork,p]);}
  function toggleOther(o){setF("otherItems",form.otherItems.includes(o)?form.otherItems.filter(x=>x!==o):[...form.otherItems,o]);}

  function getTransferDisplay(){
    if(!form.transferFrom) return "—";
    if(["Home","Repatriation"].includes(form.transferFrom)) return form.transferFrom;
    if(form.transferFrom==="Coroners") return `Coroners - ${form.transferFromSub||"Sydney"}`;
    return form.transferFromSub?`${form.transferFrom} - ${form.transferFromSub}`:form.transferFrom;
  }
  function getValuablesDisplay(){
    const parts=[];
    if(form.nilVals) parts.push("Nil");
    else if(form.vals) parts.push(form.valsText?`Valuables: ${form.valsText}`:"Valuables");
    if(form.otherItems.includes("ROSARY")) parts.push("Rosary");
    if(form.otherItems.includes("CLOTHES FOR DRESSING")) parts.push("Clothes for Dressing");
    if(form.otherItems.includes("DENTURES")) parts.push("Dentures");
    if(form.otherItems.includes("OTHER")&&form.otherText) parts.push(`Other: ${form.otherText}`);
    return parts.join(", ")||"Nil";
  }
  function getTransferByOptions(){
    if(isFD){const base=["All Hours","Statewide","MSS"];const fhName=FUNERAL_HOMES.find(f=>f.id===user.funeralHomeId)?.name||"";return fhName?[...base,fhName]:base;}
    return null;
  }

  function validate(){
    const e={};
    if(!form.firstName.trim()) e.firstName="Required";
    if(!form.lastName.trim()) e.lastName="Required";
    if(!form.dob) e.dob="Required";
    if(!form.dod) e.dod="Required";
    if(!form.sex) e.sex="Required";
    if(!form.transferFrom) e.transferFrom="Required";
    if(!form.transferDate) e.transferDate="Required";
    if(!form.nilVals&&!form.vals) e.valuables="Please select NIL VALS or VALS";
    if(form.vals&&!form.valsText.trim()) e.valuables="Please describe the valuables";
    if(!isFD&&selFH==="OTHER"&&otherFHName.trim().length<4) e.otherFHName="Min 4 characters";
    return e;
  }

  async function submit(){
    const e=validate();
    if(Object.keys(e).length){setErrors(e);return;}
    setSaving(true);
    const caseRef=genCaseRef(cases);
    const fhId=isFD?user.funeralHomeId:selFH;
    const fhName=fhId==="OTHER"?otherFHName:FUNERAL_HOMES.find(f=>f.id===fhId)?.name||"";
    const age=calcAge(form.dob,form.dod);
    const record={
      id:genId(),caseRef,firstName:form.firstName,lastName:form.lastName,
      dob:form.dob,dod:form.dod,sex:form.sex,ageAtDeath:age,
      transferredFrom:getTransferDisplay(),transferredBy:isTransfer?user.name:form.transferredBy,
      transferPersonName:"",transferDate:form.transferDate,
      valuables:getValuablesDisplay(),paperwork:form.paperwork.join(", "),size:form.size,fridge:form.fridge,weight:form.weight,
      funeralHomeId:fhId,funeralHomeName:fhName,
      checkedInBy:user.name,checkedInRole:checkinRole,
      checkedInAt:new Date().toISOString(),
      status:"active",prepStatus:"not-started",step:1,checkedOut:false,
      prep:{},billable:{},otherUsed:{},statusItems:{},
    };
    try {
      await insertCase(caseToDb(record));
      setSubmitted(record);
      onComplete(record);
    } catch(err) {
      alert("Error saving case: "+err.message);
    }
    setSaving(false);
  }

  const age=calcAge(form.dob,form.dod);

  if(submitted){
    const fhContacts=submitted.funeralHomeId==="OTHER"?[]:getFHContacts(submitted.funeralHomeId);
    const to=[MORTUARY_EMAIL,...fhContacts].join(",");
    const subj=encodeURIComponent(`T/L ${submitted.firstName} ${submitted.lastName} has been checked into MSS`);
    const body=encodeURIComponent(buildCheckInEmail(submitted));
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="bg-green-50 border border-green-300 rounded-2xl p-8 mb-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 border border-green-400 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-1">Checked In ✓</h2>
          <p className="text-4xl font-black text-gray-900 mt-3 mb-1 tracking-widest">{submitted.caseRef}</p>
          <p className="text-green-700 font-semibold">{submitted.firstName} {submitted.lastName}</p>
          <p className="text-gray-400 text-xs mt-2">{fmtDT(submitted.checkedInAt)}</p>
        </div>
        <DocumentSection caseId={submitted.id} funeralHomeName={submitted.funeralHomeName} lastName={submitted.lastName} dod={submitted.dod}/>
        {/* EMAIL DISABLED — <a href={`mailto:${to}?subject=${subj}&body=${body}`} className={`${s.btnDark} block text-center w-full mb-3 mt-4`}>📧 Send Notification</a> */}
        <p className="text-xs text-gray-400 text-center mb-5">To: {to}</p>
        <button onClick={()=>{onBack();window.scrollTo({top:0,behavior:"smooth"});}} className={`${s.btnGhost} w-full`}>← BACK TO HOME</button>
      </div>
    );
  }

  const effectiveStep=isFD?3:isTransfer?(step<2?2:step):step;

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <BackBtn onClick={onBack} label="Back to Home"/>
      <h2 className="text-2xl font-black text-gray-900 mb-6">Check In</h2>

      {!isFD&&!isTransfer&&step===1&&(
        <div>
          <p className={s.section}>Who is checking in?</p>
          <div className="grid grid-cols-1 gap-3">
            {[["MSS","MSS Staff"],["TRANSFER TEAM","Transfer Team"],["FUNERAL DIRECTOR","Funeral Director"]].map(([v,l])=>(
              <button key={v} onClick={()=>{setCheckinRole(v);setStep(2);}} className={s.btnLgGhost}>{l}</button>
            ))}
          </div>
        </div>
      )}

      {!isFD&&effectiveStep===2&&(
        <div>
          {!isTransfer&&<BackBtn onClick={()=>setStep(1)}/>}
          <p className={s.section}>Select Funeral Director</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {sortedFH.map(fh=>(
              <button key={fh.id} onClick={()=>{setSelFH(fh.id);setStep(3);}}
                className={`py-4 px-3 rounded-xl border-2 text-sm font-bold text-left transition ${selFH===fh.id?"border-gray-900 bg-gray-50":"border-gray-200 hover:border-gray-700"}`}>{fh.name}</button>
            ))}
            {!isTransfer&&<button onClick={()=>setSelFH("OTHER")} className={`py-4 px-3 rounded-xl border-2 text-sm font-bold text-left transition ${selFH==="OTHER"?"border-gray-900 bg-gray-50":"border-gray-200 hover:border-gray-700"}`}>OTHER</button>}
          </div>
          {selFH==="OTHER"&&(
            <Field label="Funeral Home Name" required>
              <input className={s.inp} value={otherFHName} onChange={e=>setOtherFHName(e.target.value)} placeholder="Enter name (min 4 characters)…"/>
              {errors.otherFHName&&<p className="text-red-500 text-xs mt-1">{errors.otherFHName}</p>}
              <button onClick={()=>{if(otherFHName.trim().length>=4)setStep(3);else setErrors(e=>({...e,otherFHName:"Min 4 characters"}));}} className={`${s.btnDark} w-full mt-2`}>Continue →</button>
            </Field>
          )}
        </div>
      )}

      {(isFD||(effectiveStep===3))&&(
        <div>
          {!isFD&&<BackBtn onClick={()=>setStep(2)}/>}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5 flex items-center gap-3">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Funeral Director:</span>
            <span className="text-base font-bold text-gray-900">{isFD?user.name:selFH==="OTHER"?otherFHName:FUNERAL_HOMES.find(f=>f.id===selFH)?.name}</span>
          </div>

          <div className={s.card}>
            <p className={s.section}>Deceased Details</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name" required><input className={s.inp} value={form.firstName} onChange={e=>setF("firstName",e.target.value)} placeholder="First name"/>{errors.firstName&&<p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}</Field>
              <Field label="Last Name" required><input className={s.inp} value={form.lastName} onChange={e=>setF("lastName",e.target.value)} placeholder="Last name"/>{errors.lastName&&<p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}</Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date of Birth" required><DOBPicker value={form.dob} onChange={v=>setF("dob",v)} maxDate={today()} minDate={minDOB()}/>{errors.dob&&<p className="text-red-500 text-xs mt-1">{errors.dob}</p>}</Field>
              <Field label="Date of Death" required><DOBPicker value={form.dod} onChange={v=>setF("dod",v)} maxDate={today()}/>{errors.dod&&<p className="text-red-500 text-xs mt-1">{errors.dod}</p>}</Field>
            </div>
            {form.dob&&form.dod&&age!==null&&<div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 mb-3 text-sm"><span className="text-blue-600 font-bold">Age at Death: {age} years</span></div>}
            <Field label="Sex" required>
              <div className="flex gap-6 mt-1">
                {["Male","Female","Other"].map(sx=>(
                  <label key={sx} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="sex" checked={form.sex===sx} onChange={()=>setF("sex",sx)} className="w-5 h-5 accent-gray-900"/>
                    <span className="text-base font-medium text-gray-800">{sx}</span>
                  </label>
                ))}
              </div>
              {errors.sex&&<p className="text-red-500 text-xs mt-1">{errors.sex}</p>}
            </Field>
          </div>

          <div className={s.card}>
            <p className={s.section}>Transfer Details</p>
            <Field label="Transferred From" required>
              <TransferFromPicker value={form.transferFrom} subValue={form.transferFromSub} onChangeType={v=>{setF("transferFrom",v);setF("transferFromSub",v==="Coroners"?"Sydney":"");}} onChangeSub={v=>setF("transferFromSub",v)}/>
              {errors.transferFrom&&<p className="text-red-500 text-xs mt-1">{errors.transferFrom}</p>}
            </Field>
            {!isTransfer&&(
              <Field label="Transferred By" required>
                <TransferByPicker value={form.transferredBy} onChange={v=>setF("transferredBy",v)}/>
                {errors.transferredBy&&<p className="text-red-500 text-xs mt-1">{errors.transferredBy}</p>}
              </Field>
            )}
            <Field label="Transfer Date" required><input type="date" className={s.inp} value={form.transferDate} onChange={e=>setF("transferDate",e.target.value)} max={today()}/></Field>
            <Field label="Valuables / Items" required>
              <ValuablesPicker
                nilVals={form.nilVals} vals={form.vals} valsText={form.valsText}
                otherItems={form.otherItems} otherText={form.otherText}
                onSetNilVals={v=>setF("nilVals",v)}
                onSetVals={v=>setF("vals",v)}
                onSetValsText={v=>setF("valsText",v)}
                onToggleOther={toggleOther}
                onSetOtherText={v=>setF("otherText",v)}
                error={errors.valuables}/>
            </Field>
          </div>

          <div className={s.card}>
            <p className={s.section}>Paperwork Received</p>
            <div className="flex flex-wrap gap-3">
              {PAPERWORK_OPTIONS.map(p=><button key={p} type="button" onClick={()=>togglePW(p)} className={`px-5 py-3 rounded-xl border-2 text-base font-bold transition ${form.paperwork.includes(p)?"bg-gray-900 text-white border-gray-900":"bg-white text-gray-500 border-gray-300 hover:border-gray-700"}`}>{p}</button>)}
            </div>
          </div>

          <div className={s.card}>
            <p className={s.section}>PHYSICAL DETAILS</p>
            <Field label="SIZE">
              <div className="flex gap-2">
                {["STD","OS1","OS2","OS3"].map(o=>(
                  <button key={o} type="button" onClick={()=>setF("size",form.size===o?"":o)}
                    className={`flex-1 py-3 rounded-xl border-2 font-black text-sm uppercase transition ${form.size===o?"bg-gray-900 text-white border-gray-900":"border-gray-300 text-gray-600 hover:border-gray-700"}`}>
                    {o}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="FRIDGE">
              <div className="flex gap-2">
                {["OLD","NEW"].map(o=>(
                  <button key={o} type="button" onClick={()=>setF("fridge",form.fridge===o?"":o)}
                    className={`flex-1 py-3 rounded-xl border-2 font-black text-sm uppercase transition ${form.fridge===o?"bg-gray-900 text-white border-gray-900":"border-gray-300 text-gray-600 hover:border-gray-700"}`}>
                    {o}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="WEIGHT (IF KNOWN)">
              <input className={s.inp} placeholder="e.g. 85kg" value={form.weight} onChange={e=>setF("weight",e.target.value)}/>
            </Field>
          </div>

          <button onClick={submit} disabled={saving} className={`${s.btnDark} w-full text-lg py-4 disabled:opacity-40`}>{saving?"Saving…":"Submit Check-In →"}</button>
        </div>
      )}
    </div>
  );
}


// ─── PACEMAKER REMOVAL CERTIFICATE ───────────────────────────────────────────
function PacemakerCertificate({caseData, onClose, onSaved}){
  const[embName,setEmbName]=useState("");
  const[embSignature,setEmbSignature]=useState(null);
  const[certDate,setCertDate]=useState(today());
  const[saving,setSaving]=useState(false);
  const certRef=useRef(null);

  const fhContacts=caseData.funeralHomeId==="OTHER"?[]:getFHContacts(caseData.funeralHomeId);

  function generatePDF(){
    const el=certRef.current;
    if(!el) return;
    // Use print dialog to save as PDF
    const printWindow=window.open("","_blank");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Pacemaker Removal Certificate — ${caseData.firstName} ${caseData.lastName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
          .header { border-bottom: 3px solid #111; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
          .logo { font-family: Georgia, serif; font-size: 32px; font-weight: 900; border: 2px solid #111; padding: 8px 16px; }
          .company { font-family: Georgia, serif; font-size: 14px; letter-spacing: 4px; text-transform: uppercase; color: #444; }
          .subcompany { font-size: 10px; letter-spacing: 6px; color: #999; margin-top: 3px; }
          .title { text-align: center; font-size: 22px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 30px; border: 2px solid #111; padding: 12px; }
          .field { margin-bottom: 20px; }
          .field-label { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #666; margin-bottom: 4px; }
          .field-value { font-size: 16px; font-weight: 700; border-bottom: 1px solid #999; padding-bottom: 4px; min-height: 28px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
          .statement { background: #f5f5f5; border: 1px solid #ccc; padding: 16px; margin: 20px 0; font-size: 13px; line-height: 1.6; }
          .sig-area { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
          .sig-box { border-top: 2px solid #111; padding-top: 8px; }
          .sig-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #666; }
          .sig-img { max-height: 80px; margin-bottom: 8px; }
          .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 12px; font-size: 10px; color: #999; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo">MSS</div>
          </div>
          <div style="text-align:right">
            <div class="company">MORTUARY</div>
            <div class="subcompany">SUPPORT SERVICES</div>
            <div style="font-size:11px;color:#666;margin-top:6px;">Baulkham Hills, Sydney NSW</div>
            <div style="font-size:11px;color:#666;">Ph: 02 8814 5500 | info@mortuarysupport.com.au</div>
          </div>
        </div>

        <div class="title">PACEMAKER REMOVAL CERTIFICATE</div>

        <div class="grid">
          <div class="field">
            <div class="field-label">Deceased Full Name</div>
            <div class="field-value">${caseData.firstName} ${caseData.lastName}</div>
          </div>
          <div class="field">
            <div class="field-label">Case Reference</div>
            <div class="field-value">${caseData.caseRef}</div>
          </div>
          <div class="field">
            <div class="field-label">Date of Birth</div>
            <div class="field-value">${fmt(caseData.dob)}</div>
          </div>
          <div class="field">
            <div class="field-label">Date of Death</div>
            <div class="field-value">${fmt(caseData.dod)}</div>
          </div>
          <div class="field">
            <div class="field-label">Funeral Director</div>
            <div class="field-value">${caseData.funeralHomeName||"—"}</div>
          </div>
          <div class="field">
            <div class="field-label">Date of Removal</div>
            <div class="field-value">${fmt(certDate)}</div>
          </div>
        </div>

        <div class="statement">
          <strong>DECLARATION:</strong><br/><br/>
          I hereby certify that I have examined the above-named deceased and have successfully removed the pacemaker/implantable cardiac device prior to cremation/preparation. The device has been safely disposed of in accordance with relevant regulations and guidelines.<br/><br/>
          This removal was carried out at MSS Mortuary Support Services, Baulkham Hills, Sydney NSW.
        </div>

        <div class="field">
          <div class="field-label">Embalmer / Technician Name</div>
          <div class="field-value">${embName}</div>
        </div>

        <div class="sig-area">
          <div class="sig-box">
            ${embSignature?`<img src="${embSignature}" class="sig-img" alt="Signature"/>`:"<div style='height:80px'></div>"}
            <div class="sig-label">Signature of Embalmer / Technician</div>
          </div>
          <div class="sig-box">
            <div style="height:80px"></div>
            <div class="sig-label">Authorised by MSS</div>
          </div>
        </div>

        <div class="footer">
          MSS Mortuary Support Services · Baulkham Hills, Sydney NSW · Ph: 02 8814 5500 · info@mortuarysupport.com.au<br/>
          This certificate is issued for the purposes of cremation/preparation documentation.
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(()=>printWindow.print(),500);
  }

  async function handleSaveAndEmail(){
    if(!embName.trim()){alert("Please enter the Embalmer name.");return;}
    if(!embSignature){alert("Please provide a signature.");return;}
    setSaving(true);

    // Generate email
    const to=[MORTUARY_EMAIL,...fhContacts].join(",");
    const subj=encodeURIComponent(`Pacemaker Removal Certificate — ${caseData.firstName} ${caseData.lastName}`);
    const body=encodeURIComponent(`Hi ${caseData.funeralHomeName} Team,

Please find below confirmation that the pacemaker has been removed from ${caseData.firstName} ${caseData.lastName}.

─────────────────────────────
PACEMAKER REMOVAL DETAILS
─────────────────────────────
Deceased: ${caseData.firstName} ${caseData.lastName}
Case Reference: ${caseData.caseRef}
Date of Birth: ${fmt(caseData.dob)}
Date of Death: ${fmt(caseData.dod)}
Date of Removal: ${fmt(certDate)}
Removed By: ${embName}

The pacemaker has been safely removed and disposed of in accordance with relevant regulations.

A signed certificate is attached for your records.
${`
Any questions please don't hesitate to contact us.

The Team at MSS Mortuary Support Services
Phone: 02 8814 5500
Email: info@mortuarysupport.com.au`}`);

    window.open(`mailto:${to}?subject=${subj}&body=${body}`);

    // Generate PDF
    generatePDF();

    setSaving(false);
    onSaved&&onSaved();
    onClose();
  }

  return(
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto pt-4 px-4 pb-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="bg-gray-900 text-white rounded-t-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-gray-400">MSS Mortuary Support Services</p>
            <h2 className="text-lg font-black uppercase">Pacemaker Removal Certificate</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white font-black text-xl">✕</button>
        </div>

        <div className="p-6">
          {/* Pre-populated details */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5">
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Deceased Details</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500 font-bold uppercase text-xs">Name: </span><span className="font-black text-gray-900">{caseData.firstName} {caseData.lastName}</span></div>
              <div><span className="text-gray-500 font-bold uppercase text-xs">Case Ref: </span><span className="font-black text-gray-900">{caseData.caseRef}</span></div>
              <div><span className="text-gray-500 font-bold uppercase text-xs">DOB: </span><span className="font-black text-gray-900">{fmt(caseData.dob)}</span></div>
              <div><span className="text-gray-500 font-bold uppercase text-xs">DOD: </span><span className="font-black text-gray-900">{fmt(caseData.dod)}</span></div>
              <div className="col-span-2"><span className="text-gray-500 font-bold uppercase text-xs">Funeral Director: </span><span className="font-black text-gray-900">{caseData.funeralHomeName}</span></div>
            </div>
          </div>

          {/* Date of removal */}
          <Field label="DATE OF REMOVAL" required>
            <input type="date" className={s.inp} value={certDate} onChange={e=>setCertDate(e.target.value)}/>
            {certDate&&<p className="text-xs font-bold text-gray-500 mt-1">{fmt(certDate)}</p>}
          </Field>

          {/* Embalmer name */}
          <Field label="EMBALMER / TECHNICIAN NAME" required>
            <input className={`${s.inp} font-bold`} placeholder="Full name…" value={embName} onChange={e=>setEmbName(e.target.value)}/>
          </Field>

          {/* Declaration */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
            <p className="text-xs font-black uppercase text-amber-700 mb-2">Declaration</p>
            <p className="text-xs text-amber-800 leading-relaxed">I hereby certify that I have examined the above-named deceased and have successfully removed the pacemaker/implantable cardiac device prior to cremation/preparation. The device has been safely disposed of in accordance with relevant regulations.</p>
          </div>

          {/* Signature */}
          <Field label="EMBALMER SIGNATURE" required>
            <SignaturePad onSave={sig=>setEmbSignature(sig)}/>
          </Field>

          {/* Action buttons */}
          <div className="flex gap-3 mt-5 pt-4 border-t border-gray-100">
            <button onClick={onClose} className={`${s.btnGhost} flex-1 py-3`}>CANCEL</button>
            <button onClick={generatePDF} className="flex-1 py-3 rounded-xl border-2 border-gray-900 text-gray-900 font-black text-sm uppercase hover:bg-gray-100 transition">📄 SAVE PDF</button>
            <button onClick={handleSaveAndEmail} disabled={saving}
              className={`${s.btnDark} flex-1 py-3 disabled:opacity-40`}>
              {saving?"SAVING…":"📧 SAVE & EMAIL"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MORTUARY ─────────────────────────────────────────────────────────────────
function MortuaryFlow({user,cases,onUpdateCase,onBack}) {
  const [selFH,setSelFH]=useState(null);
  const [selCase,setSelCase]=useState(null);
  useEffect(()=>window.scrollTo({top:0,behavior:"smooth"}),[selFH?.id,selCase?.id]);

  const byFH={};
  cases.filter(c=>c.status==="active").forEach(c=>{if(!byFH[c.funeralHomeId])byFH[c.funeralHomeId]=[];byFH[c.funeralHomeId].push(c);});

  async function upd(id,updates){
    try{
      await updateCase(id,caseToDb({...cases.find(c=>c.id===id),...updates}));
      onUpdateCase(id,updates);
      setSelCase(p=>p?.id===id?{...p,...updates}:p);
    }catch(err){alert("Save error: "+err.message);}
  }

  if(!selFH) return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <BackBtn onClick={onBack} label="Back to Home"/>
      <h2 className="text-2xl font-black text-gray-900 mb-6">Mortuary</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {sortAlpha(FUNERAL_HOMES,"name").map(fh=>{
          const has=!!(byFH[fh.id]?.length);
          return <button key={fh.id} disabled={!has} onClick={()=>setSelFH(fh)} className={`py-5 px-4 rounded-2xl border-2 text-sm font-bold text-center transition ${has?"border-gray-200 hover:border-gray-900 bg-white text-gray-900":"border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"}`}>{fh.name}{has&&<div className="text-xs font-normal text-gray-400 mt-1">{byFH[fh.id].length} case{byFH[fh.id].length>1?"s":""}</div>}</button>;
        })}
      </div>
    </div>
  );

  const fhCases=(byFH[selFH.id]||[]).sort((a,b)=>a.lastName.localeCompare(b.lastName));

  if(!selCase) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <BackBtn onClick={()=>setSelFH(null)} label="Back to Funeral Directors"/>
      <h2 className="text-2xl font-black text-gray-900 mb-1">{selFH.name}</h2>
      <p className="text-gray-500 text-sm mb-6">Select deceased</p>
      <div className="space-y-3">
        {fhCases.map(c=>(
          <button key={c.id} onClick={()=>setSelCase(c)} className="w-full bg-white border-2 border-gray-200 hover:border-gray-900 rounded-2xl p-5 text-left transition">
            <div className="flex items-center justify-between">
              <div><div className="text-xl font-black text-gray-900">{(c.lastName||"").toUpperCase()}, {c.firstName} — <span className="text-base font-bold text-gray-500">{sexShort(c.sex)}</span></div><div className="text-sm text-gray-500 mt-1">{c.caseRef} · DOD: {fmt(c.dod)}</div></div>
              <StatusDot status={c.prepStatus||"not-started"}/>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const c=selCase,prep=c.prep||{},billable=c.billable||{},otherUsed=c.otherUsed||{},statusItems=c.statusItems||{};
  const updPrep=(k,v)=>upd(c.id,{prep:{...prep,[k]:v}});
  const updPrepMulti=(updates)=>upd(c.id,{prep:{...prep,...updates}});
  const [showPacemakerCert,setShowPacemakerCert]=useState(false);
  const updBill=(k,v)=>upd(c.id,{billable:{...billable,[k]:v}});
  const updOther=(k,v)=>upd(c.id,{otherUsed:{...otherUsed,[k]:v}});
  const updStatus=(k,v)=>upd(c.id,{statusItems:{...statusItems,[k]:v}});
  const bookedSlots=getBookedSlots(cases,c.id);
  const isAdmin=user?.role==="admin";

  async function handleStatus(status){
    if(status==="completed"){
      if(window.confirm("Are you sure this case is finished?")){
        await upd(c.id,{prepStatus:"completed"});
        const fhContacts=c.funeralHomeId==="OTHER"?[]:getFHContacts(c.funeralHomeId);
        const to=[MORTUARY_EMAIL,...fhContacts].join(",");
        const subj=encodeURIComponent(`T/L ${c.firstName} ${c.lastName} is now ready for departure`);
        const body=encodeURIComponent(buildCompletedEmail(c, prep, billable, otherUsed));
        // EMAIL DISABLED — window.open(`mailto:${to}?subject=${subj}&body=${body}`);
      }
    } else await upd(c.id,{prepStatus:status});
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <BackBtn onClick={()=>setSelCase(null)} label={`Back to ${selFH.name}`}/>
      <div className="mb-5"><CaseViewCard c={{...c,prep}} isAdmin={isAdmin} onSave={updates=>upd(c.id,updates)}/></div>
      <div className="grid grid-cols-5 gap-2 mb-5">
        {[["secondNote","2nd Note"],["clothes","Clothes"],["coffin","Coffin"],["mccd","MCCD"],["photo","Photo"]].map(([k,l])=>(
          <button key={k} onClick={()=>updStatus(k,!statusItems[k])} className={`py-3 rounded-xl border-2 text-xs font-bold transition ${statusItems[k]?"bg-green-500 border-green-500 text-white":"bg-red-50 border-red-300 text-red-600"}`}>{l}</button>
        ))}
      </div>
      <Divider/>
      <div className={s.card}><p className={s.section}>Preparation Required</p><MultiToggle options={PREP_OPTIONS.map(p=>p.label)} selected={prep.prepOptions||[]} onToggle={o=>{const cur=prep.prepOptions||[];updPrep("prepOptions",cur.includes(o)?cur.filter(x=>x!==o):[...cur,o]);}}/></div>
      <div className={s.card}><ViewingSection prep={prep} updPrepMulti={updPrepMulti} bookedSlots={bookedSlots}/></div>
      <div className={s.card}>
        <p className={s.section}>Dates</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Collection Date"><input type="date" className={s.inp} value={prep.collectionDate||""} min={today()} onChange={e=>updPrep("collectionDate",e.target.value)}/>{prep.collectionDate&&<div className="text-xs text-gray-500 mt-1">{fmt(prep.collectionDate)}</div>}</Field>
          <Field label="Funeral Date"><input type="date" className={s.inp} value={prep.funeralDate||""} min={today()} onChange={e=>updPrep("funeralDate",e.target.value)}/>{prep.funeralDate&&<div className="text-xs text-gray-500 mt-1">{fmt(prep.funeralDate)}</div>}</Field>
        </div>
      </div>
      <div className={s.card}><p className={s.section}>Disposition</p><div className="flex gap-2">{DISPOSITION_OPTIONS.map(d=><button key={d} type="button" onClick={()=>updPrep("disposition",d)} className={s.tb(prep.disposition===d)}>{d}</button>)}</div></div>
      <div className={s.card}>
        <p className={s.section}>Physical Details</p>
        <div className="space-y-4">
          <div><div className={s.label}>Weight</div><div className="flex gap-2">{["Over 100kg","Under 100kg","TBA"].map(w=><button key={w} type="button" onClick={()=>updPrep("weight",w)} className={s.tb(prep.weight===w)}>{w}</button>)}</div></div>
          {[["cleanShaven","Clean Shaven"],["hairLocks","Hair Locks"],["fingerPrints","Finger Prints"]].map(([k,l])=>(
            <div key={k}><div className={s.label}>{l}</div><div className="flex gap-2">{["Yes","No","TBA"].map(v=><button key={v} type="button" onClick={()=>updPrep(k,v)} className={s.tb(prep[k]===v)}>{v}</button>)}</div></div>
          ))}
          <div>
            <div className={s.label}>Pacemaker Removed</div>
            <div className="flex gap-2 mb-2">{["Yes","No","NA","TBA"].map(v=><button key={v} type="button" onClick={()=>updPrep("pacemakerRemoved",v)} className={s.tb(prep.pacemakerRemoved===v)}>{v}</button>)}</div>
            {prep.pacemakerRemoved==="Yes"&&(
              <button type="button" onClick={()=>setShowPacemakerCert(true)}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-sm uppercase tracking-wide transition">
                📋 GENERATE PACEMAKER REMOVAL CERTIFICATE
              </button>
            )}
          </div>
        </div>
      </div>
      <div className={s.card}><p className={s.section}>Comments</p><textarea className={`${s.inp} min-h-[80px]`} value={prep.comments||""} onChange={e=>updPrep("comments",e.target.value)} placeholder="Add mortuary comments…"/></div>

      <div className={s.card}>
        <p className={s.section}>VALUABLES</p>
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={()=>updPrep("mortuaryValuables","Yes")}
            className={`flex-1 py-3 rounded-xl border-2 font-black text-sm uppercase transition ${prep.mortuaryValuables==="Yes"?"bg-green-600 text-white border-green-600":"border-gray-300 text-gray-600 hover:border-gray-700"}`}>
            YES
          </button>
          <button type="button" onClick={()=>{updPrepMulti({mortuaryValuables:"No",mortuaryValuablesText:""}); }}
            className={`flex-1 py-3 rounded-xl border-2 font-black text-sm uppercase transition ${prep.mortuaryValuables==="No"?"bg-red-500 text-white border-red-500":"border-gray-300 text-gray-600 hover:border-gray-700"}`}>
            NO
          </button>
        </div>
        {prep.mortuaryValuables==="Yes"&&(
          <div>
            <label className={s.label}>DESCRIBE VALUABLES</label>
            <textarea className={`${s.inp} min-h-[80px]`}
              value={prep.mortuaryValuablesText||""}
              onChange={e=>updPrep("mortuaryValuablesText",e.target.value)}
              placeholder="e.g. Gold wedding ring, silver necklace, glasses…"/>
            <p className="text-xs font-bold text-gray-400 uppercase mt-1">These will appear in Check Out for confirmation</p>
          </div>
        )}
      </div>
      <Divider/>
      <div className={s.card}>
        <p className={s.section}>Other Items Used</p>
        {Object.entries(OTHER_ITEMS).map(([group,items])=>(
          <div key={group} className="mb-4"><div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{group}</div><MultiToggle options={items} selected={Object.keys(otherUsed).filter(k=>otherUsed[k])} onToggle={o=>updOther(o,!otherUsed[o])}/></div>
        ))}
      </div>
      <div className={s.card}>
        <p className={s.section}>BILLABLE ITEMS</p>
        <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">POPULAR ITEMS</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {["Casual Labour Hire - 4hrs min, PP","Crucifix/Cross - Large","Crucifix/Cross - Small","Dr Referee","Name Plate - Gold Large","Name Plate - Silver Large","Shroud","Tyvek Suits","Viewing Room","Viewing Room Host"].map(item=>(
            <button key={item} type="button" onClick={()=>updBill(item,!billable[item])}
              className={s.tb(!!billable[item])}>{item}</button>
          ))}
        </div>
        <div className="border-t-2 border-gray-100 my-3"/>
        <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">ALL ITEMS</p>
        <div className="flex flex-wrap gap-2">
          {BILLABLE_ITEMS.filter(item=>!["Casual Labour Hire - 4hrs min, PP","Crucifix/Cross - Large","Crucifix/Cross - Small","Dr Referee","Name Plate - Gold Large","Name Plate - Silver Large","Shroud","Tyvek Suits","Viewing Room","Viewing Room Host"].includes(item)).sort().map(item=>(
            <button key={item} type="button" onClick={()=>updBill(item,!billable[item])}
              className={s.tb(!!billable[item])}>{item}</button>
          ))}
        </div>
      </div>
      <Divider/>
      <DocumentSection caseId={c.id} funeralHomeName={c.funeralHomeName} lastName={c.lastName} dod={c.dod}/>
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[["not-started","Not Started","bg-red-500"],["in-progress","In Progress","bg-amber-500"],["completed","Completed","bg-green-600"]].map(([val,label,col])=>(
          <button key={val} onClick={()=>handleStatus(val)} className={`py-4 rounded-2xl text-white font-black text-base transition ${col} ${c.prepStatus===val?"ring-4 ring-offset-2 ring-gray-300":"opacity-80 hover:opacity-100"}`}>{label}</button>
        ))}
      </div>
    </div>
  );
}

// ─── CHECK OUT ────────────────────────────────────────────────────────────────
function SignaturePad({onSave}) {
  const canvasRef = React.useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0];
    return {
      x: (touch ? touch.clientX : e.clientX) - rect.left,
      y: (touch ? touch.clientY : e.clientY) - rect.top,
    };
  }

  function startDraw(e) {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
  }

  function draw(e) {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSignature(true);
  }

  function endDraw(e) {
    e.preventDefault();
    setDrawing(false);
    if (hasSignature) {
      const canvas = canvasRef.current;
      onSave(canvas.toDataURL());
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSave(null);
  }

  return (
    <div>
      <div className="border-2 border-gray-300 rounded-xl overflow-hidden bg-white relative">
        <canvas ref={canvasRef} width={500} height={150}
          className="w-full touch-none cursor-crosshair"
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}/>
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-300 font-bold uppercase text-sm">Sign here with your finger</p>
          </div>
        )}
      </div>
      <div className="flex justify-between items-center mt-2">
        <p className="text-xs text-gray-400 font-bold uppercase">Draw your signature above</p>
        {hasSignature && <button onClick={clear} className="text-xs font-black text-red-400 hover:text-red-600 uppercase">Clear</button>}
      </div>
    </div>
  );
}

function CheckOutFlow({user,cases,onUpdateCase,onBack}) {
  const [step,setStep]=useState(user?.role==="fd"?2:1);
  const [checkoutRole,setCheckoutRole]=useState(user?.role==="fd"?"FUNERAL DIRECTOR":user?.role==="transfer"?"DRIVER":"");
  const [selFH,setSelFH]=useState(user?.role==="fd"?FUNERAL_HOMES.find(f=>f.id===user.funeralHomeId):null);
  const [showPast,setShowPast]=useState(false);
  const [selCase,setSelCase]=useState(null);
  const [checklist,setChecklist]=useState({});
  const [valuablesStatus,setValuablesStatus]=useState("");
  const [disposition,setDisposition]=useState("");
  const [destination,setDestination]=useState("");
  const [otherDestination,setOtherDestination]=useState("");
  const [signature,setSignature]=useState(null);
  const [errors,setErrors]=useState({});
  const [done,setDone]=useState(false);
  const [saving,setSaving]=useState(false);
  const [checkoutTime]=useState(new Date());
  useEffect(()=>window.scrollTo({top:0,behavior:"smooth"}),[step,selCase?.id,done]);

  const isFD=user?.role==="fd";
  const currentCases=cases.filter(c=>{
    if(c.checkedOut||["past","locked","pending-lock","approved"].includes(c.status)) return false;
    if(isFD) return c.funeralHomeId===user.funeralHomeId;
    return true;
  });
  const pastCases=cases.filter(c=>{
    if(!c.checkedOut&&!["past","locked","pending-lock","approved"].includes(c.status)) return false;
    if(isFD) return c.funeralHomeId===user.funeralHomeId;
    return true;
  });
  const activeFHIds=[...new Set(currentCases.map(c=>c.funeralHomeId))];
  const pastFHIds=[...new Set(pastCases.map(c=>c.funeralHomeId))];

  // Get case-specific disposition options
  const caseDisposition=selCase?.prep?.disposition;
  const availableDispositions=caseDisposition?[caseDisposition]:DISPOSITION_OPTIONS;

  // Check if case has valuables (from check in OR mortuary)
  const checkInValuables=selCase&&selCase.valuables&&selCase.valuables!=="Nil"&&selCase.valuables!=="";
  const mortuaryValuables=selCase?.prep?.mortuaryValuables==="Yes"&&selCase?.prep?.mortuaryValuablesText;
  const hasValuables=checkInValuables||mortuaryValuables;
  const valuablesDescription=[
    checkInValuables?`Check In: ${selCase.valuables}`:"",
    mortuaryValuables?`Mortuary: ${selCase.prep.mortuaryValuablesText}`:"",
  ].filter(Boolean).join(" | ");

  // Check pacemaker status
  const pacemakerStatus=selCase?.prep?.pacemakerRemoved;
  const hasPacemaker=pacemakerStatus&&pacemakerStatus!=="NA";

  // Final destination value
  const finalDestination=destination==="Other"?otherDestination:destination;

  function validate() {
    const e={};
    if(!CHECKOUT_ITEMS.every(i=>checklist[i])) e.checklist="All checklist items must be completed";
    if(hasValuables&&!valuablesStatus) e.valuables="Please confirm valuables status";
    if(!disposition) e.disposition="Please select a disposition";
    if(!destination) e.destination="Please select a destination";
    if(destination==="Other"&&!otherDestination.trim()) e.destination="Please enter destination";
    if(!signature?.name?.trim()) e.signature="Full name is required";
    else if(!signature?.pad) e.signature="Signature drawing is required";
    return e;
  }

  async function handleComplete(){
    const e=validate();
    if(Object.keys(e).length){setErrors(e);window.scrollTo({top:0,behavior:"smooth"});return;}
    setSaving(true);
    const coData={checklist,disposition,destination:finalDestination,valuablesStatus,signedName:signature?.name,signatureImage:signature?.pad,checkedOutAt:new Date().toISOString(),checkedOutBy:user.name,checkedOutRole:checkoutRole};
    try{
      await updateCase(selCase.id,{checked_out:true,checkout_data:coData,status:"pending-lock"});
      onUpdateCase(selCase.id,{checkedOut:true,checkout:coData,status:"pending-lock"});
      const fhContacts=selCase.funeralHomeId==="OTHER"?[]:getFHContacts(selCase.funeralHomeId);
      const to=[MORTUARY_EMAIL,...fhContacts].join(",");
      const subj=encodeURIComponent(`T/L ${selCase.firstName} ${selCase.lastName} has departed MSS`);
      const body=encodeURIComponent(buildCheckOutEmail(selCase,coData));
      setDone(true);
      // EMAIL DISABLED — window.open(`mailto:${to}?subject=${subj}&body=${body}`);
    }catch(err){alert("Error: "+err.message);}
    setSaving(false);
  }

  if(done) return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="bg-green-50 border border-green-300 rounded-2xl p-8 mb-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 border border-green-400 mb-4"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg></div>
        <h2 className="text-2xl font-black text-gray-900 mb-1">Checked Out ✓</h2>
        <p className="text-green-700 font-semibold">{selCase.firstName} {selCase.lastName} has departed</p>
        <p className="text-gray-500 text-sm mt-2">{fmtDT(new Date().toISOString())}</p>
        <p className="text-gray-700 font-black uppercase mt-2">{signature?.name}</p>
        {signature?.pad&&<img src={signature.pad} alt="Signature" className="mt-3 mx-auto border border-gray-200 rounded-lg max-h-20 bg-white"/>}
      </div>
      <p className="text-xs text-gray-400 text-center mb-6">Awaiting Admin approval to lock.</p>
      <button onClick={onBack} className={`${s.btnGhost} w-full`}>← Back to Home</button>
    </div>
  );

  const displayCases=(showPast?pastCases:currentCases).filter(c=>selFH?c.funeralHomeId===selFH.id:true);

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <BackBtn onClick={onBack} label="Back to Home"/>
      <h2 className="text-2xl font-black text-gray-900 mb-6">Check Out</h2>

      {step===1&&!isFD&&(
        <div><p className={s.section}>Who is checking out?</p><div className="grid grid-cols-1 gap-3">{[["MSS","MSS Staff"],["DRIVER","Driver / Transfer Team"],["FUNERAL DIRECTOR","Funeral Director"]].map(([v,l])=><button key={v} onClick={()=>{setCheckoutRole(v);setStep(2);}} className={s.btnLgGhost}>{l}</button>)}</div></div>
      )}

      {step===2&&!selCase&&(
        <div>
          {!isFD&&<BackBtn onClick={()=>setStep(1)}/>}
          <div className="flex items-center justify-between mb-4">
            <p className={`${s.section} mb-0`}>{isFD?"Your Cases":"Select Funeral Director"}</p>
            {!isFD&&<button onClick={()=>setShowPast(!showPast)} className="text-xs font-bold text-gray-500 border border-gray-300 rounded-lg px-3 py-1.5 hover:border-gray-700 transition">{showPast?"Current":"Past Cases"}</button>}
          </div>
          {!isFD&&<div className="grid grid-cols-2 gap-3 mb-4">{sortAlpha(FUNERAL_HOMES,"name").filter(fh=>(showPast?pastFHIds:activeFHIds).includes(fh.id)).map(fh=><button key={fh.id} onClick={()=>{setSelFH(fh);setStep(3);}} className="py-5 px-4 rounded-2xl border-2 border-gray-200 hover:border-gray-900 bg-white text-sm font-bold text-left transition">{fh.name}</button>)}{(showPast?pastFHIds:activeFHIds).length===0&&<p className="col-span-2 text-gray-400 text-center py-8">No cases available.</p>}</div>}
          {isFD&&<div className="space-y-3">{displayCases.sort((a,b)=>a.lastName.localeCompare(b.lastName)).map(c=><button key={c.id} onClick={()=>setSelCase(c)} className="w-full bg-white border-2 border-gray-200 hover:border-gray-900 rounded-2xl p-5 text-left transition"><div className="text-xl font-black text-gray-900">{(c.lastName||"").toUpperCase()}, {c.firstName}</div><div className="text-sm text-gray-500 mt-1">{c.caseRef}</div></button>)}{displayCases.length===0&&<p className="text-gray-400 text-center py-8">No current cases.</p>}</div>}
        </div>
      )}

      {step===3&&selFH&&!selCase&&(
        <div>
          <BackBtn onClick={()=>{setStep(2);setSelFH(null);}} label="Back to Funeral Directors"/>
          <p className={s.section}>{selFH.name}</p>
          <div className="space-y-3">{displayCases.sort((a,b)=>a.lastName.localeCompare(b.lastName)).map(c=><button key={c.id} onClick={()=>setSelCase(c)} className="w-full bg-white border-2 border-gray-200 hover:border-gray-900 rounded-2xl p-5 text-left transition"><div className="text-xl font-black text-gray-900">{(c.lastName||"").toUpperCase()}, {c.firstName} — <span className="text-base font-bold text-gray-500">{sexShort(c.sex)}</span></div><div className="text-sm text-gray-500 mt-1">{c.caseRef} · DOD: {fmt(c.dod)}</div></button>)}{displayCases.length===0&&<p className="text-gray-400 text-center py-8">No cases.</p>}</div>
        </div>
      )}

      {selCase&&(
        <div>
          <BackBtn onClick={()=>setSelCase(null)} label="Back"/>

          {/* Date/Time */}
          <div className="bg-gray-900 text-white rounded-2xl px-5 py-3 mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">Check Out Date & Time</p>
              <p className="text-base font-black">{fmtDT(checkoutTime.toISOString())}</p>
            </div>
          </div>

          <div className="mb-5"><CaseViewCard c={selCase}/></div>

          {/* Pacemaker status */}
          {hasPacemaker&&(
            <div className={s.card}>
              <p className={s.section}>PACEMAKER</p>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-600 uppercase">Pacemaker Removed:</span>
                {pacemakerStatus==="YES"
                  ?<span className="px-4 py-2 rounded-xl bg-green-500 text-white font-black text-sm uppercase">YES ✓</span>
                  :<span className="px-4 py-2 rounded-xl bg-red-500 text-white font-black text-sm uppercase">NO ✗</span>
                }
              </div>
              {pacemakerStatus==="NO"&&<p className="text-red-600 text-xs font-black uppercase mt-2">⚠️ Pacemaker not removed — do not cremate</p>}
            </div>
          )}

          {/* Error summary */}
          {Object.keys(errors).length>0&&(
            <div className="bg-red-50 border border-red-300 rounded-xl p-4 mb-4">
              <p className="text-red-700 font-black uppercase text-sm mb-1">Please complete all required fields:</p>
              {Object.values(errors).map((e,i)=><p key={i} className="text-red-600 text-xs font-bold">• {e}</p>)}
            </div>
          )}

          {/* Checklist */}
          <div className={s.card}>
            <p className={s.section}>DEPARTURE CHECKLIST {errors.checklist&&<span className="text-red-500 text-xs ml-2 normal-case">({errors.checklist})</span>}</p>
            {CHECKOUT_ITEMS.map(item=>(
              <div key={item}>
                <div onClick={()=>{setChecklist(c=>({...c,[item]:!c[item]}));setErrors(e=>({...e,checklist:""}));}}
                  className={`flex items-center gap-4 p-4 rounded-xl mb-2 cursor-pointer border-2 transition ${checklist[item]?"border-green-500 bg-green-50":"border-gray-200 bg-gray-50 hover:border-gray-400"}`}>
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${checklist[item]?"border-green-500 bg-green-500":"border-gray-300 bg-white"}`}>
                    {checklist[item]&&<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <span className={`text-base font-semibold ${checklist[item]?"text-green-800":"text-gray-700"}`}>{item}</span>
                </div>
                {/* Valuables detail under the valuables checklist item */}
                {item==="Check / Collect Valuables"&&hasValuables&&checklist[item]&&(
                  <div className="ml-12 mb-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-xs font-black uppercase text-amber-700 mb-2">Valuables on file: <span className="text-amber-900">{valuablesDescription}</span></p>
                    <p className="text-xs font-black uppercase text-gray-600 mb-2">Valuables status: {errors.valuables&&<span className="text-red-500">({errors.valuables})</span>}</p>
                    <div className="flex flex-col gap-2">
                      {[
                        ["YES_DRIVER","✓ Yes — Collected by Driver","bg-green-600"],
                        ["YES_FD","✓ Yes — Collected by Funeral Director","bg-blue-600"],
                        ["NO_MSS","✗ No — Remaining at MSS","bg-red-500"],
                      ].map(([val,label,col])=>(
                        <button key={val} onClick={()=>{setValuablesStatus(val);setErrors(e=>({...e,valuables:""}));}}
                          className={`py-2.5 px-4 rounded-xl text-xs font-black uppercase transition text-left ${valuablesStatus===val?`${col} text-white`:"bg-white border-2 border-gray-200 text-gray-600 hover:border-gray-500"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Disposition */}
          <div className={s.card}>
            <p className={s.section}>DISPOSITION & DESTINATION</p>
            <Field label={`Disposition${errors.disposition?" — "+errors.disposition:""}`} required>
              <div className="flex gap-2">
                {availableDispositions.map(d=>(
                  <button key={d} onClick={()=>{setDisposition(d);setErrors(e=>({...e,disposition:""}));}}
                    className={`flex-1 py-3 rounded-xl border-2 font-black text-sm uppercase transition ${disposition===d?"bg-gray-900 text-white border-gray-900":"border-gray-300 text-gray-600 hover:border-gray-700"}`}>{d}</button>
                ))}
              </div>
              {caseDisposition&&<p className="text-xs text-gray-400 font-bold uppercase mt-1">Pre-set from case: {caseDisposition}</p>}
            </Field>
            <Field label={`Destination${errors.destination?" — "+errors.destination:""}`} required>
              <select className={s.sel} value={destination} onChange={e=>{setDestination(e.target.value);setErrors(er=>({...er,destination:""}));}}>
                <option value="">— Select —</option>
                {DESTINATIONS.map(d=><option key={d}>{d}</option>)}
                <option value="Other">Other</option>
              </select>
              {destination==="Other"&&(
                <input className={`${s.inp} mt-2`} placeholder="Please specify destination…"
                  value={otherDestination} onChange={e=>{setOtherDestination(e.target.value);setErrors(er=>({...er,destination:""}));}}/>
              )}
            </Field>
          </div>

          {/* Signature */}
          <div className={s.card}>
            <p className={s.section}>SIGN OFF {errors.signature&&<span className="text-red-500 text-xs ml-2 normal-case">({errors.signature})</span>}</p>
            <p className="text-xs font-bold text-gray-500 uppercase mb-3">Signed by: <span className="text-gray-900">{user.name}</span> · {fmtDT(checkoutTime.toISOString())}</p>
            <Field label="PRINT FULL NAME" required>
              <input className={`${s.inp} text-lg font-bold uppercase`}
                placeholder="Type your full name…"
                value={signature?.name||""}
                onChange={e=>setSignature(prev=>({...prev,name:e.target.value}))}/>
            </Field>
            <Field label="SIGNATURE — DRAW WITH FINGER" required>
              <SignaturePad onSave={sig=>setSignature(prev=>({...prev,pad:sig}))}/>
            </Field>
          </div>

          <button onClick={handleComplete} disabled={saving}
            className={`${s.btnDark} w-full text-lg py-4 disabled:opacity-40 disabled:cursor-not-allowed`}>
            {saving?"Saving…":"✓ Submit Check-Out"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── MY CASES ─────────────────────────────────────────────────────────────────
function MyCases({user,cases,onUpdateCase}) {
  const [filter,setFilter]=useState("current");
  const isAdmin=user?.role==="admin",isFD=user?.role==="fd";
  useEffect(()=>window.scrollTo({top:0,behavior:"smooth"}),[filter]);
  let myCases=isFD?cases.filter(c=>c.funeralHomeId===user.funeralHomeId):cases;
  const current=myCases.filter(c=>c.status==="active"&&!c.checkedOut);
  const past=myCases.filter(c=>c.checkedOut||["past","locked","pending-lock","approved"].includes(c.status));
  const display=(filter==="current"?current:past).sort((a,b)=>a.lastName.localeCompare(b.lastName));

  async function approveCase(c){
    try{
      await updateCase(c.id,{status:"approved"});
      onUpdateCase(c.id,{status:"approved"});
      // Send approval email to accounts
      const prep=c.prep||{},billable=c.billable||{},otherUsed=c.otherUsed||{};
      const to="accounts@mortuarysupport.com.au";
      const subj=encodeURIComponent(`Job Card — ${c.firstName} ${c.lastName} — ${c.caseRef}`);
      const body=encodeURIComponent(buildApproveEmail(c,prep,billable,otherUsed));
      window.open(`mailto:${to}?subject=${subj}&body=${body}`);
    }catch(err){alert("Error: "+err.message);}
  }

  async function approveCase(c){
    try{
      await updateCase(c.id,{status:"approved"});
      onUpdateCase(c.id,{status:"approved"});
      const prep=c.prep||{},billable=c.billable||{},otherUsed=c.otherUsed||{};
      const to="accounts@mortuarysupport.com.au";
      const subj=encodeURIComponent(`Job Card — ${c.firstName} ${c.lastName} — ${c.caseRef}`);
      const body=encodeURIComponent(buildApproveEmail(c,prep,billable,otherUsed));
      window.open(`mailto:${to}?subject=${subj}&body=${body}`);
    }catch(err){alert("Error: "+err.message);}
  }

  async function lockCase(id){
    try{await updateCase(id,{status:"locked"});onUpdateCase(id,{status:"locked"});}
    catch(err){alert("Error: "+err.message);}
  }

  async function unlockCase(id){
    try{await updateCase(id,{status:"pending-lock"});onUpdateCase(id,{status:"pending-lock"});}
    catch(err){alert("Error: "+err.message);}
  }

  async function unlockCase(id){
    try{await updateCase(id,{status:"pending-lock"});onUpdateCase(id,{status:"pending-lock"});}
    catch(err){alert("Error: "+err.message);}
  }

  async function adminSaveCase(c,updates){
    try{
      await updateCase(c.id,updates);
      // Also update local app state with mapped field names
      const mapped={};
      if(updates.last_name!==undefined) mapped.lastName=updates.last_name;
      if(updates.first_name!==undefined) mapped.firstName=updates.first_name;
      if(updates.dob!==undefined) mapped.dob=updates.dob;
      if(updates.dod!==undefined) mapped.dod=updates.dod;
      if(updates.funeral_home_name!==undefined) mapped.funeralHomeName=updates.funeral_home_name;
      if(updates.transfer_person_name!==undefined) mapped.transferPersonName=updates.transfer_person_name;
      if(updates.prep!==undefined) mapped.prep=updates.prep;
      onUpdateCase(c.id,mapped);
    }catch(err){alert("Save error: "+err.message);}
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h2 className="text-2xl font-black text-gray-900 mb-1">My Cases</h2>
      <p className="text-gray-500 text-sm mb-5">{myCases.length} total</p>
      <div className="flex gap-2 mb-5">
        {[["current","Current"],["past","Past"]].map(([v,l])=><button key={v} onClick={()=>setFilter(v)} className={`px-4 py-2 rounded-lg text-sm font-bold border transition ${filter===v?"bg-gray-900 text-white border-gray-900":"border-gray-300 text-gray-500 hover:border-gray-700"}`}>{l}</button>)}
      </div>
      {display.length===0&&<p className="text-gray-400 text-center py-12">No {filter} cases.</p>}
      <div className="space-y-4">
        {display.map(c=>(
          <div key={c.id} className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3"><StatusDot status={c.prepStatus||"not-started"}/><span className="text-xs font-bold text-gray-400">{c.caseRef}</span>{c.checkedOut&&<span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 rounded-full px-2 py-0.5 font-semibold">Departed</span>}{c.status==="approved"&&<span className="text-xs bg-blue-600 text-white rounded-full px-2 py-0.5 font-semibold">Approved</span>}{c.status==="locked"&&<span className="text-xs bg-gray-900 text-white rounded-full px-2 py-0.5 font-semibold">Locked</span>}</div>
              <div className="flex gap-2 flex-wrap justify-end">
                {isMSS&&c.checkedOut&&(c.status==="pending-lock")&&<button onClick={()=>approveCase(c)} className="text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 transition font-black uppercase">APPROVE</button>}
                {isAdmin&&c.checkedOut&&(c.status==="pending-lock"||c.status==="approved")&&<button onClick={()=>lockCase(c.id)} className="text-xs bg-gray-900 text-white rounded-lg px-3 py-1.5 hover:bg-gray-700 transition font-black uppercase">LOCK</button>}
                {isAdmin&&c.status==="locked"&&<button onClick={()=>unlockCase(c.id)} className="text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 hover:bg-red-600 transition font-black uppercase">UNLOCK</button>}
              </div>
            </div>
            <CaseViewCard c={c} isAdmin={isAdmin} onSave={updates=>adminSaveCase(c,updates)}/>
            {isFD&&<div className="grid grid-cols-5 gap-2 mt-3">{[["2nd Note",c.statusItems?.secondNote],["Clothes",c.statusItems?.clothes],["Coffin",c.statusItems?.coffin],["MCCD",c.statusItems?.mccd],["Photo",c.statusItems?.photo]].map(([l,v])=><div key={l} className={`py-2 px-1 rounded-lg text-xs font-bold text-center ${v?"bg-green-100 text-green-700 border border-green-300":"bg-red-50 text-red-500 border border-red-200"}`}>{l}</div>)}</div>}
            <DocumentSection caseId={c.id} funeralHomeName={c.funeralHomeName} lastName={c.lastName} dod={c.dod}/>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MY TRANSFERS ─────────────────────────────────────────────────────────────
function MyTransfers({user,cases}) {
  const cutoff=twoWeeksAgo();
  useEffect(()=>window.scrollTo({top:0,behavior:"smooth"}),[]);
  const myCases=cases.filter(c=>{const d=c.checkedInAt?new Date(c.checkedInAt):null;return d&&d>=cutoff;}).sort((a,b)=>new Date(b.checkedInAt)-new Date(a.checkedInAt));
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h2 className="text-2xl font-black text-gray-900 mb-1">My Transfers</h2>
      <p className="text-gray-500 text-sm mb-6">Past 2 weeks · {myCases.length} records</p>
      {myCases.length===0&&<p className="text-gray-400 text-center py-12">No transfers in the past 2 weeks.</p>}
      <div className="space-y-3">
        {myCases.map(c=>(
          <div key={c.id} className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="text-xl font-black text-gray-900 mb-3">{(c.lastName||"").toUpperCase()}, {c.firstName}</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div><span className="text-gray-500">Funeral Director: </span><span className="font-bold text-gray-900">{c.funeralHomeName||"—"}</span></div>
              <div><span className="text-gray-500">Check In: </span><span className="font-bold text-gray-900">{fmtDT(c.checkedInAt)}</span></div>
              <div><span className="text-gray-500">Check Out: </span><span className="font-bold text-gray-900">{c.checkout?.checkedOutAt?fmtDT(c.checkout.checkedOutAt):"—"}</span></div>
              <div><span className="text-gray-500">Collected From: </span><span className="font-bold text-gray-900">{c.transferredFrom||"—"}</span></div>
              <div><span className="text-gray-500">Delivered To: </span><span className="font-bold text-gray-900">{c.checkout?.destination||"—"}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RECORDS ──────────────────────────────────────────────────────────────────
function RecordsView({user,cases,onUpdateCase}) {
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("all");
  const isAdmin=user?.role==="admin";
  useEffect(()=>window.scrollTo({top:0,behavior:"smooth"}),[filter]);

  async function lockCase(id){
    try{await updateCase(id,{status:"locked"});onUpdateCase(id,{status:"locked"});}
    catch(err){alert("Error: "+err.message);}
  }

  async function adminSaveCase(c,updates){
    try{
      await updateCase(c.id,updates);
      const mapped={};
      if(updates.last_name!==undefined) mapped.lastName=updates.last_name;
      if(updates.first_name!==undefined) mapped.firstName=updates.first_name;
      if(updates.dob!==undefined) mapped.dob=updates.dob;
      if(updates.dod!==undefined) mapped.dod=updates.dod;
      if(updates.funeral_home_name!==undefined) mapped.funeralHomeName=updates.funeral_home_name;
      if(updates.transfer_person_name!==undefined) mapped.transferPersonName=updates.transfer_person_name;
      if(updates.prep!==undefined) mapped.prep=updates.prep;
      onUpdateCase(c.id,mapped);
    }catch(err){alert("Save error: "+err.message);}
  }

  const filtered=cases.filter(c=>{
    const q=search.toLowerCase();
    const ms=`${c.firstName} ${c.lastName} ${c.caseRef} ${c.funeralHomeName}`.toLowerCase().includes(q);
    const mf=filter==="all"?true:filter==="current"?c.status==="active"&&!c.checkedOut:c.checkedOut||["past","locked","pending-lock","approved"].includes(c.status);
    return ms&&mf;
  }).sort((a,b)=>new Date(b.checkedInAt)-new Date(a.checkedInAt));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6"><h2 className="text-2xl font-black text-gray-900">Records</h2><span className="text-sm text-gray-500">{filtered.length} records</span></div>
      <input className={`${s.inp} mb-4`} placeholder="Search by name, case ref, funeral home…" value={search} onChange={e=>setSearch(e.target.value)}/>
      <div className="flex gap-2 mb-5">{[["all","All"],["current","Current"],["past","Past"]].map(([v,l])=><button key={v} onClick={()=>setFilter(v)} className={`px-4 py-2 rounded-lg text-sm font-bold border transition ${filter===v?"bg-gray-900 text-white border-gray-900":"border-gray-300 text-gray-500 hover:border-gray-700"}`}>{l}</button>)}</div>
      {filtered.length===0&&<p className="text-gray-400 text-center py-12">No records found.</p>}
      <div className="space-y-4">
        {filtered.map(c=>(
          <div key={c.id} className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-3"><StatusDot status={c.prepStatus||"not-started"}/><span className="text-xs font-bold text-gray-400">{c.caseRef}</span>{c.checkedOut&&<span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 rounded-full px-2 py-0.5 font-semibold">Departed</span>}{c.status==="locked"&&<span className="text-xs bg-gray-900 text-white rounded-full px-2 py-0.5 font-semibold">Locked</span>}</div>
              <div className="flex gap-2 flex-wrap justify-end">
                {isMSS&&c.checkedOut&&(c.status==="pending-lock")&&<button onClick={()=>approveCase(c)} className="text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 transition font-black uppercase">APPROVE</button>}
                {isAdmin&&c.checkedOut&&(c.status==="pending-lock"||c.status==="approved")&&<button onClick={()=>lockCase(c.id)} className="text-xs bg-gray-900 text-white rounded-lg px-3 py-1.5 hover:bg-gray-700 transition font-black uppercase">LOCK</button>}
                {isAdmin&&c.status==="locked"&&<button onClick={()=>unlockCase(c.id)} className="text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 hover:bg-red-600 transition font-black uppercase">UNLOCK</button>}
              </div>
            </div>
            <CaseViewCard c={c} isAdmin={isAdmin} onSave={updates=>adminSaveCase(c,updates)}/>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-500 mt-3">
              <span>In: <span className="text-gray-800 font-medium">{fmtDT(c.checkedInAt)}</span></span>
              <span>By: <span className="text-gray-800 font-medium">{c.checkedInBy}</span></span>
              {c.checkedOut&&<><span>Out: <span className="text-gray-800 font-medium">{fmtDT(c.checkout?.checkedOutAt)}</span></span><span>Signed: <span className="text-gray-800 font-medium">{c.checkout?.signedName}</span></span></>}
            </div>
            <DocumentSection caseId={c.id} funeralHomeName={c.funeralHomeName} lastName={c.lastName} dod={c.dod}/>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PIN MANAGEMENT ───────────────────────────────────────────────────────────
function PinManagement({users,onPinUpdate}) {
  const [show,setShow]=useState(false);
  const [editing,setEditing]=useState(null);
  const [newPin,setNewPin]=useState("");
  const [err,setErr]=useState("");
  const [saving,setSaving]=useState(false);

  async function save(){
    if(newPin.length<4){setErr("Min 4 digits.");return;}
    setSaving(true);
    try{
      await updateUserPin(editing.id,newPin);
      onPinUpdate(editing.id,newPin);
      setEditing(null);setNewPin("");
    }catch(e){setErr("Save failed: "+e.message);}
    setSaving(false);
  }

  const staff=users.filter(u=>u.role==="mss"||u.role==="admin");
  const transfer=users.filter(u=>u.role==="transfer");
  const fds=sortAlpha(users.filter(u=>u.role==="fd"),"name");

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h2 className="text-2xl font-black text-gray-900 mb-1">PIN Management</h2>
      <p className="text-gray-500 text-sm mb-5">Admin only — changes save to database immediately</p>
      <button onClick={()=>setShow(x=>!x)} className={`${s.btnDark} mb-5`}>{show?"Hide PINs":"Reveal PINs"}</button>
      {show&&<>
        {[["MSS Staff",staff],["Transfer Companies",transfer],["Funeral Directors",fds]].map(([title,list])=>(
          <div key={title} className={s.card}>
            <p className={s.section}>{title}</p>
            {list.map(u=>(
              <div key={u.id} className="flex justify-between items-center py-2.5 border-b border-gray-100 last:border-0">
                <div><span className="font-bold text-gray-900">{u.name}</span><span className="ml-2 text-xs text-gray-400">({u.role})</span></div>
                <div className="flex items-center gap-2">
                  <span className="font-mono bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 text-sm">{u.pin}</span>
                  <button onClick={()=>{setEditing({id:u.id,label:u.name});setNewPin("");setErr("");}} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 text-gray-500 hover:border-gray-700 transition">Edit</button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </>}
      {editing&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-xl w-full max-w-sm mx-4">
            <h3 className="text-lg font-black text-gray-900 mb-1">Update PIN</h3>
            <p className="text-sm text-gray-500 mb-5">{editing.label}</p>
            <label className={s.label}>New PIN</label>
            <input type="password" maxLength={8} className={`${s.inp} text-center text-xl tracking-[0.4em] mb-1`} placeholder="••••" value={newPin} autoFocus onChange={e=>{setNewPin(e.target.value.replace(/\D/g,""));setErr("");}}/>
            {err&&<p className="text-red-500 text-xs mt-1">{err}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={()=>setEditing(null)} className={`${s.btnGhost} flex-1`}>Cancel</button>
              <button onClick={save} disabled={saving} className={`${s.btnDark} flex-1`}>{saving?"Saving…":"Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MY PIN ───────────────────────────────────────────────────────────────────
function MyPin({user,users}) {
  const me=users.find(u=>u.name===user.name&&u.role===user.role);
  return (
    <div className="max-w-sm mx-auto px-4 py-8">
      <h2 className="text-2xl font-black text-gray-900 mb-6">My PIN</h2>
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
        <p className="text-sm text-gray-500 mb-2">{user.name}</p>
        <p className="text-5xl font-black font-mono text-gray-900 tracking-widest mb-3">{me?.pin||"——"}</p>
        <p className="text-xs text-gray-400">Contact Admin to update your PIN</p>
      </div>
    </div>
  );
}


// ─── REPORTS VIEW ─────────────────────────────────────────────────────────────
function ReportsView({cases}) {
  const [sortBy, setSortBy] = useState("checkoutDate");
  const [search, setSearch] = useState("");
  useEffect(()=>window.scrollTo({top:0,behavior:"smooth"}),[sortBy]);

  const SORTS = [
    ["collectionDate","COLLECTION DATE"],
    ["prepType","PREP TYPE"],
    ["funeralDir","FUNERAL DIRECTOR"],
    ["transferTeam","TRANSFER TEAM"],
    ["lastName","LAST NAME"],
    ["status","STATUS"],
  ];
  const STATUS_FILTERS=["ALL","NOT STARTED","IN PROGRESS","READY"];
  const [statusFilter,setStatusFilter]=useState("ALL");

  // ── Weekly Report: Friday 5:01pm to this Friday 5:00pm ─────────────────────
  function getWeeklyWindow() {
    const now = new Date();
    // Find last Friday 5:01pm
    const day = now.getDay(); // 0=Sun, 5=Fri
    const daysToLastFri = day >= 5 ? day - 5 : day + 2;
    const lastFri = new Date(now);
    lastFri.setDate(now.getDate() - daysToLastFri);
    lastFri.setHours(17, 1, 0, 0);
    // This Friday 5:00pm
    const thisFri = new Date(lastFri);
    thisFri.setDate(lastFri.getDate() + 7);
    thisFri.setHours(17, 0, 0, 0);
    return { from: lastFri, to: thisFri };
  }

  function downloadWeeklyReport() {
    const { from, to } = getWeeklyWindow();
    const weekly = cases.filter(c => {
      if(!c.checkout?.checkedOutAt) return false;
      const d = new Date(c.checkout.checkedOutAt);
      return d >= from && d <= to;
    }).sort((a,b)=>new Date(a.checkout.checkedOutAt)-new Date(b.checkout.checkedOutAt));

    if(weekly.length === 0) {
      alert(`No check-outs found between:\n${from.toLocaleString("en-AU")} and ${to.toLocaleString("en-AU")}`);
      return;
    }

    // Build CSV with formatting
    const fromStr = from.toLocaleDateString("en-AU",{day:"2-digit",month:"2-digit",year:"numeric"});
    const toStr = to.toLocaleDateString("en-AU",{day:"2-digit",month:"2-digit",year:"numeric"});

    const headers = [
      "Case Ref","Last Name","First Name","DOB","DOD","Age at Death","Sex",
      "Funeral Director","Preparation","Disposition","Destination",
      "Checked In","Checked In By","Check In Role",
      "Transferred From","Transferred By","Transfer Person","Paperwork","Valuables",
      "Checked Out","Checked Out By","Signed By","Viewing"
    ];

    const rows = weekly.map(c => {
      const prep = c.prep||{};
      const co = c.checkout||{};
      return [
        c.caseRef||"",
        c.lastName||"",
        c.firstName||"",
        fmt(c.dob),
        fmt(c.dod),
        c.ageAtDeath!==null&&c.ageAtDeath!==undefined?c.ageAtDeath:"",
        c.sex||"",
        c.funeralHomeName||"",
        (prep.prepOptions||[]).map(p=>PREP_OPTIONS.find(x=>x.label===p)?.short||p).join(", ")||"",
        prep.disposition||"",
        co.destination||"",
        c.checkedInAt?new Date(c.checkedInAt).toLocaleString("en-AU"):"",
        c.checkedInBy||"",
        c.checkedInRole||"",
        c.transferredFrom||"",
        c.transferredBy||"",
        c.transferPersonName||"",
        c.paperwork||"",
        c.valuables||"",
        co.checkedOutAt?new Date(co.checkedOutAt).toLocaleString("en-AU"):"",
        co.checkedOutBy||"",
        co.signedName||"",
        prep.viewing||(prep.viewingSlot?"Yes":""),
      ];
    });

    // Build CSV string
    const title = `MSS WEEKLY CHECK-OUT REPORT — ${fromStr} to ${toStr}`;
    const csvLines = [
      [title],
      [`Generated: ${new Date().toLocaleString("en-AU")}`],
      [`Total Check-Outs: ${weekly.length}`],
      [],
      headers,
      ...rows
    ];

    const csv = csvLines.map(row =>
      row.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(",")
    ).join("\n");

    // Download
    const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MSS_Weekly_Report_${fromStr.replace(/\//g,"-")}_to_${toStr.replace(/\//g,"-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getSortValue(c, key) {
    switch(key) {
      case "collectionDate": return c.prep?.collectionDate || "9999";
      case "prepType":      return (c.prep?.prepOptions||[]).join(", ") || "—";
      case "funeralDir":    return c.funeralHomeName || "—";
      case "transferTeam":  return c.transferredBy || "—";
      case "lastName":      return c.lastName || "—";
      case "status":        return String(STATUS_ORDER[c.prepStatus||"not-started"]||0);
      default: return "—";
    }
  }

  function getSortLabel(c, key) {
    switch(key) {
      case "checkoutDate":  return c.checkout?.checkedOutAt ? fmtDT(c.checkout.checkedOutAt) : "Not checked out";
      case "prepType":      return (c.prep?.prepOptions||[]).map(p=>PREP_OPTIONS.find(x=>x.label===p)?.short||p).join(", ") || "No Prep";
      case "funeralDir":    return c.funeralHomeName || "—";
      case "transferTeam":  return c.transferredBy || "—";
      case "lastName":      return `${(c.lastName||"").toUpperCase()}, ${c.firstName}`;
      default: return "—";
    }
  }

  const filtered = cases
    .filter(c => {
      // Status filter
      if(statusFilter==="NOT STARTED"&&(c.prepStatus||"not-started")!=="not-started") return false;
      if(statusFilter==="IN PROGRESS"&&c.prepStatus!=="in-progress") return false;
      if(statusFilter==="READY"&&c.prepStatus!=="completed") return false;
      if(!search.trim()) return true;
      const q = search.toLowerCase();
      return `${c.firstName} ${c.lastName} ${c.caseRef} ${c.funeralHomeName} ${c.transferredBy} ${(c.prep?.prepOptions||[]).join(" ")}`.toLowerCase().includes(q);
    })
    .sort((a,b) => {
      const av = getSortValue(a, sortBy);
      const bv = getSortValue(b, sortBy);
      // Dates sort newest first, text sorts A-Z
      if(sortBy === "collectionDate") return av.localeCompare(bv);
      return av.localeCompare(bv);
    });

  // Group by sort value for visual separation
  const groups = [];
  let lastGroup = null;
  filtered.forEach(c => {
    const groupKey = getSortLabel(c, sortBy);
    if(groupKey !== lastGroup) { groups.push({ key: groupKey, cases: [] }); lastGroup = groupKey; }
    groups[groups.length-1].cases.push(c);
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900">Reports</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{filtered.length} cases</span>
          <button onClick={downloadWeeklyReport}
            className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-700 text-white font-black text-xs uppercase tracking-wide transition flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            WEEKLY REPORT
          </button>
        </div>
      </div>

      {/* Search */}
      <input className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 text-base focus:outline-none focus:border-gray-800 transition placeholder-gray-400 mb-4"
        placeholder="Search by name, case ref, funeral home, transfer team…"
        value={search} onChange={e=>setSearch(e.target.value)}/>

      {/* Sort buttons */}
      <div className="mb-6">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Sort By</p>
        <div className="flex flex-wrap gap-2">
          {SORTS.map(([key,label])=>(
            <button key={key} onClick={()=>setSortBy(key)}
              className={`px-4 py-2.5 rounded-xl border-2 text-sm font-bold transition ${sortBy===key?"bg-gray-900 text-white border-gray-900":"bg-white text-gray-600 border-gray-300 hover:border-gray-700"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length===0&&<p className="text-gray-400 text-center py-12">No cases found.</p>}

      {/* Grouped results */}
      <div className="space-y-6">
        {groups.map(group=>(
          <div key={group.key}>
            {/* Group header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="text-xs font-black text-gray-500 uppercase tracking-widest bg-gray-100 rounded-lg px-3 py-1.5">{group.key}</div>
              <div className="text-xs text-gray-400">{group.cases.length} case{group.cases.length>1?"s":""}</div>
            </div>

            {/* Cases in group */}
            <div className="space-y-2">
              {group.cases.map(c=>(
                <div key={c.id} className="bg-white border border-gray-200 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <StatusDot status={c.prepStatus||"not-started"}/>
                        <span className="text-base font-black text-gray-900">{(c.lastName||"").toUpperCase()}, {c.firstName}</span>
                        <span className="text-xs font-bold text-gray-400">{c.caseRef}</span>
                        {c.checkedOut&&<span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 rounded-full px-2 py-0.5 font-semibold">Departed</span>}
                        {c.status==="locked"&&<span className="text-xs bg-gray-900 text-white rounded-full px-2 py-0.5 font-semibold">Locked</span>}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 text-xs text-gray-500 ml-6">
                        <span>FD: <span className="text-gray-800 font-medium">{c.funeralHomeName||"—"}</span></span>
                        <span>In: <span className="text-gray-800 font-medium">{fmtDT(c.checkedInAt)}</span></span>
                        <span>Out: <span className="text-gray-800 font-medium">{c.checkout?.checkedOutAt?fmtDT(c.checkout.checkedOutAt):"—"}</span></span>
                        <span>Prep: <span className="text-gray-800 font-medium">{(c.prep?.prepOptions||[]).map(p=>PREP_OPTIONS.find(x=>x.label===p)?.short||p).join(", ")||"—"}</span></span>
                        <span>Transfer: <span className="text-gray-800 font-medium">{c.transferredBy||"—"}</span></span>
                        <span>DOD: <span className="text-gray-800 font-medium">{fmt(c.dod)}</span></span>
                        {c.prep?.disposition&&<span>Disposition: <span className="text-gray-800 font-medium">{c.prep.disposition}</span></span>}
                        {c.checkout?.destination&&<span>Dest: <span className="text-gray-800 font-medium">{c.checkout.destination}</span></span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CALENDAR ─────────────────────────────────────────────────────────────────
const CALENDAR_SLOTS=[];
for(let h=8;h<=20;h++){
  CALENDAR_SLOTS.push({hour:h,half:false,label:`${String(h).padStart(2,"0")}:00`});
  if(h<20) CALENDAR_SLOTS.push({hour:h,half:true,label:`${String(h).padStart(2,"0")}:30`});
}

function getWeekDates(base){
  const dates=[];
  const d=new Date(base);
  const day=d.getDay();
  d.setDate(d.getDate()-day);
  for(let i=0;i<7;i++){const dd=new Date(d);dd.setDate(d.getDate()+i);dates.push(dd.toISOString().slice(0,10));}
  return dates;
}

function CalendarView({user,cases,calendarBookings,onAddBooking,onUpdateBooking,onDeleteBooking}){
  const[weekBase,setWeekBase]=useState(today());
  const[showBookModal,setShowBookModal]=useState(false);
  const[editingBooking,setEditingBooking]=useState(null); // booking being viewed/edited
  const[bookSlot,setBookSlot]=useState(null);
  const[bookDuration,setBookDuration]=useState("1 HOUR");
  const[bookType,setBookType]=useState("Viewing Room");
  const[careType,setCareType]=useState("");
  const[selFHId,setSelFHId]=useState("");
  const[selCaseId,setSelCaseId]=useState("");
  const[notInCareRef,setNotInCareRef]=useState("");
  const[saving,setSaving]=useState(false);
  useEffect(()=>window.scrollTo({top:0,behavior:"smooth"}),[]);

  const isFD=user?.role==="fd";
  const canEdit=user?.role==="admin"||user?.role==="mss";
  const weekDates=getWeekDates(weekBase);

  function prevWeek(){const d=new Date(weekDates[0]);d.setDate(d.getDate()-7);setWeekBase(d.toISOString().slice(0,10));}
  function nextWeek(){const d=new Date(weekDates[0]);d.setDate(d.getDate()+7);setWeekBase(d.toISOString().slice(0,10));}

  function resetModal(){
    setShowBookModal(false);setEditingBooking(null);setBookSlot(null);
    setCareType("");setSelFHId("");setSelCaseId("");setNotInCareRef("");
    setBookType("Viewing Room");setBookDuration("1 HOUR");
  }

  function openEdit(booking){
    setEditingBooking(booking);
    setBookSlot(booking.slot);
    setBookType(booking.type||"Viewing Room");
    setBookDuration(booking.duration||"1 HOUR");
    setCareType(booking.care_type||"");
    setSelFHId(booking.funeral_home_id||"");
    setSelCaseId(booking.case_id||"");
    setNotInCareRef(booking.not_in_care_ref||"");
    setShowBookModal(true);
  }

  const slotMap={};
  cases.filter(c=>c.prep?.viewingSlot&&c.prep?.viewing==="Yes").forEach(c=>{
    const slot=c.prep.viewingSlot;
    const[date,time]=slot.split("_");
    const isHalf=time.includes(":30");
    const hour=parseInt(time.split(":")[0]);
    const key=`${date}_${hour}_${isHalf?"half":"full"}`;
    slotMap[key]={type:"Viewing",label:`${(c.lastName||"").toUpperCase()}, ${c.firstName}`,fhId:c.funeralHomeId,color:"green",fromCase:true};
  });
  (calendarBookings||[]).forEach(b=>{
    const[date,time]=b.slot.split("_");
    const isHalf=time.includes(":30");
    const hour=parseInt(time.split(":")[0]);
    const key=`${date}_${hour}_${isHalf?"half":"full"}`;
    const dur=b.duration?` (${b.duration})`:"";
    slotMap[key]={type:b.type,label:(b.deceased_label||b.type)+dur,fhId:b.funeral_home_id||null,color:b.type==="Viewing Room"?"green":"blue",bookingId:b.id,booking:b};
  });

  const activeCases=cases.filter(c=>c.status==="active"&&!c.checkedOut);
  const casesByFH={};
  activeCases.forEach(c=>{if(!casesByFH[c.funeralHomeId])casesByFH[c.funeralHomeId]=[];casesByFH[c.funeralHomeId].push(c);});
  const fhsWithCases=sortAlpha(FUNERAL_HOMES.filter(f=>casesByFH[f.id]?.length>0),"name");
  const fhCasesForSel=selFHId?(casesByFH[selFHId]||[]).sort((a,b)=>a.lastName.localeCompare(b.lastName)):[];

  function getBookingLabel(){
    if(careType==="in-care"&&selCaseId){const c=cases.find(x=>x.id===selCaseId);return c?`${(c.lastName||"").toUpperCase()}, ${c.firstName}`:""; }
    if(careType==="not-in-care"&&selFHId&&notInCareRef){const fh=FUNERAL_HOMES.find(f=>f.id===selFHId);return`${fh?.name||""} - ${notInCareRef}`;}
    return bookType;
  }

  const canConfirm=bookSlot&&bookType&&bookDuration&&careType&&(careType==="in-care"?!!selCaseId:(!!selFHId&&notInCareRef.trim().length>0));

  async function confirmBooking(){
    if(!canConfirm)return;
    setSaving(true);
    try{
      const fhId=careType==="in-care"?cases.find(c=>c.id===selCaseId)?.funeralHomeId:selFHId;
      const data={slot:bookSlot,type:bookType,duration:bookDuration,funeral_home_id:fhId||null,deceased_label:getBookingLabel(),care_type:careType,case_id:careType==="in-care"?selCaseId:null,not_in_care_ref:careType==="not-in-care"?notInCareRef:null,booked_by:user.name};

      if(editingBooking){
        // Update existing booking
        await sb(`calendar_bookings?id=eq.${editingBooking.id}`,{method:"PATCH",body:JSON.stringify(data),prefer:"return=representation"});
        onUpdateBooking({...editingBooking,...data});
      } else {
        // New booking
        const booking={id:genId(),...data,booked_at:new Date().toISOString()};
        await insertCalendarBooking(booking);
        onAddBooking(booking);
      }
      resetModal();
    }catch(err){alert("Booking error: "+err.message);}
    setSaving(false);
  }

  async function removeBooking(bookingId){
    if(!window.confirm("Remove this booking?"))return;
    try{await deleteCalendarBooking(bookingId);onDeleteBooking(bookingId);resetModal();}
    catch(err){alert("Error: "+err.message);}
  }

  // Check if current user can edit a slot
  function canEditSlot(slot){
    if(!slot) return false;
    if(slot.fromCase) return false; // case-derived viewings managed in Mortuary
    if(canEdit) return true; // admin/mss can always edit
    if(isFD&&slot.fhId===user.funeralHomeId) return true; // FD can edit their own
    return false;
  }

  function handleSlotClick(slot,slotId){
    if(!slot){
      if(canEdit){setBookSlot(slotId);setShowBookModal(true);}
      return;
    }
    if(slot.fromCase){
      if(canEdit) alert(`VIEWING\n${slot.label}\nBooked via Mortuary screen`);
      return;
    }
    if(canEditSlot(slot)){
      openEdit(slot.booking);
    } else if(isFD&&slot.fhId!==user.funeralHomeId){
      // Other FD booking — show busy, no action
    }
  }

  return(
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-black text-gray-900 uppercase">Calendar</h2>
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className={`${s.btnGhost} py-2 px-4`}>← PREV</button>
          <span className="text-xs font-black text-gray-600 uppercase px-2">{fmt(weekDates[0])} – {fmt(weekDates[6])}</span>
          <button onClick={nextWeek} className={`${s.btnDark} py-2 px-4`}>NEXT →</button>
        </div>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-green-500"/><span className="text-xs font-black uppercase text-gray-600">Viewing Room</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-blue-500"/><span className="text-xs font-black uppercase text-gray-600">Family Meeting Room</span></div>
        {isFD&&<div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-gray-300"/><span className="text-xs font-black uppercase text-gray-600">Unavailable</span></div>}
      </div>

      <div className="flex gap-3 mb-5">
        {canEdit&&<button onClick={()=>{resetModal();setShowBookModal(true);}} className={`${s.btnDark} py-3`}>+ BOOK A ROOM</button>}
        <button onClick={()=>window.print()} className={`${s.btnGhost} py-3`}>🖨️ PRINT WEEK</button>
      </div>

      <div className="overflow-x-auto -mx-4 px-4">
        <div style={{minWidth:"520px"}}>
          <div className="grid gap-1 mb-1" style={{gridTemplateColumns:"48px repeat(7, 1fr)"}}>
            <div className="text-xs font-black uppercase text-gray-400 p-1">TIME</div>
            {weekDates.map(d=>{const dd=new Date(d);const isToday=d===today();return<div key={d} className={`text-xs font-black uppercase text-center p-1.5 rounded-lg ${isToday?"bg-gray-900 text-white":"bg-gray-100 text-gray-700"}`}>{dd.toLocaleDateString("en-AU",{weekday:"short"})}<br/><span className="text-xs">{dd.toLocaleDateString("en-AU",{day:"numeric",month:"short"})}</span></div>;})}
          </div>

          {CALENDAR_SLOTS.map(({hour,half,label})=>(
            <div key={label} className="grid gap-1 mb-0.5" style={{gridTemplateColumns:"48px repeat(7, 1fr)"}}>
              <div className={`text-xs font-black p-1 flex items-center ${half?"text-gray-300":"text-gray-500"}`} style={{fontSize:"10px"}}>{label}</div>
              {weekDates.map(date=>{
                const key=`${date}_${hour}_${half?"half":"full"}`;
                const slot=slotMap[key];
                const slotId=`${date}_${label}`;
                const editable=canEditSlot(slot)||(isFD&&slot?.fhId===user.funeralHomeId);

                if(isFD){
                  const mine=slot?.fhId===user.funeralHomeId;
                  const blocked=slot&&!mine;
                  if(mine)return(
                    <button key={date} onClick={()=>handleSlotClick(slot,slotId)}
                      className="rounded p-1 min-h-[26px] text-xs font-bold uppercase bg-green-100 border border-green-400 text-green-800 text-left hover:bg-green-200 transition">
                      <span className="truncate block">{slot.label}</span>
                      {!slot.fromCase&&<span className="text-green-600 text-xs">TAP TO EDIT</span>}
                    </button>
                  );
                  if(blocked)return<div key={date} className="rounded p-1 min-h-[26px] text-xs font-bold uppercase bg-gray-200 text-gray-400 flex items-center justify-center">BUSY</div>;
                  return<div key={date} className={`rounded p-1 min-h-[26px] border border-gray-100 ${half?"bg-gray-50":"bg-white"}`}/>;
                }

                if(slot)return(
                  <button key={date} onClick={()=>handleSlotClick(slot,slotId)}
                    className={`rounded p-1 min-h-[26px] text-xs font-bold uppercase text-left transition hover:opacity-80 ${slot.color==="green"?"bg-green-100 border border-green-400 text-green-800":"bg-blue-100 border border-blue-400 text-blue-800"}`}>
                    <span className="truncate block">{slot.label}</span>
                    {!slot.fromCase&&<span className="opacity-60 text-xs">TAP TO EDIT</span>}
                  </button>
                );

                return canEdit
                  ?<button key={date} onClick={()=>handleSlotClick(null,slotId)} className={`rounded p-1 min-h-[26px] border border-gray-100 hover:border-gray-400 hover:bg-gray-100 transition text-gray-200 font-black text-xs text-center ${half?"bg-gray-50":"bg-white"}`}>+</button>
                  :<div key={date} className={`rounded p-1 min-h-[26px] border border-gray-100 ${half?"bg-gray-50":"bg-white"}`}/>;
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Book / Edit Modal */}
      {showBookModal&&(canEdit||isFD)&&(
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-6 px-4 overflow-y-auto">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xl w-full max-w-md mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-gray-900 uppercase">{editingBooking?"EDIT BOOKING":"BOOK A ROOM"}</h3>
              <button onClick={resetModal} className="text-gray-400 hover:text-gray-700 font-black text-xl leading-none">✕</button>
            </div>

            {/* Slot */}
            {/* Date picker */}
            <div className="mb-3">
              <label className={s.label}>DATE</label>
              <input type="date" className={s.inp}
                value={bookSlot?bookSlot.split("_")[0]:""}
                onChange={e=>{
                  const d=e.target.value;
                  const t=bookSlot?bookSlot.split("_")[1]:"09:00";
                  if(d) setBookSlot(`${d}_${t}`);
                }}/>
            </div>
            {/* Time picker — hour buttons */}
            <div className="mb-3">
              <label className={s.label}>START TIME</label>
              <div className="grid grid-cols-4 gap-1.5">
                {["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30"].map(t=>{
                  const cur=bookSlot?bookSlot.split("_")[1]:"";
                  const d=bookSlot?bookSlot.split("_")[0]:today();
                  return(
                    <button key={t} type="button" onClick={()=>setBookSlot(`${d}_${t}`)}
                      className={`py-2 rounded-lg border-2 text-xs font-black uppercase transition ${cur===t?"bg-gray-900 text-white border-gray-900":"bg-white text-gray-600 border-gray-200 hover:border-gray-600"}`}>
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Duration */}
            <div className="mb-4">
              <label className={s.label}>DURATION</label>
              <div className="flex gap-2">
                {["1 HOUR","2 HOURS"].map(d=>(
                  <button key={d} type="button" onClick={()=>setBookDuration(d)}
                    className={`flex-1 py-3 rounded-xl border-2 font-black text-sm uppercase transition ${bookDuration===d?"bg-gray-900 text-white border-gray-900":"border-gray-300 text-gray-600 hover:border-gray-700"}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            {bookSlot&&(
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 mb-3">
                <span className="text-xs font-black text-gray-500 uppercase">BOOKED: </span>
                <span className="text-sm font-black text-gray-900 uppercase">{fmt(bookSlot.split("_")[0])} AT {bookSlot.split("_")[1]} — {bookDuration}</span>
              </div>
            )}

            {/* Room type */}
            <div className="mb-4">
              <label className={s.label}>ROOM TYPE</label>
              <div className="flex gap-2">
                <button onClick={()=>setBookType("Viewing Room")} className={`flex-1 py-3 rounded-xl border-2 font-black text-sm uppercase transition ${bookType==="Viewing Room"?"bg-green-600 text-white border-green-600":"border-gray-300 text-gray-600 hover:border-gray-700"}`}>VIEWING ROOM</button>
                <button onClick={()=>setBookType("Family Meeting Room")} className={`flex-1 py-3 rounded-xl border-2 font-black text-sm uppercase transition ${bookType==="Family Meeting Room"?"bg-blue-600 text-white border-blue-600":"border-gray-300 text-gray-600 hover:border-gray-700"}`}>FAMILY MEETING</button>
              </div>
            </div>

            {/* Deceased status — FD only sees their own cases */}
            <div className="mb-4">
              <label className={s.label}>DECEASED STATUS</label>
              <div className="flex gap-2 mb-3">
                <button onClick={()=>{setCareType("in-care");setSelFHId(isFD?user.funeralHomeId:"");setSelCaseId("");setNotInCareRef("");}} className={`flex-1 py-3 rounded-xl border-2 font-black text-sm uppercase transition ${careType==="in-care"?"bg-gray-900 text-white border-gray-900":"border-gray-300 text-gray-600 hover:border-gray-700"}`}>IN CARE</button>
                <button onClick={()=>{setCareType("not-in-care");setSelFHId(isFD?user.funeralHomeId:"");setSelCaseId("");setNotInCareRef("");}} className={`flex-1 py-3 rounded-xl border-2 font-black text-sm uppercase transition ${careType==="not-in-care"?"bg-gray-900 text-white border-gray-900":"border-gray-300 text-gray-600 hover:border-gray-700"}`}>NOT IN CARE</button>
              </div>

              {careType==="in-care"&&(
                <div>
                  {!isFD&&(
                    <div className="mb-3">
                      <label className={s.label}>FUNERAL DIRECTOR</label>
                      <div className="flex flex-wrap gap-2">
                        {fhsWithCases.length===0&&<p className="text-xs font-bold text-gray-400 uppercase">No active cases</p>}
                        {fhsWithCases.map(fh=><button key={fh.id} onClick={()=>{setSelFHId(fh.id);setSelCaseId("");}} className={s.tb(selFHId===fh.id)}>{fh.name}</button>)}
                      </div>
                    </div>
                  )}
                  {selFHId&&(casesByFH[selFHId]||[]).length>0&&(
                    <div>
                      <label className={s.label}>SELECT DECEASED</label>
                      <div className="flex flex-col gap-2">
                        {(casesByFH[selFHId]||[]).sort((a,b)=>a.lastName.localeCompare(b.lastName)).map(c=>(
                          <button key={c.id} onClick={()=>setSelCaseId(c.id)} className={`py-3 px-4 rounded-xl border-2 font-black text-sm uppercase text-left transition ${selCaseId===c.id?"bg-gray-900 text-white border-gray-900":"border-gray-200 hover:border-gray-700"}`}>
                            {(c.lastName||"").toUpperCase()}, {c.firstName}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {selFHId&&(casesByFH[selFHId]||[]).length===0&&<p className="text-xs font-bold text-gray-400 uppercase">No active cases for this FD</p>}
                </div>
              )}

              {careType==="not-in-care"&&(
                <div>
                  {!isFD&&(
                    <div className="mb-3">
                      <label className={s.label}>FUNERAL DIRECTOR</label>
                      <div className="flex flex-wrap gap-2">
                        {sortAlpha(FUNERAL_HOMES,"name").map(fh=><button key={fh.id} onClick={()=>{setSelFHId(fh.id);setNotInCareRef("");}} className={s.tb(selFHId===fh.id)}>{fh.name}</button>)}
                      </div>
                    </div>
                  )}
                  {selFHId&&(
                    <div>
                      <label className={s.label}>REF: NAME</label>
                      <input className={s.inp} placeholder="Enter reference name…" value={notInCareRef} onChange={e=>setNotInCareRef(e.target.value)}/>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Booking details summary if editing */}
            {editingBooking&&(
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4 text-xs font-bold text-gray-600 uppercase">
                <div>Booked by: {editingBooking.booked_by}</div>
                <div>Date: {fmtDT(editingBooking.booked_at)}</div>
              </div>
            )}

            <div className="flex gap-3 pt-3 border-t border-gray-100">
              {editingBooking&&(
                <button onClick={()=>removeBooking(editingBooking.id)} className="px-4 py-3 rounded-xl border-2 border-red-300 text-red-600 font-black text-sm uppercase hover:bg-red-50 transition">DELETE</button>
              )}
              <button onClick={resetModal} className={`${s.btnGhost} flex-1 py-3`}>CANCEL</button>
              <button onClick={confirmBooking} disabled={!canConfirm||saving} className={`${s.btnDark} flex-1 py-3 disabled:opacity-40`}>{saving?"SAVING…":editingBooking?"SAVE CHANGES":"CONFIRM"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



// ─── APP ──────────────────────────────────────────────────────────────────────
const getCalendarBookings=()=>sb("calendar_bookings?select=*").catch(()=>[]);
const insertCalendarBooking=b=>sb("calendar_bookings",{method:"POST",body:JSON.stringify(b),prefer:"return=representation"});
const deleteCalendarBooking=id=>sb(`calendar_bookings?id=eq.${id}`,{method:"DELETE"});

export default function App() {
  const [users,setUsers]=useState([]);
  const [cases,setCases]=useState([]);
  const [calendarBookings,setCalendarBookings]=useState([]);
  const [loading,setLoading]=useState(true);
  const [user,setUser]=useState(null);
  const [tab,setTab]=useState("home");
  const [action,setAction]=useState(null);

  useEffect(()=>{
    function preventTabScroll(e){
      if(e.key==="Tab"){e.preventDefault();const focusable=document.querySelectorAll('button, input, select, textarea, a[href]');const arr=Array.from(focusable).filter(el=>!el.disabled&&el.offsetParent!==null);const idx=arr.indexOf(document.activeElement);const next=e.shiftKey?arr[idx-1]||arr[arr.length-1]:arr[idx+1]||arr[0];if(next)next.focus({preventScroll:true});}
    }
    document.addEventListener("keydown",preventTabScroll);
    return()=>document.removeEventListener("keydown",preventTabScroll);
  },[]);

  useEffect(()=>{
    Promise.all([getUsers(),getCases(),getCalendarBookings()]).then(([u,c,b])=>{
      setUsers(u);
      setCases(c.map(dbToCase));
      setCalendarBookings(b||[]);
    }).catch(err=>console.error("Load error:",err))
    .finally(()=>setLoading(false));
  },[]);

  function handleLogin(u){setUser(u);setTab("home");setAction(null);}
  function handleLogout(){setUser(null);setTab("home");setAction(null);}

  // Auto-logout after 2 minutes of inactivity
  useEffect(()=>{
    if(!user) return;
    let timer;
    function reset(){
      clearTimeout(timer);
      timer=setTimeout(()=>{
        handleLogout();
        alert("You have been logged out due to inactivity.");
      }, 5 * 60 * 1000);
    }
    const events=["mousedown","mousemove","keydown","scroll","touchstart","click"];
    events.forEach(e=>window.addEventListener(e,reset));
    reset(); // start timer
    return()=>{
      clearTimeout(timer);
      events.forEach(e=>window.removeEventListener(e,reset));
    };
  },[user]);
  function handleComplete(r){setCases(prev=>[r,...prev]);setAction(null);window.scrollTo({top:0,behavior:"smooth"});}
  function handleUpdateCase(id,updates){setCases(prev=>prev.map(c=>c.id===id?{...c,...updates}:c));}
  function handlePinUpdate(uid,pin){setUsers(prev=>prev.map(u=>u.id===uid?{...u,pin}:u));}
  function handleAddBooking(b){setCalendarBookings(prev=>[...prev,b]);}
  function handleUpdateBooking(b){setCalendarBookings(prev=>prev.map(x=>x.id===b.id?b:x));}
  function handleDeleteBooking(id){setCalendarBookings(prev=>prev.filter(b=>b.id!==id));}

  if(loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <MSSLogo size="md"/>
        <div className="mt-8"><Spinner/></div>
        <p className="text-gray-400 text-sm font-bold uppercase mt-4">Loading…</p>
      </div>
    </div>
  );

  if(!user) return <LoginScreen onLogin={handleLogin} users={users}/>;

  const isAdmin=user.role==="admin";
  const isMSS=user.role==="mss"||isAdmin;
  const isFD=user.role==="fd";
  const isTransfer=user.role==="transfer";

  const wrap=(children)=>(
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header user={user} onSignOut={handleLogout} onNav={t=>{setTab(t);setAction(null);}} activeTab={tab}/>
      {children}
      {(isMSS||isAdmin)&&<BottomNav onAction={a=>{setAction(a);window.scrollTo({top:0,behavior:"smooth"});}} onNav={t=>{setTab(t);setAction(null);window.scrollTo({top:0,behavior:"smooth"});}} activeTab={tab} action={action}/>}
    </div>
  );

  if(action==="reports") return wrap(<ReportsView cases={cases}/>);
  if(action==="approvals") return wrap(<ApprovalsView user={user} cases={cases} onUpdateCase={handleUpdateCase} onBack={()=>setAction(null)}/>);
  if(action==="lockview") return wrap(<LockView cases={cases} onUpdateCase={handleUpdateCase} onBack={()=>setAction(null)}/>);
  if(action==="checkin") return wrap(<CheckInFlow user={user} cases={cases} onComplete={handleComplete} onBack={()=>setAction(null)}/>);
  if(action==="mortuary") return wrap(<MortuaryFlow user={user} cases={cases} onUpdateCase={handleUpdateCase} onBack={()=>setAction(null)}/>);
  if(action==="checkout") return wrap(<CheckOutFlow user={user} cases={cases} onUpdateCase={handleUpdateCase} onBack={()=>setAction(null)}/>);
  if(action==="mycases") return wrap(<MyCases user={user} cases={cases} onUpdateCase={handleUpdateCase}/>);
  if(action==="transfers") return wrap(<MyTransfers user={user} cases={cases}/>);
  if(action==="calendar") return wrap(<CalendarView user={user} cases={cases} calendarBookings={calendarBookings} onAddBooking={handleAddBooking} onUpdateBooking={handleUpdateBooking} onDeleteBooking={handleDeleteBooking}/>);

  return wrap(
    <main>
      {tab==="home"&&<HomeScreen user={user} onAction={a=>setAction(a)}/>}
      {tab==="records"&&(isMSS||isAdmin)&&<RecordsView user={user} cases={cases} onUpdateCase={handleUpdateCase}/>}
      {tab==="reports"&&(isMSS||isAdmin)&&<ReportsView cases={cases}/>}
      {tab==="calendar"&&(isMSS||isAdmin||isFD)&&<CalendarView user={user} cases={cases} calendarBookings={calendarBookings} onAddBooking={handleAddBooking} onUpdateBooking={handleUpdateBooking} onDeleteBooking={handleDeleteBooking}/>}
      {tab==="records"&&isFD&&<MyCases user={user} cases={cases} onUpdateCase={handleUpdateCase}/>}
      {tab==="mycases"&&isFD&&<MyCases user={user} cases={cases} onUpdateCase={handleUpdateCase}/>}
      {tab==="transfers"&&isTransfer&&<MyTransfers user={user} cases={cases}/>}
      {tab==="pins"&&isAdmin&&<PinManagement users={users} onPinUpdate={handlePinUpdate}/>}
      {tab==="mypin"&&isMSS&&!isAdmin&&<MyPin user={user} users={users}/>}
    </main>
  );
}
