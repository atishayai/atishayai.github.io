#!/usr/bin/env python3
"""Compute the overlap map: courses appearing under 2+ of the student's target subjects."""
import json, os, sys

DATA = sys.argv[1] if len(sys.argv) > 1 else 'data/CORNELL/FA26'

courses = json.load(open(os.path.join(DATA, 'courses.json')))
profile = json.load(open(os.path.join(DATA, 'student_profile.json')))
# Rank by hits among the student's target subjects, not all fetched subjects
targets = set(profile.get('subjects_direct', []) + profile.get('subjects_adjacent', []))
if not targets:
    targets = set(courses.keys())

# Canonicalize: a course + its crosslists form one group. Use lowest code alphabetically.
overlap = {}
for subj, lst in courses.items():
    for c in lst:
        codes = sorted([f"{c['subject']} {c['number']}"] + c['crosslistings'])
        canonical = codes[0]
        entry = overlap.setdefault(canonical, {
            "all_codes": set(), "titles": set(), "credits": c['credits'],
            "subjects_hit": set(), "urls": set(), "levels": set(),
            "meeting_days": set(), "is_fws": c['is_fws'],
        })
        entry['all_codes'].update(codes)
        entry['titles'].add(c['title'])
        entry['urls'].add(c['url'])
        entry['levels'].add(c['level'])
        entry['meeting_days'].update(c['meeting_days'])
        # subjects hit = target subjects among all codes
        for code in codes:
            s = code.split()[0]
            if s in targets:
                entry['subjects_hit'].add(s)

result = []
for canon, e in overlap.items():
    result.append({
        "canonical": canon,
        "all_codes": sorted(e['all_codes']),
        "title": sorted(e['titles'], key=len)[-1],
        "credits": e['credits'],
        "subjects_hit": sorted(e['subjects_hit']),
        "n_hit": len(e['subjects_hit']),
        "level": min(e['levels']),
        "meeting_days": sorted(e['meeting_days']),
        "is_fws": e['is_fws'],
        "url": sorted(e['urls'])[0],
    })

result.sort(key=lambda r: (-r['n_hit'], r['level'], r['canonical']))

with open(os.path.join(DATA, 'overlap_map.json'), 'w') as f:
    json.dump(result, f, indent=1)

multi = [r for r in result if r['n_hit'] >= 2]
print(f"Total unique courses: {len(result)}")
print(f"Courses hitting 2+ target subjects: {len(multi)}")
print(f"Courses hitting 3+ target subjects: {sum(1 for r in multi if r['n_hit'] >= 3)}")
print("\nTop 15:")
for r in multi[:15]:
    print(f"  {r['n_hit']}x  {r['canonical']:12s} {r['title'][:52]:52s} [{', '.join(r['subjects_hit'])}]")
