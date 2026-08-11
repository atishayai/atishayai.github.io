# KNOCKOUT! — build brief for Claude Code

Read this first, every session.

## What this is
**Knockout!** (formerly Jarvis) — requirement-aware schedule planner for Cornell students.
Live at **https://knockout.college** (canonical repo: github.com/atishayai/knockout) and
mirrored at www.atishay.io/jarvis. Free, no accounts, everything in localStorage,
installable PWA. 186 tests. Owner: Atishay (Cornell transfer, non-technical — explain
plainly, keep it dead simple, fewer words on screen always wins).

## Deploy workflow (memorize this)
1. Edit `scripts/build_template.html` (never index.html — it's generated)
2. `SITE_URL=https://knockout.college/ python3 scripts/build.py`
3. `node scripts/test_jarvis.js` — must stay green; add tests for new logic
4. Commit+push THIS repo (mirror), then:
   `rsync -a --exclude .git --exclude data/program_pages ./ "../../Cornell University/Cornell Jarvis/knockout-site/"`
   and commit+push there (that repo serves knockout.college)
5. Fresh data per term: `python3 scripts/fetch_roster.py FA26` + `fetch_programs.py`
   (re-run both the night before any marketing push — seats are a build-time snapshot)

## Product principle
**Jarvis generates your schedule. It does not help you build one.**

The problem, as validated: picking courses means hand-checking every option against a dozen
overlapping systems — distribution requirements, major, minor, pre-med, your own schedule
rules, professor quality, and whether the class is even open. It is exhausting enough that
most students give up, take whatever is left, and land on a slower, worse path. Then a class
fills during add/drop and they scramble, because they never built backups.

**The product principle: do not hand students a better tool for doing that work themselves —
that is still work. Do the work and hand them the answer.**

The hero experience, which the whole app is built around: a student enters their programs
(major, minor, pre-med) and their rules (days off, time windows), and in **one click** Jarvis
returns
1. a **recommended full schedule** that satisfies the most requirements at once via the
   double-count optimizer, obeys their rules, and favours well-regarded courses; and
2. for every course, **ranked backups** that fill the same requirement and are still open —
   so when something closes, the next move is instant.

**Trust through transparency — answer loud, receipts quiet.** Lead with the confident
recommendation. Every claim is one tap from its proof: this course fills THIS requirement
(linked to the rule), it is open, it is rated X. The receipts double as teaching the student
a requirement system normally gatekept by clubs and upperclassmen. Proof is **on demand,
never dumped on screen** — do not rebuild the overwhelm you are removing.

The founder is Atishay — an incoming Cornell transfer (Anthropology), building this as user #1. End goal: a product other students pay for. He is NOT a professional developer, so explain tradeoffs plainly, keep the UX dead simple, and prioritize "would a stressed sophomore actually use this?"

## Current state (the prototype)
`index.html` — a single self-contained ~780KB HTML file. No backend, no accounts. All personal data lives in the browser (localStorage, namespace `jv3.`). Cornell Fall 2026 catalog + program data is baked into the file at build time. It works today and is the reference for behavior.

**Where this lives:** inside the `atishayai.github.io` repo as `jarvis/`, so it's version-controlled next to atishay.io, which features it as a project. The folder is self-contained (root `index.html` = a valid static site), so splitting it into its own repo later is a copy, not a rewrite — that split is the plan. `data/` is git-ignored: the raw Cornell scrape stays local and is never published, while the built `index.html` carries that data baked in.

Tabs: Today (concierge home) · My Week (drag-drop scheduler w/ conflict detection, manual blocks for labs) · Find Courses (personal double-count optimizer + full catalog search) · Programs (requirement checklists for all 221 Cornell majors/minors) · Notebook (to-dos + notes) · Calendar · Brain (mind-map where each node has its own to-dos). Plus a 3-step setup wizard, .ics export, and JSON backup/restore.

## How it's built right now
- `scripts/build_template.html` — the app with a `"__INJECT_DATA__"` placeholder.
- `data/*.json` — Cornell FA26 catalog (courses, crosslist overlap_map, ratings, programs_full, subjects).
- `scripts/build.py` — injects the JSON into the template, strips any personal data, writes `index.html`. Run: `python3 scripts/build.py`. It aborts if a founder-specific string would ship.
- `scripts/test_jarvis.js` — a dependency-free test harness (stub DOM + Node vm) running 88 user-journey tests against the built file. **Run this after every change: `node scripts/test_jarvis.js`.** It has already caught 3 real bugs. Keep it green; add a test for every new feature.
- `scripts/fetch_roster.py` — pulls the catalog from Cornell's official Class Roster API (`classes.cornell.edu/api/2.0`). Replaced the old regex-over-scraped-markdown parser, which mispaired meeting days and times on 23% of courses. Re-run per term: `python3 scripts/fetch_roster.py SP27`.
- `scripts/CourseOptimizer_MasterPrompt.md` — the original vision spec, incl. the "college adapter" architecture for supporting any school.
- `scripts/Product_Vision.md` — the why, positioning, and legal homework.

## Priorities
1. **The one-click optimised schedule with backups is the hero.** Front and centre. Everything
   else is subordinate to it.
2. **Keep:** the drag-to-adjust schedule builder, the Today view, program requirement tracking.
3. **Minimise or hide** anything that adds cognitive load or confuses a first-time user.

A prettier scheduler alone is not a business — Cornell's is free. Cornell is also rolling out
**Stellic** (degree audit + what-if + multi-term planning) to Arts & Sciences in 2026–27, so
"we track your degree progress" is not the differentiator either. What survives is generating
the answer: the cross-program double-count plus live-fit scheduling plus backups.

## The data that makes or breaks the hero feature
The engine can only recommend against requirements it can actually read. Current state:
- **Distribution requirements: available.** The roster API exposes them via `crseAttrs`
  ("AS-Historical Analysis", "AS-Social Sciences"). Note `catalogDistr` is empty — read
  `crseAttrs`. **The fetcher currently ignores this and must be fixed.**
- **Seat status: available.** `classSections[].openStatus` — `O` open, `C` closed, `W`
  waitlist (~20% closed in sampling). Build-time snapshot, so it must be shown with an
  as-of date and never presented as live.
- **Major/minor requirements: mostly missing.** Only **29 of 261 slots (11%)** name any
  courses. 210 of 221 programs carry a single placeholder slot ("~8 course slots, estimated
  from the catalog text"). **Curating these is the real work and the real moat** — the
  engine is only as good as this mapping.
- **Course quality: no legitimate source right now.** The old scraped CUReviews table (1%
  coverage) was removed. RateMyProfessors forbids automated collection. Cornell's official
  evaluations sit behind a login. Until this is solved, "favours well-rated" can only mean
  the student's own ratings — say so rather than implying more.

## Roadmap (build in this order)
**Milestone 1 — Ship the prototype to a URL.** *In progress.* The folder is deploy-ready: `index.html` at the root means any static host serves it. Living in the `atishayai.github.io` repo, it publishes at `www.atishay.io/jarvis/` on the next push. Goal: a link Atishay can text to another student. No accounts yet — localStorage is fine. Intended follow-up: move to its own repo/host and point atishay.io at it.
**Milestone 2 — Real project structure.** Break the single file into a small modern app (recommend Vite + vanilla or React; keep it lightweight). Move data to `/data`, add a real `build` step, wire up the test suite in CI. Same features, maintainable.
**Milestone 3 — Multi-college.** Implement the adapter pattern from the master prompt so a second school (start with one, e.g. the founder's prior school or a big public university) can be added by writing a data adapter, not rebuilding. A refresh script keeps rosters current each term.
**Milestone 4 — Accounts + cloud sync.** So data isn't locked to one browser. Recommend Supabase or similar (auth + Postgres) to stay simple. Export/import already exists as the bridge.
**Milestone 5 — Monetization.** Free tier (schedule, todos, one program) vs paid (optimizer, unlimited programs, multi-semester pathway planner, AI advisor). Stripe. Only after real students use it.

## Constraints for the current phase
- Cornell Fall 2026 only. Keep data in `/data` so another school is just a new dataset.
- No accounts, free, browser-based.
- Keep the test suite green; add tests for every piece of new engine logic.
- **Do not** add recruiting, accounts, payments, or App Store work yet.

## Guardrails / must-nots
- **Never ship personal data.** The build strips any founder-specific strings; keep it that way. The product is generic.
- **Legal before scale (see Product_Vision.md):** FERPA if handling official records; university ToS on roster scraping (fine for personal use, review before productizing); data privacy + consent. Flag these; don't hand-wave them.
- **Keep the UX simple and fun.** Every screen: if a stressed student has to think more than a couple seconds about what to do, that's a bug.
- **Tests stay green.** `node scripts/test_jarvis.js` before every commit.

## First thing to do in a fresh session
Run the test suite, open `index.html` in a browser to see current behavior, then ask Atishay which milestone he wants to push on. Default suggestion: Milestone 1 (get it live).
