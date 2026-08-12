#!/usr/bin/env python3
from pathlib import Path

path = Path("automation/pandora_p1_source_guard.py")
lines = path.read_text().splitlines(keepends=True)
label_index = next((i for i, line in enumerate(lines) if '"plan copy",' in line), None)
if label_index is None:
    raise SystemExit("plan copy matcher label not found")
start = label_index
while start >= 0 and "text = replace_once(" not in lines[start]:
    start -= 1
if start < 0:
    raise SystemExit("plan copy matcher start not found")
end = label_index
while end < len(lines) and lines[end].strip() != ")":
    end += 1
if end >= len(lines):
    raise SystemExit("plan copy matcher end not found")
replacement = [
    "    text = replace_once(\n",
    "        text,\n",
    "        \"'Pandora plans first. The backend still enforces approval and the extra '\",\n",
    "        \"'Pandora plans first. Approval and an extra identity check still apply '\",\n",
    "        \"plan copy first line\",\n",
    "    )\n",
    "    text = replace_once(\n",
    "        text,\n",
    "        \"'identity check before protected changes.'\",\n",
    "        \"'before protected changes.'\",\n",
    "        \"plan copy second line\",\n",
    "    )\n",
]
path.write_text("".join(lines[:start] + replacement + lines[end + 1:]))
