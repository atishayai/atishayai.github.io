#!/usr/bin/env python3
"""Build index.html from the template + data. Strips personal data. Run: python3 scripts/build.py"""
import json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data")
courses = json.load(open(f"{D}/courses.json"))
# ratings.json was a scraped CUReviews table covering 2% of the catalog. Dropped:
# the app now uses the student's own ratings, which carry no licensing question.
programs = json.load(open(f"{D}/programs_full.json"))
try:
    subjects = json.load(open(f"{D}/subjects.json"))
    subjects = {k: (v if isinstance(v, str) else "") for k, v in subjects.items()}
except Exception:
    subjects = {}
overlaps = None  # overlaps recomputed live in-app from crosslists; overlap_map.json kept for reference

# --- normalize catalog rows: [subj,num,title,credits,days,times,xlist,flags,level,instr] ---
cat = []
INSTR, _instr_ix = [], {}
def iid(name):
    if name not in _instr_ix:
        _instr_ix[name] = len(INSTR)
        INSTR.append(name)
    return _instr_ix[name]
for s in sorted(courses):
    for c in courses[s]:
        fl = (1 if c.get("su_option") else 0) | (2 if c.get("is_fws") else 0)
        # index 9: instructor ids into the shared name table below. Deduped because
        # 2,600 names spread over 4,100 courses is a lot of repeated strings to ship.
        cat.append([c["subject"], c["number"], c["title"], c["credits"],
                    c["meeting_days"], c["meeting_times"], ", ".join(c["crosslistings"]),
                    fl, c["level"], [iid(n) for n in c.get("instructors", [])]])

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

data = {"catalog": cat, "programs": slim, "subjectNames": subjects,
        "instructors": INSTR}
blob = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
assert "Atishay" not in blob and "Georgetown" not in blob, "PERSONAL DATA LEAKED — aborting build"

tpl = open(f"{ROOT}/scripts/build_template.html").read()
assert '"__INJECT_DATA__"' in tpl, "template placeholder missing"
html = tpl.replace('"__INJECT_DATA__"', blob)

# Social scrapers ignore relative og:image/og:url, so these must be absolute.
# Override when deploying elsewhere:  SITE_URL=https://jarvis.example/ python3 scripts/build.py
site = os.environ.get("SITE_URL", "https://www.atishay.io/jarvis/")
if not site.endswith("/"):
    site += "/"
html = html.replace("__SITE_URL__", site)
assert "__SITE_URL__" not in html, "share-link placeholder left unfilled"

open(f"{ROOT}/index.html", "w").write(html)
print(f"Built index.html ({len(html)//1024} KB) — {len(cat)} courses, {len(slim)} programs — share URL {site}")
