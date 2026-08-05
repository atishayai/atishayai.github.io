#!/usr/bin/env python3
"""Extract requirement models from every program's official catalog page.

    python3 scripts/fetch_programs.py            # fetches, parses, writes
    python3 scripts/fetch_programs.py --cached   # re-parse without re-fetching

Rigour contract:
- Every fact carries the sentence it came from (`evidence`), so the UI can show a
  receipt, not an assertion.
- Facts are extracted only by high-confidence patterns: total course/credit counts,
  explicit course codes, and grade/registration rules. Anything the page states in
  prose too loose to parse is NOT guessed at — the program falls back to the name-map
  approximation and is listed in the coverage report.
- The output never overrides the hand-curated entries in requirements.json; build.py
  merges curated > catalog-extracted > approximate.

Pages are Courseleaf: content is server-rendered in #curriculumtextcontainer (and
#textcontainer for academic-standards prose).
"""
import json, os, re, ssl, sys, time, urllib.request
from html import unescape

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = ssl.create_default_context()

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
CACHE = os.path.join(DATA, "program_pages")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) jarvis-programs/1.0"

WORDS = {w: i for i, w in enumerate(
    "zero one two three four five six seven eight nine ten eleven twelve".split())}
CODE = re.compile(r"\b([A-Z]{2,6})[\s ]+(\d{4})\b")


def fetch(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45, context=SSL_CTX) as r:
                return r.read().decode("utf-8", "replace")
        except OSError as e:
            if i == tries - 1:
                raise RuntimeError(f"{url}: {e}")
            time.sleep(2 ** i)


def strip_tags(html):
    html = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", html)
    html = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"[ \t ]+", " ", unescape(html))


def section(html, div_id):
    # Template revisions vary: end comments are "<!--end" or "<!-- end", and the tab div
    # may be the last container on the page — so </body> is the terminator of last resort.
    m = re.search(rf'<div[^>]*id="{div_id}"[^>]*>[\s\S]*?'
                  rf'(?=<div[^>]*id="\w+container"|<!--\s*end|</body)', html)
    return strip_tags(m.group(0)) if m else ""


def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?;])\s+|\n+", text) if s.strip()]


def find_rule(sents, pattern):
    rx = re.compile(pattern, re.I)
    for s in sents:
        if rx.search(s):
            return s[:240]
    return None


def carve_req_block(text):
    """The program's OWN requirements, minus the college boilerplate every page embeds.
    Counts and rules read from the full page attribute university-wide text ("the
    University has two requirements for graduation") to the program — the exact bug a
    spot-check caught. Start at the program's requirements heading; stop at shared
    sections."""
    start = re.search(r"(Minor|Major|Program|Degree|Curriculum)\s+Requirements?", text)
    t = text[start.start():] if start else text
    stop = re.search(r"(Additional|University|College|Graduation)\s+Requirements?"
                     r"|Requirements?\s+for\s+the\s+(Degree|Bachelor)"
                     r"|Distribution\s+Requirements?|First-Year\s+Writing", t)
    block = t[:stop.start()] if stop else t
    # A heading layout we did not anticipate can leave a sliver; better the full tab with
    # some boilerplate than nothing of the program.
    return block if len(block) >= 300 else text


def parse_program(name, html, subjects_in_roster, name2code=None):
    curr = section(html, "curriculumtextcontainer")
    over = section(html, "textcontainer")
    if not (curr or over):
        return None, "no content container found"
    block = carve_req_block(curr) if curr else ""
    # program-specific standards often live in the Overview tab; cut it at the same
    # boilerplate markers so college-wide rules are not attributed to the program
    over_own = carve_req_block(over) if over else ""
    sents = sentences(block + " " + over_own)

    out = {"rules": {}, "evidence": {}}
    for key, pat in [
        ("minGrade", r"\bgrade of\s+([A-D][+-]?)\s+or\s+(better|higher)"),
        ("letterOnly", r"letter grade"),
        ("noSU", r"S/U|S\-U|satisfactory/unsatisfactory"),
        ("noFWS", r"FWS.{0,40}(not|no)\b|\b(not|no)\b.{0,40}FWS"),
        ("atCornell", r"(taken|completed) at Cornell"),
        ("noTransfer", r"transfer credit.{0,50}(not|no)\b|\b(not|no)\b.{0,50}transfer credit"),
    ]:
        ev = find_rule(sents, pat)
        if ev:
            if key == "minGrade":
                m = re.search(r"\bgrade of\s+([A-D][+-]?)\s+or", ev, re.I)
                if not m:
                    continue
                out["rules"]["minGrade"] = m.group(1).upper()
            else:
                out["rules"][key] = True
            out["evidence"][key] = ev[:160]

    # course count — from the program's own block only
    n = None
    count_rx = re.compile(r"\b(?:completion of|complete|completing|at least|minimum of|requires?|"
                          r"must take|take|choose|select|consists? of|comprised of|total of)\s+"
                          r"(\w+)\s*(?:\(\d+\)\s*)?(?:[A-Za-z-]+\s+){0,3}?courses", re.I)
    for stc in sentences(block):
        for m in count_rx.finditer(stc):
            tok = m.group(1).lower()
            val = WORDS.get(tok) if tok in WORDS else (int(tok) if tok.isdigit() else None)
            if val and 2 <= val <= 20:
                n = val
                out["evidence"]["count"] = stc[:160]
                break
        if n:
            break
    m = re.search(r"Minimum Credits[^:]*\b(Minor|Major)\b[^:]*:\s*(\d+)", curr or "")
    if m:
        out["minCredits"] = int(m.group(2))

    codes, seen = [], set()
    for subj, num in CODE.findall(block):
        c = f"{subj} {num}"
        if subj in subjects_in_roster and c not in seen:
            seen.add(c)
            codes.append(c)
    subj_counts = {}
    for c in codes:
        subj_counts[c.split()[0]] = subj_counts.get(c.split()[0], 0) + 1
    main_subjects = sorted(subj_counts, key=subj_counts.get, reverse=True)[:4]

    if n and not main_subjects and name2code:
        base = re.sub(r"\s*\(.*?\)\s*$", "", name).strip().lower()
        mapped = name2code.get(base)
        if not mapped:
            for nm, c in name2code.items():
                if nm and (nm.startswith(base) or base.startswith(nm)):
                    mapped = c
                    break
        if mapped and mapped in subjects_in_roster:
            main_subjects = [mapped]
            out["subjectInferred"] = True

    # Self-consistency gates. These reject rather than repair — a wrong requirement count
    # is worse than an honest fallback.
    # (a) no real major requires <= 3 courses; that number is college boilerplate
    if n and n <= 3 and "minor" not in name.lower():
        n = None
        out["evidence"].pop("count", None)
    # (b) the evidence sentence must actually contain the number it allegedly states
    if n:
        ev = out["evidence"].get("count", "").lower()
        word = {v: k for k, v in WORDS.items()}.get(n, "~~")
        if str(n) not in ev and word not in ev:
            n = None
            out["evidence"].pop("count", None)

    slots = []
    if n and len(codes) >= n:
        slots.append({"id": "named", "name": "Courses from the official list",
                      "need": n, "match": {"from": codes[:80]}})
    elif n and main_subjects:
        slots.append({"id": "breadth", "name": f"Courses in {', '.join(main_subjects)}",
                      "need": n, "match": {"pred": {"subjects": main_subjects, "minLevel": 1000}}})
    elif len(codes) >= 4:
        slots.append({"id": "named", "name": "Courses from the official list",
                      "need": max(2, min(len(codes) // 4, 6)), "match": {"from": codes[:80]}})
    if not slots:
        return None, f"no parseable count or course list (n={n}, codes={len(codes)})"
    return {"n": n, "slots": slots, **out}, None


def main():
    cached = "--cached" in sys.argv
    programs = json.load(open(f"{DATA}/programs_full.json"))
    courses = json.load(open(f"{DATA}/courses.json"))
    subjects_in_roster = set(courses)
    try:
        _subj = json.load(open(f"{DATA}/subjects.json"))
        name2code = {v.strip().lower(): k for k, v in _subj.items() if isinstance(v, str) and v.strip()}
    except Exception:
        name2code = {}
    os.makedirs(CACHE, exist_ok=True)

    results, report = {}, {"extracted": [], "fallback": [], "fetch_failed": [], "skipped_noncatalog": []}
    for i, (name, pg) in enumerate(sorted(programs.items()), 1):
        url = pg.get("source", "")
        if "catalog.cornell.edu/programs/" not in url and "courses.cornell.edu/programs/" not in url:
            report["skipped_noncatalog"].append(name)
            continue
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        cache_file = os.path.join(CACHE, slug + ".html")
        try:
            if cached and os.path.exists(cache_file):
                html = open(cache_file, encoding="utf-8").read()
            else:
                html = fetch(url)
                open(cache_file, "w", encoding="utf-8").write(html)
                time.sleep(0.35)
        except RuntimeError as e:
            report["fetch_failed"].append(f"{name}: {e}")
            continue
        parsed, why = parse_program(name, html, subjects_in_roster, name2code)
        if parsed:
            parsed["source"] = url
            results[name] = parsed
            report["extracted"].append(name)
        else:
            report["fallback"].append(f"{name}: {why}")
        if i % 25 == 0:
            print(f"  [{i}/{len(programs)}] extracted={len(report['extracted'])} fallback={len(report['fallback'])}")

    json.dump(results, open(f"{DATA}/requirements_catalog.json", "w"), indent=1)
    json.dump(report, open(f"{DATA}/programs_report.json", "w"), indent=1)
    print(f"\nExtracted from official pages: {len(report['extracted'])}")
    print(f"Fell back (page too loose to parse): {len(report['fallback'])}")
    print(f"Fetch failed: {len(report['fetch_failed'])}")
    print(f"Non-catalog sources skipped: {len(report['skipped_noncatalog'])}")
    print("Details in data/programs_report.json. Next: python3 scripts/build.py")


if __name__ == "__main__":
    main()
