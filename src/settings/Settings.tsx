"use client";
/**
 * Settings: sound channels, motion, cinematics, Claude status and spend, the playtest time warp, and your data.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { sfx } from "@/audio/engine";
import { useMusic } from "@/audio/useMusic";
import { claudeStatus, type ClaudeStatus } from "@/claude/client";
import { exportAll, importAll, resetAll, type AudioSettings, type ExportBlob, type ReducedMotionPref } from "@/game/db";
import { istDay, useGame } from "@/game/store";
import { Button, Chip, cx, fmtUsd, Meter, Panel, Segmented } from "@/ui/kit";
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

  if (!hydrated) return <div className="grid min-h-dvh place-items-center font-mono text-2xs uppercase tracking-[0.3em] text-ink-3">restoring state…</div>;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-3 px-4 pb-12 pt-3">
      <header className="flex h-12 items-center gap-3 border-b border-line">
        <Link href="/" className="font-mono text-2xs uppercase tracking-[0.16em] text-ink-2 hover:text-amber" aria-label="Back to HQ">
          ← HQ
        </Link>
        <span className="text-line-3">|</span>
        <h1 className="font-display text-2xl font-extrabold uppercase tracking-tight text-ink-0">Settings</h1>
      </header>

      <Panel label="sound" right={<Chip tone={settings.audio.muted ? "warn" : "muted"}>{settings.audio.muted ? "muted" : "on"}</Chip>}>
        <label className="flex items-center gap-2 text-sm text-ink-1">
          <input type="checkbox" checked={settings.audio.muted} onChange={(e) => setAudio({ muted: e.target.checked })} className="h-4 w-4 accent-[#ffb547]" />
          Mute everything
        </label>
        <div className={cx("mt-3 flex flex-col gap-3", settings.audio.muted && "pointer-events-none opacity-40")}>
          {CHANNELS.map((c) => (
            <div key={c.key} className="flex items-end gap-3">
              <Slider className="flex-1" label={c.label} value={settings.audio[c.key]} min={0} max={1} step={0.05} onChange={(v) => setAudio({ [c.key]: v })} format={(v) => `${Math.round(v * 100)}%`} />
              {c.key === "music" ? (
                <Button size="sm" variant="secondary" sound="none" onClick={() => setPreview((p) => !p)} aria-label={preview ? "Stop the music preview" : "Preview music"}>
                  {preview ? "stop" : "play"}
                </Button>
              ) : (
                <Button size="sm" variant="secondary" sound="none" onClick={c.test} aria-label={`Test ${c.label.toLowerCase()} sound`}>
                  test
                </Button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-3">The simulation plays load as pitch: slow requests sound lower. Music only plays during boss fights and incidents.</p>
      </Panel>

      <Panel label="motion">
        <Segmented<ReducedMotionPref>
          label="Reduced motion"
          size="sm"
          value={settings.reducedMotion}
          onChange={(v) => void update({ reducedMotion: v })}
          options={[
            { value: "system", label: "follow system" },
            { value: "on", label: "reduce" },
            { value: "off", label: "full motion" },
          ]}
        />
        <p className="mt-2 text-xs text-ink-3">Reduced motion keeps every number and chart but drops shakes, particle trails, and camera moves.</p>
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-ink-1">
            <input type="checkbox" checked={settings.skipSeenCinematics} onChange={(e) => void update({ skipSeenCinematics: e.target.checked })} className="h-4 w-4 accent-[#ffb547]" />
            Skip cinematics I&apos;ve already seen
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-1">
            <input type="checkbox" checked={settings.showHonestPhysics} onChange={(e) => void update({ showHonestPhysics: e.target.checked })} className="h-4 w-4 accent-[#ffb547]" />
            Show &ldquo;honest physics&rdquo; notes on simulations
          </label>
        </div>
      </Panel>

      <ClaudePanel />
      <TimeWarpPanel days={settings.timeWarpDays ?? 0} onChange={(d) => void update({ timeWarpDays: d })} />
      <DataPanel />
    </div>
  );
}

function ClaudePanel() {
  const [s, setS] = useState<(ClaudeStatus & { byRoute?: Record<string, { calls: number; usd: number }>; models?: Record<string, string> }) | null | undefined>(undefined);
  useEffect(() => {
    void claudeStatus(true).then((v) => setS(v));
  }, []);
  return (
    <Panel label="claude" right={s === undefined ? <Chip tone="muted">checking…</Chip> : <Chip tone={s?.enabled ? "ok" : "muted"}>{s?.enabled ? "connected" : "offline"}</Chip>}>
      {s === undefined ? null : !s?.enabled ? (
        <div className="space-y-2 text-sm text-ink-1">
          <p>No API key, and that&apos;s fine: every mission, boss, incident, and review works offline. Explanations are self-graded against the rubric and hints come from the script.</p>
          <p className="text-ink-2">
            To turn on graded explanations and the live SRE, put <code className="font-mono text-amber">ANTHROPIC_API_KEY</code> in <code className="font-mono">.env</code> and restart. The key stays on the server; the browser never sees it. Cap spend with <code className="font-mono text-amber">NINES_MONTHLY_BUDGET_USD</code> (default $5).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="flex items-baseline justify-between font-mono text-sm">
              <span className="text-ink-1">spent in {s.month}</span>
              <span className="tabular text-ink-0">
                {fmtUsd(s.spentUsd)} / {fmtUsd(s.budgetUsd)}
              </span>
            </div>
            <Meter value={s.spentUsd / Math.max(0.01, s.budgetUsd)} warnAt={0.7} alertAt={0.95} className="mt-1" label="monthly budget used" />
            <div className="mt-1 font-mono text-[10px] text-ink-3">{s.calls} calls · at the cap, Claude features switch off until next month and everything falls back to offline.</div>
          </div>
          {s.byRoute && Object.keys(s.byRoute).length > 0 && (
            <table className="w-full font-mono text-xs">
              <tbody>
                {Object.entries(s.byRoute).map(([r, v]) => (
                  <tr key={r} className="border-t border-line">
                    <td className="py-1 text-ink-1">{r}</td>
                    <td className="py-1 text-right tabular text-ink-2">{v.calls} calls</td>
                    <td className="py-1 text-right tabular text-ink-0">{fmtUsd(v.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {s.models && (
            <div className="font-mono text-[10px] text-ink-3">
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
    <Panel label="playtest · time warp" right={days > 0 ? <Chip tone="warn">+{days} days</Chip> : <Chip tone="muted">today</Chip>}>
      <p className="text-sm text-ink-1">Pretend days have passed, to see what forgetting does to the map: services flicker, rust, and page you as their recall drops. Reviews and the daily shift use the warped clock too.</p>
      <div className="mt-3 flex items-end gap-3">
        <Slider className="flex-1" label="Days from now" value={days} min={0} max={90} step={1} onChange={onChange} format={(v) => (v === 0 ? "today" : `+${v} days`)} />
        <Button size="sm" variant="secondary" onClick={() => onChange(0)} disabled={days === 0}>
          back to today
        </Button>
      </div>
      <div className="mt-2 font-mono text-[10px] text-ink-3">game day: {istDay()}</div>
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
    <Panel label="your data">
      <p className="text-sm text-ink-1">Progress lives in this browser (IndexedDB). Export a save to move it to another device or keep a backup.</p>
      <div className="mt-3 flex flex-wrap gap-2">
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
      {armed && <p className="mt-2 text-xs text-alert">This erases every service, review, and streak on this device. Export first if you might want it back.</p>}
      {msg && <p className="mt-2 font-mono text-xs text-ink-2">{msg}</p>}
    </Panel>
  );
}
