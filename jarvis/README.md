# Jarvis — your college life, one place

A friendly one-stop shop for a student's whole college life: schedule, requirement tracking, a course optimizer, to-dos, deadlines, notes, and a playable brain map. Cornell Fall 2026 is the pilot; the goal is any student, any school.

## Try it right now
Double-click `index.html` — it runs in any browser, no install. That's the whole prototype.

## Folder layout
```
jarvis/
  index.html             ← the built app (open this). Named index.html so any
                           static host serves it at the folder root.
  CLAUDE.md              ← brief for Claude Code — read first when developing
  README.md              ← you are here
  data/                  ← Cornell FA26 catalog + program data (JSON).
                           GIT-IGNORED: the raw roster scrape stays on your
                           machine. index.html ships with it already baked in.
  scripts/
    build.py             ← rebuilds index.html from template + data
    build_template.html  ← the app source (has __INJECT_DATA__ placeholder)
    test_jarvis.js       ← 54 user-journey tests (no dependencies)
    parse_roster.py      ← data pipeline: scrape/derive the roster
    compute_overlaps.py  ← precompute cross-listing overlaps
    CourseOptimizer_MasterPrompt.md  ← original vision + adapter architecture
    Product_Vision.md    ← the why, positioning, legal notes
```

## Develop it (this is the Claude Code workflow)
1. Install Claude Code (one time): `npm install -g @anthropic-ai/claude-code`
2. Open a terminal and go to this folder: `cd path/to/jarvis`
3. Start it: `claude`
4. First message: **"Read CLAUDE.md, run the tests, and let's start on Milestone 1."**

## Everyday commands
- Rebuild the app after changing the template or data: `python3 scripts/build.py`
- Run the tests (do this before every commit): `node scripts/test_jarvis.js`

## Where it's going
See CLAUDE.md for the milestone roadmap. Short version: (1) deploy to a live URL, (2) real project structure, (3) multi-college via adapters, (4) accounts + cloud sync, (5) paid tier.

## Where this folder lives
It currently sits inside the `atishayai.github.io` site repo so it is version-controlled
alongside atishay.io, which links to it as a featured project. This folder is
self-contained — `index.html` at the root makes it a valid static site on its own — so
moving it into its own repo later is a copy, not a rewrite. That split is the plan.
