# COURSE OPTIMIZER — MASTER PROMPT
### A universal college course planning tool. Cornell is the pilot. Any school can be added.

---

## THE VISION

This is a consumer app — not a one-off script. The problem it solves exists at every university:
students have overlapping major/minor requirements, distribution categories, schedule constraints,
and credit limits, but no tool intelligently surfaces the courses that satisfy the most boxes at once.
The goal is a system where any student at any college can input their parameters and get:

1. A complete catalog of courses relevant to their programs
2. A ranked list of high-leverage courses (satisfy 2+ requirements simultaneously)
3. A degree audit showing what they've covered and what's left
4. A suggested semester-by-semester pathway

The reference implementation is **Cornell University, Fall 2026**. Every architectural decision
should be made with generalization in mind — so that adding UCLA, Michigan, or UVA later
requires writing a new "adapter," not rebuilding the whole system.

---

## SYSTEM ARCHITECTURE

The system has four layers. Build them in order.

### Layer 1: Student Profile
The input. Collected once, drives everything else.

```json
{
  "student_name": "optional",
  "college": "Cornell University",
  "college_code": "CORNELL",
  "college_system": "arts_and_sciences",
  "semester": "FA26",
  "declared_major": "Anthropology",
  "exploring": ["Cognitive Science", "Linguistics", "Philosophy", "Psychology"],
  "constraints": {
    "no_days": ["F"],
    "no_before": "9:00am",
    "no_after": "6:00pm",
    "max_credits_per_semester": 18,
    "min_credits_per_semester": 12,
    "exclude_levels": ["6000+"],
    "include_sat_unsat": true
  },
  "credits_completed": 0,
  "standing": "freshman"
}
```

### Layer 2: College Adapter
One adapter per institution. Each adapter must implement:

```python
class CollegeAdapter:
    college_name: str
    semester_codes: list[str]          # e.g. ["FA26", "SP27"]
    subject_map: dict[str, str]        # "Anthropology" -> "ANTHR"
    roster_url(subject, semester) -> str
    parse_roster_page(raw_text) -> list[Course]
    degree_requirements_url(program) -> str
    distribution_categories: list[DistributionCategory]
```

The Cornell adapter (reference implementation) is fully specified below.
When adding a new college, write a new adapter class. Everything else stays the same.

### Layer 3: Data Store
Flat JSON files per run. No database required for the MVP.

```
/data/
  {college_code}/
    {semester}/
      courses.json          # all fetched course data
      programs.json         # degree/minor requirements
      student_profile.json  # student's parameters
      overlap_map.json      # precomputed crosslisting analysis
/output/
  {college_code}_{semester}_{timestamp}.xlsx
```

### Layer 4: Workbook Generator
Python + openpyxl. Takes Layer 3 data and produces the Excel output.
One generator, works for any college (driven by the adapter's schema).

---

## STEP-BY-STEP SESSION FLOW

Run these steps in order every time a new student uses the tool.

### Step 0 — Identify the college
Ask: "What college or university are you at?"
- If Cornell → use Cornell adapter (fully built below)
- If other → say "That college isn't in the system yet. I can still help manually,
  or we can build an adapter for it together. Want to proceed?"

### Step 1 — Collect student profile
Ask these questions (use a multiple-choice UI widget if available):

1. What is your declared or intended major?
2. What other majors, minors, concentrations, or interest areas are you exploring?
   (list as many as you want — more is better)
3. What semester are you planning for?
4. Any schedule constraints? (days to avoid, time windows, credit load)
5. How many credits have you completed so far?
6. Should I include graduate seminars (6000-level and above)?

Do NOT fetch any course data until this is complete.

### Step 2 — Map interests to subject codes
Use the college adapter's `subject_map` to translate program names into fetchable subject codes.
Also add "adjacent" subjects known to crosslist heavily with the student's interests.

Example for Cornell:
- Student says: Anthropology + Cognitive Science + Linguistics + Philosophy
- Direct codes: ANTHR, COGST, LING, PHIL
- Adjacent codes (high crosslist overlap): HD, PSYCH, SOC, RELST, STS
- Confirm the full list with the student before fetching

### Step 3 — Fetch course data
For each subject code:
1. Fetch `roster_url(subject, semester)` using web_fetch or Chrome browser tools
2. Check: does parsed course count match "Showing X results" in page header?
3. If counts match → store in courses.json
4. If truncated (counts don't match) → flag the subject, ask student to paste raw text from browser
5. Parse pasted text with the adapter's `parse_roster_page()` method

**Never fetch all subjects.** Only fetch the mapped codes from Step 2.

### Step 4 — Fetch degree requirements
For each program in the student's list:
1. Navigate to the program's requirements page
2. Extract: required courses, elective options, credit minimums, prerequisite chains
3. Note when-offered (fall only, spring only, alternate years)
4. Store in programs.json

### Step 5 — Compute overlap map
Find all courses that appear in 2+ of the student's target subjects (via crosslistings).
Rank by: number of subjects hit × relevance to stated programs.
This is the core product output.

### Step 6 — Generate workbook
Run build script. Verify output. Deliver file.

---

## CORNELL ADAPTER (REFERENCE IMPLEMENTATION)

### Roster URL pattern
```
https://classes.cornell.edu/browse/roster/{SEMESTER}/subject/{SUBJECT_CODE}
```

### Subject → Program mapping (partial — most common programs)
```
ANTHR  → Anthropology
ARKEO  → Archaeology
ASIAN  → Asian Studies
AMS    → American Studies
CAPS   → China & Asia-Pacific Studies
COGST  → Cognitive Science
CS     → Computer Science
DEA    → Design & Environmental Analysis
ECON   → Economics
ENGL   → English
FGSS   → Feminist, Gender & Sexuality Studies
FILM   → Film
GOVT   → Government
HD     → Human Development
HIST   → History
INFO   → Information Science
LING   → Linguistics
MATH   → Mathematics
MUSIC  → Music
NEAR   → Near Eastern Studies
PHIL   → Philosophy
PHYS   → Physics
PSYCH  → Psychology
RELST  → Religious Studies
SOC    → Sociology
SPAN   → Spanish
STS    → Science & Technology Studies
```

### ⚠️ CRITICAL: Cornell web fetch truncation
Cornell roster pages are large. Pages with 30+ courses exceed ~100,000 characters
and are silently truncated by web_fetch — you will not get an error, courses will
simply be missing from the end of the page.

**Always verify:** after parsing, compare your course count to the "Showing X results"
header on the page. If they differ, the page was truncated.

**Fix options (in order of preference):**
1. If Chrome browser tools are connected (`mcp__claude-in-chrome__*`), use those —
   they render JavaScript and return the full page
2. Ask the student to open the URL in their browser, Cmd+A, Cmd+C, paste into chat
3. Parse the pasted text with the regex below

### Cornell roster page parser (for pasted text)
```python
import re, json

def parse_cornell_roster(text: str, subject: str) -> list[dict]:
    pattern = re.compile(
        r'^' + subject + r' (\d{4})\n'
        r'\[([^\]]+)\]\(([^)]+)\)\n'
        r'(?:.*?Combined with.*?\n)?'
        r'\* ([\d.]+(?:-[\d.]+)?) Credits?',
        re.MULTILINE
    )
    courses = []
    for m in pattern.finditer(text):
        number, title, url, credits = m.groups()
        # Extract crosslistings from the Combined with line if present
        combined_section = text[m.start():m.end()]
        crosslistings = re.findall(r'\[([A-Z]+ \d{4})\]', combined_section)
        crosslistings = [c for c in crosslistings if not c.startswith(subject)]
        courses.append({
            "subject": subject,
            "number": number,
            "title": title.strip(),
            "credits": credits,
            "crosslistings": crosslistings,
            "url": url
        })
    return courses
```

### Cornell A&S distribution requirements
Every A&S student must satisfy all of these, regardless of major:

| Code    | Name                           | Min Credits |
|---------|--------------------------------|-------------|
| ALC-AS  | Arts, Literature & Culture     | 3           |
| BIO-AS  | Biological Sciences            | 3           |
| ETM-AS  | Ethics & the Mind              | 3           |
| GLC-AS  | Global Citizenship             | 3           |
| HST-AS  | Historical Analysis            | 3           |
| IHS-AS  | Inequality & the Human Sciences| 3           |
| PBS-AS  | Physical & Biological Sciences | 3           |
| PHS-AS  | Physical Sciences              | 3           |
| SCD-AS  | Social Difference              | 3           |
| SDS-AS  | Statistics & Data Science      | 3           |
| FWS     | First-Year Writing Seminar     | 6 (two seminars) |
| LANG    | Language requirement           | through 2000-level |
| TOTAL   | Graduation minimum             | 120 credits |

**Important**: Distribution tags (ALC-AS, ETM-AS, etc.) do not appear in bulk roster data.
They only appear on individual course pages at:
`https://classes.cornell.edu/browse/roster/FA26/class/{SUBJECT}/{NUMBER}`
Build in a note that students must verify tags before relying on them.

### High-overlap crosslisting clusters at Cornell
When a student's interests touch one of these clusters, fetch ALL subjects in the cluster:

| Cluster                  | Subjects                                    |
|--------------------------|---------------------------------------------|
| Mind & Behavior          | COGST, PSYCH, HD, LING, PHIL, BIONB        |
| Social Science           | SOC, ANTHR, GOVT, HD, STS, HIST            |
| Language & Culture       | LING, COGST, ANTHR, ASIAN, NEAR, RELST     |
| Science & Society        | STS, SOC, HIST, PHIL, INFO                  |
| Asian / Global Studies   | ASIAN, ANTHR, HIST, RELST, CAPS, NEAR       |

---

## EXCEL WORKBOOK SPECIFICATION

Generate a `.xlsx` file using Python + openpyxl with these sheets:

### Sheet 1: Read Me
- Student name, college, programs, date generated
- Parameter summary (constraints applied)
- How to use each sheet
- Caveats: distribution tags unverified, roster updates daily, not a substitute for advisor
- Links: class scheduler, degree audit system, advisor contacts

### Sheet 2: Distribution & Degree Requirements
- College-level distribution categories (description, min credits, example courses)
- For each declared/explored program: required courses, recommended electives, prereq notes
- Source URL for each requirement set
- A "coverage meter" column: which requirements does the student currently have a plan for?

### Sheet 3: The Overlap Finder ← CORE PRODUCT VALUE
Courses that satisfy 2+ of the student's requirements simultaneously.
Sorted by: number of programs/requirements hit (descending).

Columns:
- Primary Code | All Equivalent Codes | Title | Credits
- Programs Hit (count) | Which Programs | Distribution Tag (if known/likely)
- Roster URL | Notes

This sheet is the reason the product exists. A student who picks from the top
of this list gets the most degree progress per course enrolled.

### Sheet 4: Full Course Catalog
All courses across the student's selected subjects.
Formatted as an Excel Table (filterable).

Columns:
- Subject | Number | Title | Credits | Level | Crosslistings | Roster URL

Pre-add filter suggestions in a note: filter by level (2000-level for sophmores),
by credits (3-credit courses), by subject.

### Sheet 5: Semester Pathway (Illustrative)
An 8-semester roadmap. Not prescriptive — clearly labeled as illustrative.

Rules for the pathway generator:
- Place high-overlap courses in semesters 2-4 (after FWS, before major requirements lock in)
- Respect known prereq chains (note them, don't guarantee correctness)
- Keep each semester between min and max credits from student profile
- Flag: "verify this with your academic advisor before committing"

---

## WORKBOOK VISUAL STYLE

Use clean, professional formatting. Suggested palette:
- Header rows: dark navy (#1F3864), white text, bold
- Subheader rows: gold (#BF9000), white text
- Data rows: alternating white and light blue (#D9E2F3)
- Highlight rows (overlap courses hitting 3+ programs): light green (#E2EFDA)
- Font: Calibri 11pt throughout

---

## BUILD SCRIPT SKELETON

```python
# build_workbook.py
import json
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

# ── Load data ──────────────────────────────────────────────
with open('data/CORNELL/FA26/courses.json') as f:
    all_courses = json.load(f)  # dict: subject -> [course, ...]

with open('data/CORNELL/FA26/student_profile.json') as f:
    profile = json.load(f)

# ── Compute overlaps ───────────────────────────────────────
# For every course, collect all subject codes it appears under
# A course appears under subject X if:
#   (a) its primary subject is X, OR
#   (b) it appears in X's crosslistings list
overlap_map = {}  # canonical_code -> {subjects: [], course_data: {}}

for subject, courses in all_courses.items():
    for course in courses:
        canonical = f"{course['subject']} {course['number']}"
        if canonical not in overlap_map:
            overlap_map[canonical] = {
                "course": course,
                "subjects": set()
            }
        overlap_map[canonical]["subjects"].add(subject)
        for xlist in course.get("crosslistings", []):
            xsubj = xlist.split()[0]
            if xsubj in all_courses:
                overlap_map[canonical]["subjects"].add(xsubj)

# Sort by number of subjects hit, descending
sorted_overlaps = sorted(
    [(k, v) for k, v in overlap_map.items() if len(v["subjects"]) >= 2],
    key=lambda x: len(x[1]["subjects"]),
    reverse=True
)

# ── Build workbook ─────────────────────────────────────────
wb = Workbook()
# ... build each sheet ...
wb.save(f'output/CourseOptimizer_{profile["college_code"]}_{profile["semester"]}_{datetime.now().strftime("%Y%m%d")}.xlsx')
print("Done.")
```

---

## ADDING A NEW COLLEGE (EXPANSION GUIDE)

When a student from a non-Cornell university uses the tool, follow this process:

1. **Find the course roster URL pattern** — usually something like:
   - `{university}.edu/course-catalog/{semester}/{subject}`
   - `banner.{university}.edu/...`
   - Many schools use Coursicle, Workday, or Banner — search "{university name} course catalog fall 2026"

2. **Find the subject code list** — usually on the registrar's page or the catalog index

3. **Check for truncation issues** — fetch one subject page and count courses vs. what the page claims. If mismatch, Chrome browser tools will be needed.

4. **Find degree requirements pages** — usually under `{university}.edu/academics/{department}/requirements`

5. **Identify distribution/gen-ed system** — every school has one, but the names differ:
   - Cornell A&S: 10 categories (ALC-AS, ETM-AS, etc.)
   - Harvard: General Education (Aesthetics, Ethics, Science of Living Systems, etc.)
   - UCLA: General Education clusters + breadth requirements
   - Michigan LSA: Distribution requirements + Race & Ethnicity requirement
   - Document whatever system applies

6. **Write the adapter** — fill in the CollegeAdapter interface above

7. **Run the same workflow** — Steps 0–6 are identical for every college

---

## PRODUCT ROADMAP (for context)

**MVP (what this prompt builds):**
- Single student, single semester, single college
- Excel output
- Manually triggered (student pastes their parameters)

**V2:**
- Web interface (student fills a form)
- Auto-fetches the roster on the backend
- Saves/loads student profiles

**V3:**
- Multi-semester planning (plan all 8 semesters at once)
- Prerequisite graph visualization
- Grade history integration (what have you already taken?)
- Advisor sharing (export PDF summary for advisor meetings)

**V4:**
- Multi-college database (roster data cached, refreshed each semester)
- Search across subjects (student types "behavioral economics" and gets all matching courses regardless of subject code)
- Integration with enrollment systems (bookmark courses, get seat alerts)

---

## STARTING THE SESSION

When a student begins, say:

> "Welcome to Course Optimizer. I'll help you find the courses that give you the most
> degree progress per semester — especially courses that count toward multiple requirements
> at once. To get started, I just need to know a few things about your situation."

Then ask the five profile questions (college, major, exploring, semester, constraints).
After collecting answers, confirm: "I'll be fetching course data for: [list subject codes].
Does that look right, or do you want to add/remove any subjects before I start?"

Then proceed with Steps 2–6.

---

*This prompt is self-contained. A fresh AI instance with no prior context can build
the full system from this document alone. Cornell is the reference implementation;
every design decision is made to be generalizable to other colleges.*
