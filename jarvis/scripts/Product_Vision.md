# Product Vision — Academic Concierge for Every Student
_Captured 2026-07-09 from Atishay's notes. Extends CourseOptimizer_MasterPrompt.md (the technical spec); this is the why._

## The problem
College burnout often isn't ability — it's organizational. Students juggle grades, social life, internships, competitive clubs. They know they can get something done; they never end up doing it. Time management collapses under scattered information.

## The product
A personal academic concierge, built automatically from whatever the student drags and drops — notes, everything they personally write:
- A cool-looking Jarvis-brain interface (zoomable, interactive)
- Connected to their Google Drive + automatic backup (connector exists: Google Drive MCP)
- Students actually *interact* with their material — capture boxes, planners, live requirement tracking — not a static dashboard
- "Personal LLM" experience via retrieval over their own corpus (no model training needed — the corpus IS the personalization; stays real-time)

## Working prototype (proof it works)
This very folder: Cornell Jarvis. Concierge.html + data pipeline + scheduled automation + natural-language capture. The Master Prompt already specs the generalization path: college adapters, so adding UCLA/Michigan/UVA = writing an adapter, not rebuilding.

## Stretch idea
Scan of everything a student has ever written → an ethnographic story of their own thinking. (Anthro major building ethnography software — that's the pitch.)

## ⚠️ Legal homework before this goes beyond personal use (Atishay flagged this)
- FERPA — handling student education records
- Privacy/data protection for minors-adjacent users; data storage + consent
- University ToS on roster/catalog scraping (fine for personal use; productizing needs review)
- CUReviews / third-party data licensing
- If email/Canvas integration is ever offered: OAuth scopes, institutional API agreements (Canvas LMS API requires per-school tokens)

## Positioning notes
- Employability angle ties to Atishay's own Info Science exploration
- Differentiator vs generic planners: requirement-aware (degree audit + double-counting engine), not just a calendar
