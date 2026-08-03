# Product Vision — Jarvis

_Originally captured 2026-07-09 from Atishay's notes. Revised 2026-08-03 to add strategy:
scope, sequencing, and what to say no to. Extends CourseOptimizer_MasterPrompt.md (the
technical spec); this is the why and the in-what-order._

## The problem

College burnout often isn't ability — it's organizational. Students juggle grades, social
life, internships, competitive clubs. They know they can get something done; they never end
up doing it. Time management collapses under scattered information.

The specific version of that pain: deadlines live in six places, degree requirements live in
a PDF nobody reads, and no tool answers "am I on track to graduate?" without an advisor
appointment three weeks out.

## The product

A one-stop shop for a student's whole college life — scheduler, degree progress, deadlines,
to-dos, notes — where the parts know about each other. Notion for college, except it
actually knows what your major requires.

The long-term shape, from the original notes:
- A Jarvis-brain interface (zoomable, interactive), not a static dashboard
- Built from whatever the student drags in — their own notes and material
- "Personal LLM" via retrieval over their own corpus (the corpus IS the personalization;
  no training needed, stays real-time)
- Google Drive connection + automatic backup

## The wedge vs. the table stakes

These are not equal, and treating them as equal is the main way this fails.

**The wedge — degree progress + the double-count optimizer.** Live computation of which
courses satisfy several of a student's programs at once, and a requirement checklist where
every slot shows the real courses that fill it. Cornell's own tools do not do this. It is
the only part with no good free alternative, and the only part worth paying for.

**Table stakes — notes, to-dos, deadlines, calendar.** Real needs, but Notion, Apple Notes,
and Google Calendar already do them for free and better. Nobody switches for these. They
exist so students don't have to leave, not to win on their own merits.

The trap in "Notion on steroids" is competing with Notion on breadth. That's unwinnable for
a solo founder against hundreds of engineers. The win is the thing Notion structurally
cannot do: **Notion doesn't know what your major requires.** Every roadmap decision gets
tested against that sentence.

## Scope: one school first, not thirty

The ambition is every college and every student. The path there is one school at a time, and
the reason is where the work actually lives:

**A course scheduler is code. A degree audit is data.** Code is written once and serves
every school for free. Data is paid for per school, by hand, forever.

The Cornell version works because `parse_roster.py` scrapes a roster Cornell publishes, and
because 221 programs were curated into machine-readable requirement checklists. That second
part is expensive and barely automatable. Most universities do not publish degree
requirements in structured form — they live in PDF catalogs, advising handbooks, and
department pages that contradict each other. There is no API for "what does an Anthropology
major need." US higher ed has ~4,000 degree-granting institutions; the roster half is
tractable, the requirements half is not.

So "30 universities at launch" is roughly 1× the code and 30× the hardest, least automatable
work — done up front, for schools with zero users, and repeated every term as rosters change.

**Instead: win Cornell.** Campus-by-campus is the proven playbook for student products
(Facebook, Yik Yak, Fizz all did it). The advantages there exist nowhere else — the founder
is on campus, is user #1, feels the pain daily, and the data already exists and passes tests.

**Then school #2, chosen to break the adapter.** Ideally a large public university whose
requirement structure looks nothing like Cornell's. The point is not growth; it is forcing a
genuine adapter instead of a Cornell-shaped one in a costume. Only after that does 20–30
become a data-operations question rather than a rewrite.

## Explicit not-yets

Not rejections — sequencing. Each one delays finding out whether students want the core.

- **iPad / Apple Pencil handwriting.** Competes with GoodNotes, Notability, and Apple Notes:
  excellent, cheap, already installed, years of refinement. Means a second codebase, App
  Store review, sync infrastructure, and offline conflict resolution — a company's worth of
  work sitting next to the part that's actually differentiated. Revisit when Cornell is won
  and students are asking.
- **Multi-college.** See above.
- **Notes as a platform.** Good enough to not leave; not trying to beat Notion.

## Sequence

1. **Ship Cornell.** Get it in front of real students. localStorage is fine.
2. **Watch what they actually use.** Something in this document is wrong; that's normal.
   Cheaper to learn before a rebuild than after.
3. **Rebuild properly** (React) once it's clear what's worth keeping. Port the optimizer and
   requirement data deliberately — a generated UI scaffold reproduces screens, not the
   double-count math or the 221-program dataset.
4. **School #2**, chosen to break the adapter.
5. **Accounts + sync.** The moment there are two devices or one lost laptop, localStorage
   stops being charming.

## Stretch idea

Scan of everything a student has ever written → an ethnographic story of their own thinking.
(Anthro major building ethnography software — that's the pitch.)

## ⚠️ Legal homework before this goes beyond personal use

Sharper at 30 schools than at one: scraping a single university's roster for personal use is
one legal posture; scraping thirty and charging money is a materially different one. Read
actual ToS before the pilot expands. Not a blocker — far cheaper to know early than to
unwind later.

- FERPA — handling student education records
- Privacy/data protection for minors-adjacent users; data storage + consent
- University ToS on roster/catalog scraping (fine for personal use; productizing needs review)
- CUReviews / third-party data licensing
- If email/Canvas integration is ever offered: OAuth scopes, institutional API agreements
  (Canvas LMS API requires per-school tokens)

## Positioning notes

- Differentiator vs generic planners: requirement-aware (degree audit + double-counting
  engine), not just a calendar
- Employability angle ties to Atishay's own Info Science exploration
- Current status: prototype is feature-complete for Cornell FA26 (4,464 courses, 221
  programs), 54 tests green, deployable as a static site
