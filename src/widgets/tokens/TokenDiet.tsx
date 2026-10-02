"use client";
/**
 * Token Diet: a real prompt that runs 200k times a day. Cut tokens without cutting the facts the model needs.
 */
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { sfx } from "@/audio/engine";
import { Button, Chip, cx, fmtUsd, Meter, Panel } from "@/ui/kit";
import { ConditionList } from "../shared";
import type { WidgetProps } from "../types";
import { buildDietPrompt, DIET_EDITS, DIET_REQUIRED } from "./diet";
import { DietConfig, monthlyUsd } from "./spec";
import { TokenChips, useTokenizer } from "./TokenizerSlicer";

export { DietConfig };

export default function TokenDiet({ config, onResult, conditions, locked, verdict }: WidgetProps<DietConfig>) {
  const c = DietConfig.parse(config);
  const tok = useTokenizer();
  const [chosen, setChosen] = useState<string[]>([]);
  const [shipped, setShipped] = useState(false);
  const text = buildDietPrompt(chosen);
  const count = (s: string) => (tok ? tok.encode(s).length : 0);
  const pieces = useMemo(() => (tok ? tok.encode(text).map((id) => tok.decode([id])) : []), [tok, text]);
  const tokens = pieces.length;
  const base = useMemo(() => count(buildDietPrompt([])), [tok]); // eslint-disable-line react-hooks/exhaustive-deps
  const kept = DIET_REQUIRED.map((r) => text.includes(r.mustContain));
  const cost = monthlyUsd(tokens, c.requestsPerDay, c.usdPerMTok);

  const deltas = useMemo(() => {
    if (!tok) return {} as Record<string, number>;
    const out: Record<string, number> = {};
    for (const e of DIET_EDITS) {
      const w = chosen.includes(e.id) ? chosen.filter((x) => x !== e.id) : [...chosen, e.id];
      out[e.id] = count(buildDietPrompt(w)) - tokens;
    }
    return out;
  }, [tok, chosen, tokens]); // eslint-disable-line react-hooks/exhaustive-deps

  const ship = () => {
    setShipped(true);
    sfx.confirm();
    onResult?.({ tokens, factsKept: kept.every(Boolean) ? 1 : 0, costPerMonth: cost });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Panel label={`${c.title} · ${tokens} tokens`} right={<Chip tone={tokens <= c.budgetTokens ? "ok" : "warn"}>budget {c.budgetTokens}</Chip>} className="min-h-0 flex-1" bodyClassName="max-h-[46dvh] overflow-y-auto lg:max-h-[48dvh]">
          {tok ? <TokenChips pieces={pieces} animate={false} max={900} /> : <div className="font-mono text-2xs text-ink-3">loading tokenizer…</div>}
        </Panel>
        <div className="grid gap-2 sm:grid-cols-2">
          {DIET_EDITS.map((e) => {
            const on = chosen.includes(e.id);
            const d = deltas[e.id] ?? 0;
            // d: token change if this edit were toggled now. On: positive d = what it's saving.
            const tag = on ? `saves ${Math.max(0, d)}` : d <= 0 ? `−${-d}` : `+${d}`;
            const good = on ? d > 0 : d < 0;
            return (
              <motion.button
                key={e.id}
                whileTap={{ scale: 0.98 }}
                disabled={locked || shipped}
                aria-pressed={on}
                onClick={() => {
                  sfx.tick();
                  setChosen((cur) => (cur.includes(e.id) ? cur.filter((x) => x !== e.id) : [...cur, e.id]));
                }}
                className={cx("flex items-center justify-between gap-2 rounded-sm border p-2.5 text-left text-sm", on ? "border-amber bg-amber-dim/40 text-ink-0" : "border-line-2 bg-bg-2 text-ink-1 hover:border-line-3")}
              >
                <span>{e.label}</span>
                <span className={cx("shrink-0 font-mono text-2xs tabular", good ? "text-phos" : "text-alert")}>{tag}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
      <div className="flex w-full flex-col gap-3 lg:w-[300px]">
        <Panel label="the bill">
          <div className="font-mono text-2xs text-ink-2">
            {c.requestsPerDay.toLocaleString()} requests/day × ${c.usdPerMTok}/M input tokens
          </div>
          <div className={cx("mt-1 font-mono text-3xl tabular", tokens <= c.budgetTokens ? "text-phos" : "text-amber")}>{fmtUsd(cost)}/mo</div>
          <div className="mt-1 font-mono text-[11px] text-ink-3">started at {fmtUsd(monthlyUsd(base, c.requestsPerDay, c.usdPerMTok))}/mo ({base} tokens)</div>
          <Meter value={tokens / Math.max(1, base)} warnAt={0.7} alertAt={0.95} className="mt-2" label="tokens vs original" />
        </Panel>
        <Panel label="facts the model needs">
          <ul className="space-y-1">
            {DIET_REQUIRED.map((r, i) => (
              <li key={r.label} className={cx("flex items-center gap-2 text-sm", kept[i] ? "text-ink-0" : "text-alert")}>
                <span className="font-mono text-xs">{kept[i] ? "✓" : "✗"}</span>
                {r.label}
              </li>
            ))}
          </ul>
        </Panel>
        <ConditionList conditions={conditions} metrics={shipped ? { tokens, factsKept: kept.every(Boolean) ? 1 : 0, costPerMonth: cost } : undefined} />
        {!shipped ? (
          <Button variant="go" size="lg" onClick={ship} disabled={locked || !tok} sound="none">
            Ship the prompt
          </Button>
        ) : (
          verdict &&
          !verdict.won && (
            <Button variant="secondary" onClick={() => setShipped(false)}>
              Back to the edits
            </Button>
          )
        )}
      </div>
    </div>
  );
}
