# JARVIS — build brief for Claude Code

Read this first, every session. This is the operating manual for building Jarvis into a shippable product.

## What Jarvis is
A friendly one-stop shop for a student's entire college life. Drag-and-drop your courses, track every major/minor requirement, find classes that count toward several programs at once, and keep your to-dos, deadlines, notes, and a playable "brain" mind-map — all in one place. The pitch: students burn out from disorganization, not inability. Jarvis is the calm, competent command center that makes staying on track feel easy and even fun.

The founder is Atishay — an incoming Cornell transfer (Anthropology), building this as user #1. End goal: a product other students pay for. He is NOT a professional developer, so explain tradeoffs plainly, keep the UX dead simple, and prioritize "would a stressed sophomore actually use this?"

## Current state (the prototype)
`index.html` — a single self-contained ~620KB HTML file. No backend, no accounts. All personal data lives in the browser (localStorage, namespace `jv3.`). Cornell Fall 2026 catalog + program data is baked into the file at build time. It works today and is the reference for behavior.

**Where this lives:** inside the `atishayai.github.io` repo as `jarvis/`, so it's version-controlled next to atishay.io, which features it as a project. The folder is self-contained (root `index.html` = a valid static site), so splitting it into its own repo later is a copy, not a rewrite — that split is the plan. `data/` is git-ignored: the raw Cornell scrape stays local and is never published, while the built `index.html` carries that data baked in.

Tabs: Today (concierge home) · My Week (drag-drop scheduler w/ conflict detection, manual blocks for labs) · Find Courses (personal double-count optimizer + full catalog search) · Programs (requirement checklists for all 221 Cornell majors/minors) · Notebook (to-dos + notes) · Calendar · Brain (mind-map where each node has its own to-dos). Plus a 3-step setup wizard, .ics export, and JSON backup/restore.

## How it's built right now
- `scripts/build_template.html` — the app with a `"__INJECT_DATA__"` placeholder.
- `data/*.json` — Cornell FA26 catalog (courses, crosslist overlap_map, ratings, programs_full, subjects).
- `scripts/build.py` — injects the JSON into the template, strips any personal data, writes `index.html`. Run: `python3 scripts/build.py`. It aborts if a founder-specific string would ship.
- `scripts/test_jarvis.js` — a dependency-free test harness (stub DOM + Node vm) running 54 user-journey tests against the built file. **Run this after every change: `node scripts/test_jarvis.js`.** It has already caught 3 real bugs. Keep it green; add a test for every new feature.
- `scripts/parse_roster.py`, `compute_overlaps.py` — the data pipeline that scrapes/derives the Cornell roster data.
- `scripts/CourseOptimizer_MasterPrompt.md` — the original vision spec, incl. the "college adapter" architecture for supporting any school.
- `scripts/Product_Vision.md` — the why, positioning, and legal homework.

## What makes it worth paying for (protect these)
1. **The optimizer** — computes, live, which courses count toward multiple of YOUR interests at once. Cornell's own tools don't do this.
2. **Programs as checklists** — every requirement slot shows the real courses that fill it, one click to schedule. This is the "am I on track to graduate?" answer.
3. **Today** — the single glance that tells a student what matters now.
Do not let a redesign bury these. A prettier scheduler alone is not a business — Cornell's is free.

## Roadmap (build in this order)
**Milestone 1 — Ship the prototype to a URL.** *In progress.* The folder is deploy-ready: `index.html` at the root means any static host serves it. Living in the `atishayai.github.io` repo, it publishes at `www.atishay.io/jarvis/` on the next push. Goal: a link Atishay can text to another student. No accounts yet — localStorage is fine. Intended follow-up: move to its own repo/host and point atishay.io at it.
**Milestone 2 — Real project structure.** Break the single file into a small modern app (recommend Vite + vanilla or React; keep it lightweight). Move data to `/data`, add a real `build` step, wire up the test suite in CI. Same features, maintainable.
**Milestone 3 — Multi-college.** Implement the adapter pattern from the master prompt so a second school (start with one, e.g. the founder's prior school or a big public university) can be added by writing a data adapter, not rebuilding. A refresh script keeps rosters current each term.
**Milestone 4 — Accounts + cloud sync.** So data isn't locked to one browser. Recommend Supabase or similar (auth + Postgres) to stay simple. Export/import already exists as the bridge.
**Milestone 5 — Monetization.** Free tier (schedule, todos, one program) vs paid (optimizer, unlimited programs, multi-semester pathway planner, AI advisor). Stripe. Only after real students use it.

## Guardrails / must-nots
- **Never ship personal data.** The build strips any founder-specific strings; keep it that way. The product is generic.
- **Legal before scale (see Product_Vision.md):** FERPA if handling official records; university ToS on roster scraping (fine for personal use, review before productizing); data privacy + consent. Flag these; don't hand-wave them.
- **Keep the UX simple and fun.** Every screen: if a stressed student has to think more than a couple seconds about what to do, that's a bug.
- **Tests stay green.** `node scripts/test_jarvis.js` before every commit.

## First thing to do in a fresh session
Run the test suite, open `index.html` in a browser to see current behavior, then ask Atishay which milestone he wants to push on. Default suggestion: Milestone 1 (get it live).
