#!/usr/bin/env python3
"""Build index.html from the template + data. Strips personal data. Run: python3 scripts/build.py"""
import json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data")
courses = json.load(open(f"{D}/courses.json"))
ratings = json.load(open(f"{D}/ratings.json"))
programs = json.load(open(f"{D}/programs_full.json"))
try:
    subjects = json.load(open(f"{D}/subjects.json"))
    subjects = {k: (v if isinstance(v, str) else "") for k, v in subjects.items()}
except Exception:
    subjects = {}
overlaps = None  # overlaps recomputed live in-app from crosslists; overlap_map.json kept for reference

# --- normalize catalog rows: [subj,num,title,credits,days,times,xlist,flags,level] ---
cat = []
for s in sorted(courses):
    for c in courses[s]:
        fl = (1 if c.get("su_option") else 0) | (2 if c.get("is_fws") else 0)
        cat.append([c["subject"], c["number"], c["title"], c["credits"],
                    c["meeting_days"], c["meeting_times"], ", ".join(c["crosslistings"]),
                    fl, c["level"]])

# --- strip any founder-specific / personal strings from program notes ---
PERSONAL = re.compile(r"Atishay|Georgetown|\bGU\b", re.I)
def clean(t):
    if not t:
        return None
    if PERSONAL.search(t):
        kept = [p for p in re.split(r"(?<=[.!?]) ", t) if not PERSONAL.search(p)]
        return " ".join(kept).strip() or None
    return t

slim = {}
for name, pg in programs.items():
    e = {"type": pg["type"], "source": pg["source"], "curated": pg.get("curated", False)}
    n = clean(pg.get("note"))
    if n:
        e["note"] = n
    items = []
    for it in pg.get("items", []):
        i2 = {"name": it["name"]}
        if it.get("n"):
            i2["n"] = it["n"]
        d = clean(it.get("detail"))
        if d:
            i2["detail"] = d
        if it.get("options"):
            i2["options"] = it["options"]
        items.append(i2)
    e["items"] = items
    slim[name] = e

data = {"catalog": cat, "ratings": ratings, "programs": slim, "subjectNames": subjects}
blob = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
assert "Atishay" not in blob and "Georgetown" not in blob, "PERSONAL DATA LEAKED — aborting build"

tpl = open(f"{ROOT}/scripts/build_template.html").read()
assert '"__INJECT_DATA__"' in tpl, "template placeholder missing"
html = tpl.replace('"__INJECT_DATA__"', blob)
open(f"{ROOT}/index.html", "w").write(html)
print(f"Built index.html ({len(html)//1024} KB) — {len(cat)} courses, {len(slim)} programs")
