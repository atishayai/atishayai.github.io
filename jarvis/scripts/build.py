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

# --- catalog row: [subj,num,title,credits,days,times,xlist,flags,level,instr,distr,open,prereq] ---
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
                    fl, c["level"], [iid(n) for n in c.get("instructors", [])],
                    c.get("distr", []), c.get("open", ""), c.get("prereq", [])])

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

reqs = json.load(open(f"{D}/requirements.json"))

# --- derive an approximate requirement model for every program we can map to a subject ---
# The curated entries above are exact. For the rest of the catalog, a program whose name
# matches a roster subject ("History (BA)" -> HIST) gets a two-slot approximation: half its
# estimated course count at any level, half at 3000+. Clearly labelled approximate — the
# point is that every mappable major and minor participates in pathways TODAY, and the
# label tells the student exactly how far to trust it.
# Tier 2: models extracted from each program's own catalog page (fetch_programs.py).
# Every count passed a self-consistency gate against the sentence it came from, which is
# shipped as evidence. Curated entries always win; the name-map approximation is the
# tier of last resort below.
try:
    _catalog = json.load(open(f"{D}/requirements_catalog.json"))
except FileNotFoundError:
    _catalog = {}
_covered = {p["name"] for p in reqs["programs"]}
for _pname, _cx in sorted(_catalog.items()):
    if _pname in _covered:
        continue
    _kind = "minor" if "minor" in _pname.lower() else "major"
    _slug = re.sub(r"[^a-z0-9]+", "-", _pname.lower()).strip("-")
    _ev = _cx.get("evidence", {})
    _entry = {
        "id": f"cat-{_slug}", "name": _pname, "kind": _kind, "confidence": "catalog",
        "source": _cx.get("source", ""), "slots": _cx["slots"],
        "note": "Read automatically from the official catalog page"
                + (" (subject inferred from the program name)" if _cx.get("subjectInferred") else "")
                + " — confirm details with the department.",
    }
    if _cx.get("rules"):
        _entry["rules"] = _cx["rules"]
    _ship_ev = {}
    if "count" in _ev:
        _ship_ev["count"] = _ev["count"][:150]
    for _k in ("minGrade", "letterOnly", "noSU"):
        if _k in _ev and len(_ship_ev) < 3:
            _ship_ev[_k] = _ev[_k][:150]
    if _ship_ev:
        _entry["evidence"] = _ship_ev
    reqs["programs"].append(_entry)
    _covered.add(_pname)
print(f"catalog-extracted requirement models: {len(_catalog)} programs")

_name2code = {v.strip().lower(): k for k, v in subjects.items() if isinstance(v, str) and v.strip()}
def _base(p): return re.sub(r"\s*\(.*?\)\s*$", "", p).strip().lower()
_derived = 0
for _pname, _pg in programs.items():
    if _pname in _covered:
        continue
    _b = _base(_pname)
    _code = _name2code.get(_b)
    if not _code:
        for _nm, _c in _name2code.items():
            if _nm and (_nm.startswith(_b) or _b.startswith(_nm)):
                _code = _c
                break
    if not _code or _code not in courses:
        continue
    _n = max(2, min(sum(_it.get("n") or 1 for _it in _pg.get("items", [])), 12))
    _kind = "minor" if "minor" in _pname.lower() else "major"
    _lower = (_n + 1) // 2
    _slug = re.sub(r"[^a-z0-9]+", "-", _pname.lower()).strip("-")
    _slots = [{"id": "found", "name": f"{_code} courses (any level)", "need": _lower,
               "match": {"pred": {"subjects": [_code], "minLevel": 1000}}}]
    if _n - _lower:
        _slots.append({"id": "upper", "name": f"{_code} upper-level (3000+)", "need": _n - _lower,
                       "match": {"pred": {"subjects": [_code], "minLevel": 3000}}})
    reqs["programs"].append({
        "id": f"auto-{_slug}", "name": _pname, "kind": _kind, "confidence": "approx",
        "source": _pg.get("source", ""),
        "note": f"Approximate: treated as {_n} {_code} courses. The real requirements have named slots - check the official page.",
        "slots": _slots})
    _derived += 1
print(f"derived approximate requirements for {_derived} programs (curated entries untouched)")
data = {"catalog": cat, "programs": slim, "subjectNames": subjects,
        "instructors": INSTR, "requirements": reqs,
        "built": __import__("datetime").date.today().isoformat()}
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
