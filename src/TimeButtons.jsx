import React, { useState } from "react";

// 06:00 → 20:00 every 30 minutes
export const TIME_SLOTS = [];
for (let h = 6; h <= 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 20) TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

// Tap a time; tap again to clear. "Other" allows any time (e.g. after-hours transfers).
export default function TimeButtons({ value, onChange, allowOther = true }) {
  const isOther = !!value && !TIME_SLOTS.includes(value);
  const [showOther, setShowOther] = useState(isOther);
  const b = on => `py-1.5 rounded-lg border-2 text-xs font-black transition ${on ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-600"}`;
  return (
    <div>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1">
        {TIME_SLOTS.map(t => (
          <button key={t} type="button" onClick={() => { setShowOther(false); onChange(value === t ? "" : t); }} className={b(value === t)}>{t}</button>
        ))}
        {allowOther && <button type="button" onClick={() => setShowOther(!showOther)} className={b(showOther || isOther)}>Other</button>}
      </div>
      {allowOther && (showOther || isOther) && (
        <input type="time" className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm mt-2" value={value || ""} onChange={e => onChange(e.target.value)} />
      )}
    </div>
  );
}
