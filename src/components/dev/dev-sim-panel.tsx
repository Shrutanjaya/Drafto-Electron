import { useEffect, useState } from 'react';
import { FlaskConical, X } from 'lucide-react';
import {
  SIM_ENABLED,
  SIM_PRESETS,
  getSim,
  setSimPreset,
  clearSim,
  subscribeSim,
  type SimPreset,
} from '@/lib/dev/sim-entitlement';

/**
 * Dev-only floating panel to simulate subscription / device states without
 * touching real Firestore or Razorpay. Renders nothing in production builds.
 */
export function DevSimPanel() {
  const [open, setOpen] = useState(false);
  const [presetId, setPresetId] = useState(() => getSim().presetId);
  const active = getSim().active;

  useEffect(() => subscribeSim(() => setPresetId(getSim().presetId)), []);

  if (!SIM_ENABLED) return null;

  const activeLabel = active ? SIM_PRESETS.find((p) => p.id === presetId)?.label ?? 'On' : 'Off';

  const groups: Record<string, SimPreset[]> = {};
  for (const p of SIM_PRESETS) (groups[p.group] ??= []).push(p);

  return (
    <div className="fixed bottom-4 left-4 z-[9999] text-xs">
      {open ? (
        <div className="w-80 rounded-lg border border-amber-400/60 bg-white text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100">
          <div className="flex items-center justify-between gap-2 border-b border-amber-400/40 bg-amber-50 px-3 py-2 dark:bg-amber-950/40">
            <span className="flex items-center gap-1.5 font-semibold">
              <FlaskConical className="h-3.5 w-3.5 text-amber-600" /> Entitlement simulator
            </span>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-0.5 hover:bg-black/10">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-[60vh] space-y-3 overflow-auto p-3">
            <button
              type="button"
              onClick={() => clearSim()}
              className={
                'w-full rounded-md border px-2.5 py-1.5 text-left font-medium ' +
                (!active
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800')
              }
            >
              Off — use real Firestore data
            </button>

            {Object.entries(groups).map(([group, presets]) => (
              <div key={group} className="space-y-1">
                <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group}</p>
                {presets.map((p) => {
                  const isActive = active && presetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSimPreset(p.id)}
                      className={
                        'w-full rounded-md border px-2.5 py-1.5 text-left ' +
                        (isActive
                          ? 'border-amber-500 bg-amber-50 font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800')
                      }
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            ))}

            <p className="pt-1 text-[10px] leading-relaxed text-slate-400">
              Dev only — never shipped to customers. Simulates the app’s view of your
              subscription/devices instantly; real billing and Firestore are untouched.
            </p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium shadow-lg ' +
            (active
              ? 'border-amber-500 bg-amber-500 text-white'
              : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200')
          }
          title="Entitlement / device simulator (dev only)"
        >
          <FlaskConical className="h-3.5 w-3.5" />
          Sim: {activeLabel}
        </button>
      )}
    </div>
  );
}
