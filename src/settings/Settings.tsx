"use client";
/**
 * Settings: sound channels, motion, cinematics, Claude status and spend, the playtest time warp, and your data.
 */
import { useEffect, useRef, useState } from "react";
import { sfx } from "@/audio/engine";
import { useMusic } from "@/audio/useMusic";
import { aiCoachOn, aiStatus, setAiCoachOn, type AiStatus } from "@/ai/client";
import { exportAll, importAll, resetAll, type AudioSettings, type ExportBlob, type ReducedMotionPref } from "@/game/db";
import { istDay, useGame } from "@/game/store";
import { Button, Chip, cx, fmtUsd, Meter, Panel, Segmented } from "@/ui/kit";
import { PageBar } from "@/ui/Shell";
import { Slider } from "@/ui/Slider";

const CHANNELS: { key: keyof Omit<AudioSettings, "muted">; label: string; test: () => void }[] = [
  { key: "master", label: "Master", test: () => sfx.confirm() },
  { key: "ui", label: "Interface", test: () => sfx.select() },
  { key: "sim", label: "Simulation", test: () => [0.02, 0.08, 0.3, 1.2].forEach((l, i) => setTimeout(() => sfx.blip(l), i * 140)) },
  { key: "alerts", label: "Alerts", test: () => sfx.pager() },
  { key: "music", label: "Music", test: () => undefined },
];

export function Settings() {
  const hydrated = useGame((s) => s.hydrated);
  const settings = useGame((s) => s.profile.settings);
  const update = useGame((s) => s.updateSettings);
  const [preview, setPreview] = useState(false);
  useMusic(preview ? { root: 45, scale: "pentatonic", intensity: 0.4 } : null);

  const setAudio = (patch: Partial<AudioSettings>) => void update({ audio: { ...settings.audio, ...patch } });

  if (!hydrated) return <div className="grid min-h-dvh place-items-center text-[13px] text-ink-3">restoring state…</div>;

  return (
    <div className="flex min-h-dvh flex-col">
      <PageBar backHref="/" backLabel="HQ" backAria="Back to HQ" title="Settings" titleAs="h1" />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-16 pt-8 lg:px-8">
      <Panel label="Sound" right={<Chip tone={settings.audio.muted ? "warn" : "muted"}>{settings.audio.muted ? "Muted" : "On"}</Chip>}>
        <label className="flex items-center gap-2.5 text-sm text-ink-1">
          <input type="checkbox" checked={settings.audio.muted} onChange={(e) => setAudio({ muted: e.target.checked })} className="h-4 w-4 accent-amber" />
          Mute everything
        </label>
        <div className={cx("mt-4 flex flex-col gap-4", settings.audio.muted && "pointer-events-none opacity-40")}>
          {CHANNELS.map((c) => (
            <div key={c.key} className="flex items-end gap-3">
              <Slider className="flex-1" label={c.label} value={settings.audio[c.key]} min={0} max={1} step={0.05} onChange={(v) => setAudio({ [c.key]: v })} format={(v) => `${Math.round(v * 100)}%`} />
              {c.key === "music" ? (
                <Button size="sm" variant="secondary" sound="none" onClick={() => setPreview((p) => !p)} aria-label={preview ? "Stop the music preview" : "Preview music"}>
                  {preview ? "Stop" : "Play"}
                </Button>
              ) : (
                <Button size="sm" variant="secondary" sound="none" onClick={c.test} aria-label={`Test ${c.label.toLowerCase()} sound`}>
                  Test
                </Button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-ink-2">The simulation plays load as pitch: slow requests sound lower. Music only plays during boss fights and incidents.</p>
      </Panel>

      <Panel label="Motion">
        <Segmented<ReducedMotionPref>
          label="Reduced motion"
          size="sm"
          value={settings.reducedMotion}
          onChange={(v) => void update({ reducedMotion: v })}
          options={[
            { value: "system", label: "Follow system" },
            { value: "on", label: "Reduce" },
            { value: "off", label: "Full motion" },
          ]}
        />
        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">Reduced motion keeps every number and chart but drops shakes, particle trails, and camera moves.</p>
        <div className="mt-4 flex flex-col gap-2.5">
          <label className="flex items-center gap-2.5 text-sm text-ink-1">
            <input type="checkbox" checked={settings.skipSeenCinematics} onChange={(e) => void update({ skipSeenCinematics: e.target.checked })} className="h-4 w-4 accent-amber" />
            Skip cinematics I&apos;ve already seen
          </label>
          <label className="flex items-center gap-2.5 text-sm text-ink-1">
            <input type="checkbox" checked={settings.showHonestPhysics} onChange={(e) => void update({ showHonestPhysics: e.target.checked })} className="h-4 w-4 accent-amber" />
            Show &ldquo;honest physics&rdquo; notes on simulations
          </label>
        </div>
      </Panel>

      <AiPanel />
      <TimeWarpPanel days={settings.timeWarpDays ?? 0} onChange={(d) => void update({ timeWarpDays: d })} />
      <DataPanel />
      </div>
    </div>
  );
}

function AiPanel() {
  const [s, setS] = useState<(AiStatus & { byRoute?: Record<string, { calls: number; usd: number }>; models?: Record<string, string> }) | null | undefined>(undefined);
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(aiCoachOn());
    void aiStatus(true).then((v) => setS(v));
  }, []);
  const toggle = (v: boolean) => {
    setAiCoachOn(v);
    setOn(v);
    void aiStatus(true).then((x) => setS(x));
  };
  return (
    <Panel label={s?.provider ? `AI coach · ${s.provider}` : "AI coach"} right={s === undefined ? <Chip tone="muted">Checking…</Chip> : <Chip tone={s?.enabled ? "ok" : "muted"}>{s?.enabled ? "Connected" : s?.keyConfigured ? "Off on this device" : "Offline"}</Chip>}>
      {s?.keyConfigured && (
        <label className="mb-3 flex items-center gap-2.5 text-sm text-ink-1">
          <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} className="h-4 w-4 accent-amber" />
          Use the AI coach to grade explanations and give hints
        </label>
      )}
      {s === undefined ? null : s?.keyConfigured && !s.enabled ? (
        <p className="text-sm leading-relaxed text-ink-2">Switched off on this device: you grade yourself against the rubric and hints come from the script. Nothing is sent to the provider.</p>
      ) : !s?.enabled ? (
        <div className="space-y-3 text-sm leading-relaxed text-ink-1">
          <p>No API key, and that&apos;s fine: every mission, boss, incident, and review works offline. Explanations are self-graded against the rubric and hints come from the script.</p>
          <p className="text-[13px] text-ink-2">
            To turn on graded explanations and the live SRE, put <code className="font-mono text-amber">GROQ_API_KEY</code> in <code className="font-mono">.env</code> and restart. The key stays on the server; the browser never sees it. Cap spend with <code className="font-mono text-amber">NINES_MONTHLY_BUDGET_USD</code> (default $5).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink-1">
                Spent in <span className="tabular">{s.month}</span>
              </span>
              <span className="font-medium tabular text-ink-0">
                {fmtUsd(s.spentUsd)} / {fmtUsd(s.budgetUsd)}
              </span>
            </div>
            <Meter value={s.spentUsd / Math.max(0.01, s.budgetUsd)} warnAt={0.7} alertAt={0.95} className="mt-2" label="monthly budget used" />
            <div className="mt-2 text-xs leading-relaxed text-ink-3">
              <span className="tabular">{s.calls}</span> calls · at the cap, Claude features switch off until next month and everything falls back to offline.</div>
          </div>
          {s.byRoute && Object.keys(s.byRoute).length > 0 && (
            <table className="w-full text-[13px]">
              <tbody>
                {Object.entries(s.byRoute).map(([r, v]) => (
                  <tr key={r} className="border-t border-line/60">
                    <td className="py-1.5 font-mono text-xs text-ink-1">{r}</td>
                    <td className="py-1.5 text-right tabular text-ink-2">{v.calls} calls</td>
                    <td className="py-1.5 pl-3 text-right font-medium tabular text-ink-0">{fmtUsd(v.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {s.models && (
            <div className="break-words font-mono text-xs text-ink-3">
              {Object.entries(s.models)
                .map(([role, id]) => `${role}: ${id}`)
                .join(" · ")}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function TimeWarpPanel({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <Panel label="Playtest · time warp" right={days > 0 ? <Chip tone="warn" className="tabular">+{days} days</Chip> : <Chip tone="muted">Today</Chip>}>
      <p className="text-sm leading-relaxed text-ink-1">Pretend days have passed, to see what forgetting does to the map: services flicker, rust, and page you as their recall drops. Reviews and the daily shift use the warped clock too.</p>
      <div className="mt-4 flex items-end gap-3">
        <Slider className="flex-1" label="Days from now" value={days} min={0} max={90} step={1} onChange={onChange} format={(v) => (v === 0 ? "today" : `+${v} days`)} />
        <Button size="sm" variant="secondary" onClick={() => onChange(0)} disabled={days === 0}>
          Back to today
        </Button>
      </div>
      <div className="mt-3 text-xs text-ink-3">
        Game day: <span className="font-mono tabular text-ink-2">{istDay()}</span>
      </div>
    </Panel>
  );
}

function DataPanel() {
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);

  const doExport = async () => {
    const blob = await exportAll();
    const url = URL.createObjectURL(new Blob([JSON.stringify(blob, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `nines-save-${istDay()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg(`Exported ${blob.concepts.length} services and ${blob.events.length} events.`);
  };

  const doImport = async (f: File) => {
    try {
      const blob = JSON.parse(await f.text()) as ExportBlob;
      if (blob.version !== 1 || !blob.profile || !Array.isArray(blob.concepts)) throw new Error("not a NINES save");
      await importAll(blob);
      setMsg("Imported. Reloading…");
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      setMsg(`Couldn't import that file: ${(e as Error).message}.`);
    }
  };

  const doReset = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    await resetAll();
    setMsg("Reset. Reloading…");
    setTimeout(() => location.assign("/"), 600);
  };

  return (
    <Panel label="Your data">
      <p className="text-sm leading-relaxed text-ink-1">Progress lives in this browser (IndexedDB). Export a save to move it to another device or keep a backup.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void doExport()}>
          Export save
        </Button>
        <Button variant="secondary" onClick={() => file.current?.click()}>
          Import save
        </Button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" aria-label="Save file to import" onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])} />
        <Button variant="danger" onClick={() => void doReset()}>
          {armed ? "Tap again: erase everything" : "Reset progress"}
        </Button>
      </div>
      {armed && <p className="mt-3 text-[13px] text-alert">This erases every service, review, and streak on this device. Export first if you might want it back.</p>}
      {msg && <p className="mt-3 text-[13px] text-ink-2">{msg}</p>}
    </Panel>
  );
}
