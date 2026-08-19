#!/usr/bin/env python3
"""Routing discrimination test for the Pandora skill system.

Scores each eval prompt against every skill description using IDF-weighted term
overlap, then checks two properties:

  1. TRIGGERING    - the expected skill ranks in the top-3 for its prompt.
  2. NON-TRIGGER   - skills the router must NOT reach first do not outrank it.

This measures whether the description set is lexically discriminative. It is a
proxy for live model-driven activation, not a replacement for it: a model reads
semantics, this reads terms. Treat a failure as a real signal and a pass as
necessary-but-not-sufficient.
"""
import os, re, sys, json, math, collections

ROOT = ".claude/skills"
STOP = set("""the a an and or of to in for when is are be with that this it as on at by from
use used using load loads loading skill skills work working any all before after into what
which who how not never always its their them they there here than then covers cover enforces
enforce also over across new more most one two make makes need needs should must may can could
would something anything someone your you our we us do does done get gets got""".split())

def toks(t):
    return [w for w in re.findall(r"[a-z]{3,}", t.lower()) if w not in STOP]

skills = {}
for d in sorted(os.listdir(ROOT)):
    p = os.path.join(ROOT, d, "SKILL.md")
    if not os.path.isfile(p): continue
    txt = open(p).read()
    fm = re.match(r"^---\n(.*?)\n---\n", txt, re.S).group(1)
    desc = re.search(r"^description:\s*(.+)$", fm, re.M | re.S).group(1).strip().strip('"')
    skills[d] = collections.Counter(toks(d.replace("-", " ") + " " + desc))

N = len(skills)
df = collections.Counter()
for c in skills.values():
    for w in c: df[w] += 1
idf = {w: math.log(N / df[w]) + 1 for w in df}

def score(prompt, name):
    q = toks(prompt)
    c = skills[name]
    return sum(idf.get(w, 0) * (1 + math.log(1 + c[w])) for w in set(q) if w in c)

def rank(prompt):
    return sorted(((score(prompt, n), n) for n in skills), reverse=True)

ev = json.load(open(os.path.join(ROOT, "evals/evals.json")))
cases = [e for e in ev["evals"] if e.get("expected_first") or e.get("must_not_load_first")]

passed = failed = 0
lines = []
for e in cases:
    r = rank(e["prompt"])
    top = [n for _, n in r[:3]]
    exp = e.get("expected_first")
    forbidden = e.get("must_not_load_first", [])
    problems = []

    if exp:
        order = [n for _, n in r]
        if exp not in top:
            problems.append(f"expected '{exp}' ranked #{order.index(exp) + 1}, not top-3")
        for f in forbidden:
            if order.index(f) < order.index(exp):
                problems.append(f"forbidden '{f}' outranks expected '{exp}'")
    else:
        for f in forbidden:
            if f == top[0]:
                problems.append(f"forbidden '{f}' ranked #1 on a no-skill-needed prompt")

    ok = not problems
    passed += ok; failed += (not ok)
    lines.append((ok, e["id"], e["prompt"][:52], top[0], problems))

print(f"routing cases: {len(cases)}   passed: {passed}   failed: {failed}\n")
for ok, i, p, t, probs in lines:
    print(f"  [{'PASS' if ok else 'FAIL'}] #{i:<3} {p:<54} -> {t}")
    for pr in probs: print(f"          ! {pr}")
print("\nRESULT:", "PASS" if failed == 0 else "FAIL")
sys.exit(1 if failed else 0)
