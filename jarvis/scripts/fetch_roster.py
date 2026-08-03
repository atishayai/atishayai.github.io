#!/usr/bin/env python3
"""Cornell adapter — build courses.json from the official Class Roster API.

    python3 scripts/fetch_roster.py [ROSTER]      # default FA26

Replaces parse_roster.py, which regex-parsed scraped markdown. That approach
collected meeting days into an alphabetically sorted set and meeting times into a
separate document-order list, then the app paired them by index — so any course
with more than one meeting pattern could display a day joined to another
section's time. AEM 2200 showed "F 12:20PM-01:10PM" when the real Friday
discussion meets 11:15AM-12:05PM and 12:20PM-01:10PM is the MWF lecture. 23% of
the catalog was affected, and extra sections past the shorter list were dropped.

The API returns each section separately with its own pattern/timeStart/timeEnd,
so meeting_days[i] and meeting_times[i] are built as genuinely parallel arrays.

Docs: https://classes.cornell.edu/content/SP20/api-details
"""
import json, os, ssl, sys, time, urllib.request, urllib.error

# python.org builds ship without a CA bundle wired in, so HTTPS verification
# fails out of the box. Prefer certifi; fall back to the system store. Never
# disable verification — this pulls data we then present as authoritative.
try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = ssl.create_default_context()

API = "https://classes.cornell.edu/api/2.0"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
# Student Option and S/U-eligible bases; the app uses this for its S/U filter.
SU_BASES = {"OPT", "OPI", "SUI", "SUS"}


def get(url, tries=4):
    """GET JSON with backoff. The roster API is public but rate-limits bursts."""
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "jarvis-roster/1.0"})
            with urllib.request.urlopen(req, timeout=45, context=SSL_CTX) as r:
                return json.loads(r.read().decode())
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as e:
            if i == tries - 1:
                raise RuntimeError(f"failed after {tries} tries: {url} ({e})")
            time.sleep(2 ** i)


def credits_str(g):
    lo, hi = g.get("unitsMinimum"), g.get("unitsMaximum")
    fmt = lambda v: str(int(v)) if float(v) == int(v) else str(v)
    if lo is None and hi is None:
        return ""
    if lo == hi or hi is None:
        return fmt(lo)
    return f"{fmt(lo)}-{fmt(hi)}"


def instructors(course):
    """Distinct instructor names, in section order. Official roster data, so this is
    the one professor field we can ship — ratings sites forbid automated collection."""
    seen, out = set(), []
    for g in course.get("enrollGroups", []):
        for s in g.get("classSections", []):
            for m in s.get("meetings", []):
                for i in m.get("instructors", []) or []:
                    name = " ".join(p for p in [i.get("firstName"), i.get("lastName")] if p).strip()
                    if name and name.lower() not in seen:
                        seen.add(name.lower())
                        out.append(name)
    return out


def meeting_pairs(course):
    """Distinct (day-pattern, time) pairs, lectures first, index-aligned.

    Deduped because a course may run a dozen lab sections that meet at only a
    few distinct times (AEM 2100: 12 LAB sections, 5 distinct slots).
    """
    seen, lec, other = set(), [], []
    for g in course.get("enrollGroups", []):
        for s in g.get("classSections", []):
            comp = (s.get("ssrComponent") or "").upper()
            for m in s.get("meetings", []):
                pat = (m.get("pattern") or "").strip()
                st, en = (m.get("timeStart") or "").strip(), (m.get("timeEnd") or "").strip()
                if not pat or pat.upper() == "TBA" or not st or not en:
                    continue
                pair = (pat, f"{st}-{en}")
                if pair in seen:
                    continue
                seen.add(pair)
                (lec if comp == "LEC" else other).append(pair)
    return lec + other


def course_row(c):
    groups = c.get("enrollGroups") or [{}]
    num = str(c.get("catalogNbr", "")).strip()
    if not num.isdigit():
        return None
    pairs = meeting_pairs(c)
    xl = sorted({
        f'{sc["subject"]} {sc["catalogNbr"]}'
        for g in groups for sc in (g.get("simpleCombinations") or [])
        if not (sc["subject"] == c["subject"] and str(sc["catalogNbr"]) == num)
    })
    title = (c.get("titleLong") or c.get("titleShort") or "").strip()
    attrs = " ".join(filter(None, [c.get("catalogAttribute") or "", c.get("catalogSatisfiesReq") or ""]))
    return {
        "subject": c["subject"],
        "number": num,
        "title": title,
        "credits": credits_str(groups[0]),
        "crosslistings": xl,
        "url": f'https://classes.cornell.edu/browse/roster/{c.get("strm","")}/class/{c["subject"]}/{num}',
        "meeting_days": [p[0] for p in pairs],
        "meeting_times": [p[1] for p in pairs],
        "instructors": instructors(c),
        "su_option": any((g.get("gradingBasis") or "") in SU_BASES for g in groups),
        "is_fws": "FWS" in title.upper() or "FWS" in attrs.upper(),
        "dist_tags": sorted({t.strip() for t in (c.get("catalogDistr") or "").replace("(", "").replace(")", "").split(",") if t.strip()}),
        "level": int(num[0]) * 1000,
    }


def main(roster="FA26"):
    subjects = [s["value"] for s in get(f"{API}/config/subjects.json?roster={roster}")["data"]["subjects"]]
    print(f"{roster}: {len(subjects)} subjects")
    out, status, failed = {}, {}, []
    for i, subj in enumerate(sorted(subjects), 1):
        try:
            data = get(f"{API}/search/classes.json?roster={roster}&subject={subj}")
        except RuntimeError as e:
            failed.append(subj)
            print(f"  [{i:3d}/{len(subjects)}] {subj:6s} FAILED — {e}")
            continue
        rows = [r for r in (course_row(c) for c in data["data"]["classes"]) if r]
        if rows:
            out[subj] = rows
        sched = sum(1 for r in rows if r["meeting_days"])
        status[subj] = {"courses": len(rows), "with_meetings": sched}
        print(f"  [{i:3d}/{len(subjects)}] {subj:6s} {len(rows):4d} courses, {sched:4d} scheduled")
        time.sleep(0.3)  # be polite to a public university endpoint

    if failed:
        # Refuse to half-write the catalog; a silently short file is how the old
        # pipeline lost MGMT entirely.
        sys.exit(f"\nABORT — {len(failed)} subject(s) failed: {', '.join(failed)}\nNothing written. Re-run to retry.")

    os.makedirs(DATA, exist_ok=True)
    with open(f"{DATA}/courses.json", "w") as f:
        json.dump(out, f, indent=1)
    with open(f"{DATA}/fetch_status.json", "w") as f:
        json.dump({"roster": roster, "subjects": len(out), "by_subject": status}, f, indent=1)
    tot = sum(len(v) for v in out.values())
    print(f"\nWrote courses.json — {len(out)} subjects, {tot} courses")
    print("Next: python3 scripts/build.py && node scripts/test_jarvis.js")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "FA26")
