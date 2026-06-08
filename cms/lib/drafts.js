const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { DRAFTS_DIR, DRAFT_MEDIA_DIR } = require('./paths');
const { slugify } = require('./utils');
const { paragraphsToBlocks, blocksToBodyText, blocksToParagraphs, ensureBodyBlocks } = require('./blocks');

function ensureDraftsDir() {
  if (!fs.existsSync(DRAFTS_DIR)) {
    fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  }
}

function draftMediaDir(id) {
  return path.join(DRAFT_MEDIA_DIR, id);
}

function draftPath(id) {
  return path.join(DRAFTS_DIR, `${id}.json`);
}

function deleteDraftMedia(id) {
  const dir = draftMediaDir(id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function listDrafts() {
  ensureDraftsDir();
  return fs
    .readdirSync(DRAFTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const draft = JSON.parse(fs.readFileSync(path.join(DRAFTS_DIR, f), 'utf8'));
      return {
        id: draft.id,
        title: draft.title,
        slug: draft.slug,
        category: draft.category,
        updatedAt: draft.updatedAt,
        sourceFile: draft.sourceFile,
      };
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function getDraft(id) {
  const file = draftPath(id);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveDraft(draft) {
  ensureDraftsDir();
  draft.updatedAt = new Date().toISOString();
  fs.writeFileSync(draftPath(draft.id), JSON.stringify(draft, null, 2));
  return draft;
}

function createDraft({ sourceFile, paragraphs, text }) {
  const now = new Date().toISOString();
  const baseTitle = sourceFile
    ? path.basename(sourceFile, path.extname(sourceFile)).replace(/[-_]+/g, ' ')
    : 'Untitled draft';

  const draft = {
    id: uuidv4(),
    createdAt: now,
    updatedAt: now,
    sourceFile: sourceFile || null,
    title: capitalizeWords(baseTitle),
    slug: slugify(baseTitle),
    category: 'nonfiction',
    tag: 'Essay',
    metaAccent: 'essay',
    metaVenue: '',
    metaDate: new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' }).toLowerCase(),
    publication: '',
    date: new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' }),
    excerpt: paragraphs[0]?.slice(0, 160) || '',
    bodyBlocks: paragraphsToBlocks(paragraphs),
    bodyParagraphs: paragraphs,
    bodyText: paragraphs.join('\n\n'),
  };

  return saveDraft(draft);
}

function updateDraft(id, updates) {
  const draft = getDraft(id);
  if (!draft) return null;

  const merged = { ...draft, ...updates, id: draft.id, createdAt: draft.createdAt };

  if (updates.bodyBlocks !== undefined) {
    merged.bodyBlocks = updates.bodyBlocks;
    merged.bodyParagraphs = blocksToParagraphs(updates.bodyBlocks);
    merged.bodyText = blocksToBodyText(updates.bodyBlocks);
  } else if (updates.bodyText !== undefined) {
    merged.bodyText = updates.bodyText;
    merged.bodyParagraphs = updates.bodyText
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\n/g, ' ').trim())
      .filter(Boolean);
    merged.bodyBlocks = paragraphsToBlocks(merged.bodyParagraphs);
  } else if (!merged.bodyBlocks?.length) {
    merged.bodyBlocks = ensureBodyBlocks(merged);
  }

  if (updates.title && !updates.slug) {
    merged.slug = slugify(updates.title);
  }

  if (updates.tag && !updates.metaAccent) {
    merged.metaAccent = updates.tag.toLowerCase();
  }

  if (updates.publication && !updates.metaVenue) {
    merged.metaVenue = updates.publication.toLowerCase();
  }

  if (updates.date && !updates.metaDate) {
    merged.metaDate = updates.date.toLowerCase();
  }

  return saveDraft(merged);
}

function deleteDraft(id) {
  const file = draftPath(id);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    deleteDraftMedia(id);
    return true;
  }
  return false;
}

function capitalizeWords(str) {
  return String(str)
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

module.exports = {
  listDrafts,
  getDraft,
  saveDraft,
  createDraft,
  updateDraft,
  deleteDraft,
  draftMediaDir,
  deleteDraftMedia,
};
