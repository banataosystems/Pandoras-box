#!/usr/bin/env python3
"""Static invariant checks over the Pandora skill system.

Verifies the governance properties the system claims to have, so a future edit
that quietly drops one is caught. Run from the repository root.
"""
import os, re, sys, json, itertools, collections

ROOT = ".claude/skills"

def load():
    skills = {}
    for d in sorted(os.listdir(ROOT)):
        p = os.path.join(ROOT, d, "SKILL.md")
        if not os.path.isfile(p): continue
        txt = open(p).read()
        m = re.match(r"^---\n(.*?)\n---\n", txt, re.S)
        fm, body = m.group(1), txt[m.end():]
        desc = re.search(r"^description:\s*(.+)$", fm, re.M | re.S).group(1).strip().strip('"')
        skills[d] = {"desc": desc, "body": body, "full": txt}
    return skills

S = load()
fails, warns = [], []

def req(cond, msg):
    if not cond: fails.append(msg)

def want(cond, msg):
    if not cond: warns.append(msg)

# --- Invariant 1: every skill has an activation boundary in its description
for n, s in S.items():
    d = s["desc"].lower()
    req("load" in d or "use when" in d or "use for" in d,
        f"{n}: description states no activation condition")

# --- Invariant 2: execution-oriented skills define an output contract
EXEC = [n for n in S if n not in {"pandora-router", "pandora-governance-contract"}]
for n in EXEC:
    want(re.search(r"^##\s*Output", S[n]["body"], re.M),
         f"{n}: no Output section")

# --- Invariant 3: mutation-capable skills route through governed execution
MUTATORS = ["pandora-source-control", "pandora-supabase", "pandora-provider-adapter",
            "pandora-evidence-ledger", "pandora-deployment-release"]
for n in MUTATORS:
    req("pandora-governed-execution" in S[n]["full"] or "plan" in S[n]["body"].lower(),
        f"{n}: mutation-capable but never routes to governed execution")

# --- Invariant 4: reviewer skills assert independence and refuse self-approval
for n in ["pandora-exact-head-review", "pandora-security-review"]:
    b = S[n]["body"].lower()
    req("independen" in b, f"{n}: reviewer does not assert independence")
    req("not repair" in b or "do not repair" in b or "do not fix" in b,
        f"{n}: reviewer does not forbid repairing its own findings")
    req("fail" in b and "pass" in b, f"{n}: no explicit verdict vocabulary")

# --- Invariant 5: the proof ladder is never redefined inconsistently
LADDER = ["documented", "implemented", "tested", "deployed", "production_verified"]
gov = S["pandora-governance-contract"]["full"]
for stage in LADDER:
    req(stage in gov, f"governance-contract: proof stage '{stage}' missing")

# --- Invariant 6: no skill claims READY == production verification
for n, s in S.items():
    body = s["body"]
    for m in re.finditer(r"[^.\n]*READY[^.\n]*", body):
        sent = m.group(0)
        if re.search(r"\bis\s+production[- ]verif", sent, re.I):
            fails.append(f"{n}: asserts READY is production verification -> '{sent.strip()}'")

# --- Invariant 7: always-escalate items appear in the contract
ESCALATE = ["irreversible deletion", "new spending", "regulated activation",
            "production release", "secret exposure"]
risk = open(os.path.join(ROOT, "pandora-governance-contract/references/risk-classification.md")).read().lower()
for item in ESCALATE:
    req(item in risk, f"risk-classification: always-escalate item '{item}' missing")

# --- Invariant 8: confirmed-mutation rule present wherever mutations are designed
for n in ["pandora-governance-contract", "pandora-governed-execution",
          "pandora-provider-adapter", "pandora-implementation"]:
    full = S[n]["full"]
    ref = os.path.join(ROOT, "pandora-governance-contract/references/mutation-safety.md")
    ok = ("confirmed" in full.lower() and "retry" in full.lower()) or "mutation-safety.md" in full
    req(ok, f"{n}: confirmed-mutation rule absent")

# --- Invariant 9: router lists every skill exactly once, and only real skills
router = S["pandora-router"]["full"]
listed = set(re.findall(r"`(pandora-[a-z-]+)`", router))
missing = set(S) - listed - {"pandora-router"}
req(not missing, f"router: skills never routed to: {sorted(missing)}")
ghost = listed - set(S)
req(not ghost, f"router: routes to non-existent skills: {sorted(ghost)}")

# --- Invariant 10: description trigger collision (ambiguous activation)
STOP = set("""the a an and or of to in for when is are be with that this it as on at by from
use used using load loads loading skill skills pandora work working review reviews any all
before after into what which who how not never always its their them they there here than then
covers cover enforces enforce also load when about over across new real more most one two make
makes made need needs needed should must may can could would something anything someone""".split())
def toks(t):
    return {w for w in re.findall(r"[a-z]{4,}", t.lower()) if w not in STOP}
pairs = []
for a, b in itertools.combinations(sorted(S), 2):
    ta, tb = toks(S[a]["desc"]), toks(S[b]["desc"])
    j = len(ta & tb) / max(1, len(ta | tb))
    if j > 0.28: pairs.append((round(j, 3), a, b, sorted(ta & tb)[:8]))
for j, a, b, sh in sorted(pairs, reverse=True):
    warns.append(f"trigger collision {j}: {a} <-> {b}  shared={sh}")

# --- Invariant 11: progressive disclosure — bodies stay small
for n, s in S.items():
    L = len(s["body"].splitlines())
    req(L <= 500, f"{n}: body {L} lines exceeds 500")

# --- Invariant 12: no secrets or credential-looking material committed
SECRET = re.compile(r"(ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY)")
for n, s in S.items():
    req(not SECRET.search(s["full"]), f"{n}: possible secret material")

# --- Invariant 13: every eval's expected skill exists
ev = json.load(open(os.path.join(ROOT, "evals/evals.json")))
for e in ev["evals"]:
    for key in ("expected_first",):
        v = e.get(key)
        if v: req(v in S, f"eval {e['id']}: expects non-existent skill {v}")
    for v in e.get("must_not_load_first", []):
        req(v in S, f"eval {e['id']}: references non-existent skill {v}")

print(f"skills checked : {len(S)}")
print(f"evals checked  : {len(ev['evals'])}")
print(f"\nFAILURES ({len(fails)})")
for f in fails: print("  FAIL", f)
print(f"\nWARNINGS ({len(warns)})")
for w in warns: print("  WARN", w)
print("\nRESULT:", "PASS" if not fails else "FAIL")
sys.exit(1 if fails else 0)
