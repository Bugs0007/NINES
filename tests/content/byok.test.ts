import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, clearByok, getByok, keyProblem, maskKey, parseResponse, setByok, type ByokCall } from "@/ai/byok";
import { gradeExplanation, askSre, aiStatus } from "@/ai/client";
import type { GradeRequest, HintRequest } from "@/ai/schemas";

const KEY_GROQ = "gsk_test_0123456789abcdefghij";
const KEY_CLAUDE = "sk-ant-test-0123456789abcdefghij";

const grade: GradeRequest = { concept: "Little's Law", prompt: "Explain it.", rubric: [{ id: "r1", criterion: "States L = λW" }, { id: "r2", criterion: "Applies it to pools" }], exemplar: "In flight equals rate times time.", answer: "In flight equals arrival rate times time in system." };
const hint: HintRequest = { mission: "Queue Lab", situation: "p99 is high", goal: "Keep p99 under 200ms", previous: [], level: 1 };

function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: fakeStorage() };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { window?: unknown }).window;
});

describe("storing the key", () => {
  it("round-trips in the browser's storage and can be removed", () => {
    expect(getByok()).toBeNull();
    expect(setByok("groq", `  ${KEY_GROQ} `)).toBe(true);
    expect(getByok()).toEqual({ provider: "groq", key: KEY_GROQ });
    clearByok();
    expect(getByok()).toBeNull();
  });

  it("never shows more of a key than its start and last four characters", () => {
    expect(maskKey(KEY_GROQ)).toBe("gsk_…ghij");
    expect(maskKey(KEY_CLAUDE)).toBe("sk-ant-…ghij");
    expect(maskKey(KEY_GROQ)).not.toContain("0123456789");
  });

  it("checks a key's shape before saving it", () => {
    expect(keyProblem("groq", "")).toMatch(/Paste/);
    expect(keyProblem("groq", "gsk_ with spaces inside it")).toMatch(/spaces/);
    expect(keyProblem("groq", KEY_CLAUDE)).toMatch(/Groq/);
    expect(keyProblem("anthropic", "sk-ant-short")).toMatch(/short/);
    expect(keyProblem("groq", KEY_GROQ)).toBeNull();
    expect(keyProblem("anthropic", KEY_CLAUDE)).toBeNull();
  });
});

describe("requests go straight to the provider", () => {
  const call = (kind: ByokCall["kind"]): ByokCall => ({ kind, system: "sys", user: "usr", maxTokens: 100 });

  it("Groq: OpenAI-compatible chat, strict JSON schema for grading only", () => {
    const g = buildRequest("groq", KEY_GROQ, call("grade"));
    expect(g.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((g.init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY_GROQ}`);
    expect(JSON.parse(g.init.body as string).response_format.json_schema.strict).toBe(true);
    expect(JSON.parse(buildRequest("groq", KEY_GROQ, call("hint")).init.body as string).response_format).toBeUndefined();
  });

  it("Claude: messages API with the browser-access header and a forced tool call for grading", () => {
    const g = buildRequest("anthropic", KEY_CLAUDE, call("grade"));
    const h = g.init.headers as Record<string, string>;
    expect(g.url).toBe("https://api.anthropic.com/v1/messages");
    expect(h["x-api-key"]).toBe(KEY_CLAUDE);
    expect(h["anthropic-version"]).toBe("2023-06-01");
    expect(h["anthropic-dangerous-direct-browser-access"]).toBe("true");
    const body = JSON.parse(g.init.body as string);
    expect(body.tool_choice).toEqual({ type: "tool", name: "submit_grade" });
    expect(body.system).toBe("sys");
    expect(JSON.parse(buildRequest("anthropic", KEY_CLAUDE, call("hint")).init.body as string).tools).toBeUndefined();
  });

  it("the key is never put in a URL or a request body", () => {
    for (const [p, k] of [["groq", KEY_GROQ], ["anthropic", KEY_CLAUDE]] as const) {
      const r = buildRequest(p, k, call("grade"));
      expect(r.url).not.toContain(k);
      expect(r.init.body as string).not.toContain(k);
    }
  });
});

describe("reading the answers", () => {
  const gradeCall: ByokCall = { kind: "grade", system: "", user: "", maxTokens: 1 };
  const hintCall: ByokCall = { kind: "hint", system: "", user: "", maxTokens: 1 };
  it("Groq", () => {
    expect(parseResponse("groq", gradeCall, { choices: [{ message: { content: '{"a":1}' } }] })).toEqual({ json: { a: 1 } });
    expect(parseResponse("groq", hintCall, { choices: [{ message: { content: " Look at the queue. " } }] })).toEqual({ text: "Look at the queue." });
    expect(parseResponse("groq", gradeCall, { choices: [{ message: { content: "not json" } }] })).toBeNull();
    expect(parseResponse("groq", hintCall, {})).toBeNull();
  });
  it("Claude", () => {
    expect(parseResponse("anthropic", gradeCall, { content: [{ type: "tool_use", input: { a: 1 } }] })).toEqual({ json: { a: 1 } });
    expect(parseResponse("anthropic", hintCall, { content: [{ type: "text", text: "Watch " }, { type: "text", text: "the queue." }] })).toEqual({ text: "Watch the queue." });
    expect(parseResponse("anthropic", gradeCall, { content: [{ type: "text", text: "hi" }] })).toBeNull();
  });
});

describe("the coach with a player's own key", () => {
  it("grades through the provider directly and never calls our own API", async () => {
    setByok("groq", KEY_GROQ);
    const modelJson = { criteria: [{ id: "r1", verdict: "met", note: "ok" }, { id: "r2", verdict: "partial", note: "vague" }], feedback: "Fine.", gap: "Apply it to pools." };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelJson) } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await gradeExplanation(grade);
    expect(r?.score).toBe(0.75);
    const urls = (fetchMock.mock.calls as unknown as [string][]).map((c) => c[0]);
    expect(urls).toEqual(["https://api.groq.com/openai/v1/chat/completions"]);
  });

  it("hints work the same way with Claude", async () => {
    setByok("anthropic", KEY_CLAUDE);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: '"What does the queue do at 90% busy?"' }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await askSre(hint)).toBe("What does the queue do at 90% busy?");
    expect(((fetchMock.mock.calls as unknown as [string][])[0] as [string])[0]).toBe("https://api.anthropic.com/v1/messages");
  });

  it("falls back to offline (null) on a rejected key, a failed call, or when the coach is switched off", async () => {
    setByok("groq", KEY_GROQ);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect(await gradeExplanation(grade)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await askSre(hint)).toBeNull();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    (globalThis as unknown as { window: { localStorage: ReturnType<typeof fakeStorage> } }).window.localStorage.setItem("nines:ai", "off");
    expect(await gradeExplanation(grade)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("status reports the player's own key without asking our server", async () => {
    setByok("groq", KEY_GROQ);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const s = await aiStatus(true);
    expect(s).toMatchObject({ enabled: true, byok: "groq" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the key stays in the browser (structural guard)", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  const src = path.resolve(__dirname, "../../src");

  it("no server code imports the browser key module or reads the storage key", () => {
    for (const f of [...files(path.join(src, "server")), ...files(path.join(src, "app", "api")), path.join(src, "auth.ts")]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/ai\/byok|nines:byok/);
    }
  });

  it("only the key module itself knows the storage key; sync, export and analytics never touch it", () => {
    const holders = files(src).filter((f) => readFileSync(f, "utf8").includes("nines:byok"));
    expect(holders.map((f) => path.relative(src, f).replace(/\\/g, "/"))).toEqual(["ai/byok.ts"]);
  });
});
