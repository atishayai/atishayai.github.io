#!/usr/bin/env python3
"""Cornell adapter: parse fetched roster pages (markdown from web_fetch) into courses.json.

Usage: python3 parse_roster.py <tool_results_dir> <data_dir>
Auto-detects which subject each file contains. Verifies parsed count vs 'Showing X results'.
"""
import json, re, sys, os, glob

def parse_page(text):
    """Return (subject, claimed_count, courses)."""
    m = re.search(r'# .*\((\w+)\)\*', text)
    subject = m.group(1) if m else None
    m = re.search(r'Showing (\d+) results', text)
    claimed = int(m.group(1)) if m else None

    # Course headers: ### ANTHR 1101 [Title](url) ...
    header_re = re.compile(r'^### ([A-Z]+) (\d{4}) \[([^\]]+)\]\(([^)]+)\)', re.M)
    headers = list(header_re.finditer(text))
    courses = []
    for i, h in enumerate(headers):
        start = h.end()
        end = headers[i+1].start() if i+1 < len(headers) else len(text)
        block = text[start:end]
        subj, num, title, url = h.group(1), h.group(2), h.group(3).strip(), h.group(4)

        # Credits: first "N Credits" or "N-M Credits" in block
        cm = re.search(r'([\d.]+(?:-[\d.]+)?) Credits?', block)
        credits = cm.group(1) if cm else ''

        # Crosslistings: "*Combined with:" followed by a line of [XXX 1234](url) links
        xl = []
        for cw in re.finditer(r'Combined with:?\s*\n?([^\n]*(?:\n[^\n*#]*)?)', block):
            xl += re.findall(r'\[([A-Z]+) (\d{4})\]', cw.group(1))
        xl = sorted({f"{s} {n}" for s, n in xl if not (s == subj and n == num)})

        # Meeting patterns: day strings like MWF / TR before a time
        days = sorted({d for d in re.findall(r'^\s*\+ (M|T|W|R|F|S|U|MW|MF|WF|TR|MWF|MTWRF|TBA)\b', block, re.M)})
        times = re.findall(r'(\d{1,2}:\d{2}[ap]m) - (\d{1,2}:\d{2}[ap]m)', block)

        # Grading
        satun = bool(re.search(r'Student Option|S/U', block))
        fws = bool(re.search(r'FWS', title)) or bool(re.search(r'\*FWS Session', block))

        # Distribution tags sometimes appear inline like (ALC-AS), (SCD-AS)
        dist = sorted(set(re.findall(r'\(((?:ALC|BIO|ETM|GLC|HST|IHS|PBS|PHS|SCD|SDS)-AS)[,)]?', block)))

        courses.append({
            "subject": subj, "number": num, "title": title, "credits": credits,
            "crosslistings": xl, "url": url,
            "meeting_days": days, "meeting_times": [f"{a}-{b}" for a, b in times[:6]],
            "su_option": satun, "is_fws": fws, "dist_tags": dist,
            "level": int(num[0]) * 1000,
        })
    return subject, claimed, courses

def main(results_dir, data_dir):
    out, status = {}, {}
    for path in sorted(glob.glob(os.path.join(results_dir, 'mcp-workspace-web_fetch-*.txt'))):
        text = open(path, encoding='utf-8', errors='replace').read()
        if 'classes.cornell.edu' not in text and '### ' not in text:
            continue
        subject, claimed, courses = parse_page(text)
        if not subject or not courses:
            continue
        # Keep the version with the most courses if a subject was fetched twice
        if subject in out and len(out[subject]) >= len(courses):
            continue
        out[subject] = courses
        status[subject] = {
            "claimed": claimed, "parsed": len(courses),
            "complete": claimed == len(courses),
            "file": os.path.basename(path),
        }
    os.makedirs(data_dir, exist_ok=True)
    with open(os.path.join(data_dir, 'courses.json'), 'w') as f:
        json.dump(out, f, indent=1)
    with open(os.path.join(data_dir, 'fetch_status.json'), 'w') as f:
        json.dump(status, f, indent=1)
    for s, st in sorted(status.items()):
        flag = 'OK' if st['complete'] else 'TRUNCATED'
        print(f"{s:6s} {st['parsed']:3d}/{st['claimed']} {flag}")

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
