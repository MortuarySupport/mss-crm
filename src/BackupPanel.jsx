import React, { useEffect, useState } from "react";

// Admin dashboard card: status of the nightly OneDrive backup (runs on the Mac)
export default function BackupPanel({ sb }) {
  const [last, setLast] = useState(undefined);
  useEffect(() => {
    sb("app_settings?key=eq.backup_last_run&select=value")
      .then(rows => { try { setLast(JSON.parse(rows?.[0]?.value || "null")); } catch (e) { setLast(null); } })
      .catch(() => setLast(null));
  }, []);
  const when = d => new Date(d).toLocaleString("en-AU", { timeZone: "Australia/Sydney", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const stale = last?.at && Date.now() - new Date(last.at).getTime() > 2 * 864e5;
  const bad = !last || stale || last.errors?.length;
  return (
    <div className="mt-6">
      <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">OneDrive backup</p>
      <div className={`border-2 rounded-2xl p-4 text-sm ${bad ? "bg-amber-50 border-amber-300" : "bg-white border-gray-200"}`}>
        {last === undefined ? <span className="text-gray-400">Loading…</span>
          : !last ? <div className="font-black text-amber-900">☁️ No backup has run yet — check the backup is installed on the Mac.</div>
          : <>
            <div className="font-black text-gray-900">{stale ? "⚠️ " : "☁️ "}Last backup: {when(last.at)} · {last.by}</div>
            <div className="text-gray-600 text-xs mt-1">{last.backedUp?.length || 0} case(s) backed up, {last.deleted?.length || 0} cleared from the app.</div>
            {stale && <div className="text-amber-900 text-xs font-bold mt-1">No backup for over 2 days — turn on the Mac (and make sure OneDrive is running).</div>}
            {last.errors?.length > 0 && <ul className="text-xs text-red-600 mt-2 list-disc pl-5">{last.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul>}
          </>}
        <div className="text-gray-500 text-xs mt-2">Files are copied to OneDrive 7 days after check-out, then removed from the app at 30 days.</div>
      </div>
    </div>
  );
}
