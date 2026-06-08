# Writing Studio — CMS Guide

This guide is for adding new blog posts to the website **without editing HTML by hand**. The Writing Studio runs on your computer, creates the page files for you, and then you push them to GitHub so the live site updates.

---

## One-time setup

### 1. Install Node.js

Download and install Node.js from [https://nodejs.org](https://nodejs.org) (choose the **LTS** version).

To check it worked, open **Terminal** and run:

```bash
node --version
```

You should see a version number like `v22.x.x`.

### 2. Install project dependencies

Open Terminal, go to this project folder, and run:

```bash
cd /path/to/Atishay_website
npm install
```

You only need to do this once (or again if dependencies change).

---

## Starting the Writing Studio

**Option A — Double-click (Mac):**

Double-click **`Start Writing Studio.command`** in the project folder.

**Option B — Terminal:**

```bash
npm run studio
```

Your browser should open automatically, or go to:

**http://localhost:3333**

Leave Terminal open while you work. Press `Ctrl+C` in Terminal when you're done.

---

## Adding a new post (step by step)

### Step 1 — Upload a document

1. Click **New post** in the studio.
2. Drag and drop a file, or click to browse.
3. Supported formats: **`.txt`**, **`.md`**, **`.docx`**, **`.pdf`** (max 25 MB).
4. Wait for the progress bar — the studio extracts the text and creates a **draft**.

> **Note:** PDF and Word extraction is a starting point. You will usually need to fix paragraph breaks in the editor.

> **Legacy `.doc` files** are not supported. Open in Word and **Save As → .docx** or export as PDF.

### Step 2 — Review the draft

Fill in or edit metadata (title, slug, category, excerpt, etc.).

**Body content** uses a block editor:

- Each **paragraph** is its own block — edit text directly.
- Click **+ Image** or **drag image files** onto the composer to add photos.
- **Drag the ⋮⋮ handle** on any block to reorder paragraphs and images.
- Drop images **between** blocks (gold line) to choose exactly where they appear.
- Add optional **alt text** and **caption** for each image.

Use **Preview** to see the full article with styling and image placement.

Click **Save draft** anytime to keep your work.

### Step 3 — Publish

When everything looks good, click **Publish**.

The studio will:

- Create `articles/your-slug.html`
- Copy images to `images/posts/your-slug/`
- Update `writing.html` (the Writing index)
- Update `posts.json` (the post list)

### Step 4 — Push to GitHub Pages

After publishing, the studio shows which files changed and the git commands to run.

**In Terminal** (in the project folder):

```bash
git add .
git commit -m "Add: Your Post Title"
git push
```

**Or use the guided helper:**

```bash
npm run push
```

GitHub Pages usually updates within **1–2 minutes**.

---

## Dashboard

The **Dashboard** shows:

- **Drafts** — work in progress (stored locally in `cms/drafts/`, not pushed to GitHub)
- **Published** — posts already on the site (links open the live article)
- **Git status** — files waiting to be committed and pushed

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| “Node.js is not installed” | Install from [nodejs.org](https://nodejs.org) and restart Terminal |
| Upload fails | Check file type (.txt, .md, .docx, .pdf) and size (under 25 MB) |
| Messy text from PDF | Normal — edit paragraphs in the Body field |
| Publish button error | Fill in Title, Slug, Excerpt, Publication, and Body |
| Site doesn’t update after push | Wait 2 minutes; check GitHub repo Settings → Pages |
| Port 3333 in use | Close other studio windows or change port in `cms/lib/paths.js` |

---

## What gets committed to Git

| Committed | Not committed |
|-----------|----------------|
| `articles/*.html` | `cms/drafts/*.json` (local drafts) |
| `images/posts/*` | `cms/drafts/media/*` (draft images) |
| `writing.html` | `cms/uploads/*` (temp uploads) |
| `posts.json` | `node_modules/` |

---

## Quick reference

| Task | Command |
|------|---------|
| Start studio | `npm run studio` or double-click `Start Writing Studio.command` |
| Validate posts | `npm run import-posts` |
| Guided git push | `npm run push` |
| Studio URL | http://localhost:3333 |

---

## For developers

- Server: [`cms/server.js`](cms/server.js)
- Publish logic: [`cms/lib/publish.js`](cms/lib/publish.js)
- Templates: [`cms/templates/`](cms/templates/)
- Post manifest: [`posts.json`](posts.json)

Existing hand-crafted pages (e.g. zine layout in `a-system-so-perfect.html`) are untouched unless republished from the studio with the standard template.
