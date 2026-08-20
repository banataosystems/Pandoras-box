#!/usr/bin/env python3
"""Structural validation of the Pandora skill system.

Checks the native Claude skill format: directory-per-skill with SKILL.md
carrying YAML frontmatter (name, description), name matching the directory,
no duplicates, bodies small enough for progressive disclosure, and every
cross-reference resolving to a real skill or file. Run from the repo root.
"""
import os, re, sys

ROOT = ".claude/skills"
NON_SKILL = {"evals"}

errs, warns, rows = [], [], []
names = {}

entries = [d for d in sorted(os.listdir(ROOT))
           if os.path.isdir(os.path.join(ROOT, d)) and d not in NON_SKILL]

for d in entries:
    p = os.path.join(ROOT, d, "SKILL.md")
    if not os.path.isfile(p):
        errs.append(f"{d}: missing SKILL.md"); continue
    txt = open(p).read()
    m = re.match(r"^---\n(.*?)\n---\n", txt, re.S)
    if not m:
        errs.append(f"{d}: no YAML frontmatter"); continue
    fm, body = m.group(1), txt[m.end():]

    nm = re.search(r"^name:\s*(.+)$", fm, re.M)
    ds = re.search(r"^description:\s*(.+)$", fm, re.M | re.S)
    if not nm: errs.append(f"{d}: no name"); continue
    if not ds: errs.append(f"{d}: no description"); continue

    name = nm.group(1).strip().strip('"')
    desc = ds.group(1).strip().strip('"')

    if name != d: errs.append(f"{d}: name '{name}' does not match directory")
    if name in names: errs.append(f"duplicate skill name: {name}")
    names[name] = d
    if not re.match(r"^[a-z0-9-]+$", name):
        errs.append(f"{d}: name must be lowercase-hyphenated")

    if len(desc) < 60: warns.append(f"{d}: description very short ({len(desc)})")
    if len(desc) > 1024: errs.append(f"{d}: description too long ({len(desc)})")

    lines = len(body.splitlines())
    if lines > 500: errs.append(f"{d}: body {lines} lines exceeds 500")

    unknown = set(re.findall(r"^([a-zA-Z_-]+):", fm, re.M)) - {
        "name", "description", "license", "allowed-tools"}
    if unknown: warns.append(f"{d}: unexpected frontmatter keys {unknown}")

    rows.append((name, lines, len(desc)))

# every cross-reference must resolve
for d in entries + ["."]:
    base = os.path.join(ROOT, d)
    for fn in (["SKILL.md"] if d != "." else ["DEPENDENCY_GRAPH.md"]):
        fp = os.path.join(base, fn)
        if not os.path.isfile(fp): continue
        txt = open(fp).read()
        for ref in sorted(set(re.findall(r"`(pandora-[a-z-]+)`", txt))):
            if ref not in names:
                errs.append(f"{d}/{fn}: references non-existent skill {ref}")
        for ref in sorted(set(re.findall(r"`(pandora-[a-z-]+/references/[a-z-]+\.md)`", txt))):
            if not os.path.isfile(os.path.join(ROOT, ref)):
                errs.append(f"{d}/{fn}: references missing file {ref}")

print(f"skills     : {len(rows)}")
print(f"body lines : min={min(r[1] for r in rows)} max={max(r[1] for r in rows)} total={sum(r[1] for r in rows)}")
print(f"desc chars : min={min(r[2] for r in rows)} max={max(r[2] for r in rows)}")
print(f"\nERRORS ({len(errs)})")
for e in errs: print("  FAIL", e)
print(f"\nWARNINGS ({len(warns)})")
for w in warns: print("  WARN", w)
print("\nRESULT:", "PASS" if not errs else "FAIL")
sys.exit(1 if errs else 0)
