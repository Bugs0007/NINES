"""
One-off codemod for the "Dusk" redesign (D-018): old Night Shift colours -> Dusk colours, and the
ALL-CAPS monospace label style -> sentence-case `eyebrow` labels. Safe to re-run (idempotent).

    python scripts/codemod-dusk.py
"""
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), "..", "src")

HEX = {
    "#04070a": "#0f1519", "#081014": "#151d22", "#0d171c": "#1b252b", "#132128": "#233038",
    "#1a2a31": "#243139", "#26404a": "#2f3f48", "#365a66": "#42545e",
    "#e2efe8": "#e4dfd5", "#a6bab1": "#c5c4bc", "#6f857c": "#8f9790", "#465851": "#657069",
    "#5cf29a": "#8fd4b2", "#33c275": "#6fbb98", "#1f7a4b": "#3e7a62", "#0f3322": "#1c3830",
    "#ffb547": "#e8b77d", "#e0922a": "#d29b62", "#8a5a18": "#8b6643", "#33230c": "#382a1f",
    "#ff5a4e": "#ec8f80", "#d63a30": "#d37466", "#7a221c": "#82463d", "#2e0f0d": "#3a2320",
    "#ffc56b": "#f0c793", "#7cf7b0": "#a6dfc2", "#0d0303": "#1f1614",
}
RGB = {
    (92, 242, 154): (143, 212, 178), (255, 90, 78): (236, 143, 128), (255, 181, 71): (232, 183, 125),
    (54, 90, 102): (66, 84, 94), (13, 23, 28): (27, 37, 43), (46, 15, 13): (58, 35, 32),
    (8, 16, 20): (21, 29, 34), (51, 35, 12): (56, 42, 31), (26, 42, 49): (36, 49, 57),
    (224, 146, 42): (210, 155, 98), (19, 33, 40): (35, 48, 56), (15, 51, 34): (28, 56, 48),
    (138, 90, 24): (139, 102, 67), (122, 34, 28): (130, 70, 61), (4, 7, 10): (15, 21, 25),
}

CLASS_TOKEN = re.compile(r"^[!\-]?[A-Za-z0-9:\[\]/.\-_#%(),>&*=+]+$")
FONT_WEIGHTS_HEAVY = {"font-extrabold", "font-black", "font-bold"}


def recolor(s: str) -> str:
    def hx(m):
        return HEX.get(m.group(0).lower(), m.group(0))
    s = re.sub(r"#[0-9a-fA-F]{6}\b", hx, s)

    return re.sub(r"(?P<pre>rgba?\(\s*)(\d+)([ ,_]+)(\d+)([ ,_]+)(\d+)", lambda m: rgb_fix(m), s)


def rgb_fix(m):
    key = (int(m.group(2)), int(m.group(4)), int(m.group(6)))
    if key not in RGB:
        return m.group(0)
    a, b, c = RGB[key]
    return f"{m.group('pre')}{a}{m.group(3)}{b}{m.group(5)}{c}"


def restyle_classes(cls: str) -> str:
    tokens = cls.split()
    if not tokens or not all(CLASS_TOKEN.match(t) for t in tokens):
        return cls
    toks = list(tokens)
    changed = False
    if "rack-label" in toks:
        toks.remove("rack-label")
        changed = True
    has_display = "font-display" in toks
    if "uppercase" in toks:
        changed = True
        toks = [t for t in toks if t != "uppercase" and not re.match(r"^tracking-(\[.*\]|wide|wider|widest)$", t)]
        if has_display:
            toks = ["font-semibold" if t in FONT_WEIGHTS_HEAVY else t for t in toks]
        elif "font-mono" in toks:
            toks = ["eyebrow" if t == "font-mono" else t for t in toks]
        elif any(t in ("text-2xs", "text-xs") or re.match(r"^text-\[\d+px\]$", t) for t in toks):
            if "eyebrow" not in toks:
                toks.append("eyebrow")
    elif has_display and any(t in FONT_WEIGHTS_HEAVY for t in toks):
        toks = ["font-semibold" if t in FONT_WEIGHTS_HEAVY else t for t in toks]
        changed = True
    new = []
    for t in toks:
        if t in ("rounded-[1px]", "rounded-[2px]", "rounded-[3px]"):
            t, changed = "rounded-xs", True
        elif t in ("text-[9px]", "text-[10px]"):
            t, changed = "text-[11px]", True
        new.append(t)
    return " ".join(new) if changed else cls


def restyle_source(s: str) -> str:
    # double-quoted literals
    s = re.sub(r'"([^"\n]*)"', lambda m: '"' + restyle_classes(m.group(1)) + '"', s)

    # template literals: only touch the static pieces between ${...}
    def tpl(m):
        body = m.group(1)
        parts = re.split(r"(\$\{[^}]*\})", body)
        out = []
        for p in parts:
            if p.startswith("${"):
                out.append(p)
            else:
                lead = re.match(r"^\s*", p).group(0)
                trail = re.search(r"\s*$", p).group(0)
                core = p.strip()
                out.append(lead + (restyle_classes(core) if core else core) + trail if core else p)
        return "`" + "".join(out) + "`"
    s = re.sub(r"`([^`]*)`", tpl, s)
    return s


def main():
    changed = []
    for dirpath, _, files in os.walk(ROOT):
        for f in files:
            if not f.endswith((".tsx", ".ts")):
                continue
            p = os.path.join(dirpath, f)
            src = open(p, encoding="utf-8").read()
            out = recolor(src)
            if f.endswith(".tsx"):
                out = restyle_source(out)
            if out != src:
                open(p, "w", encoding="utf-8", newline="\n").write(out)
                changed.append(os.path.relpath(p, ROOT))
    print(f"{len(changed)} files changed")
    for c in changed:
        print("  ", c)


if __name__ == "__main__":
    main()
