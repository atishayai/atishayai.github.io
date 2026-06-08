const fs = require('fs');
const path = require('path');
const {
  POSTS_PATH,
  ARTICLES_DIR,
  WRITING_PATH,
  TEMPLATES_DIR,
  IMAGES_DIR,
  DRAFT_MEDIA_DIR,
} = require('./paths');
const {
  renderTemplate,
  paragraphsToHtml,
  buildMetaLine,
  toRomanNumeral,
  escapeHtml,
} = require('./utils');
const { blocksToHtml, ensureBodyBlocks, hasBodyContent } = require('./blocks');
const { deleteDraftMedia } = require('./drafts');

function readPosts() {
  return JSON.parse(fs.readFileSync(POSTS_PATH, 'utf8'));
}

function writePosts(posts) {
  fs.writeFileSync(POSTS_PATH, JSON.stringify(posts, null, 2) + '\n');
}

function readTemplate(name) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf8');
}

function buildBodyHtml(draft, options = {}) {
  if (draft.bodyHtml) return draft.bodyHtml;
  const blocks = ensureBodyBlocks(draft);
  if (blocks.some((b) => b.type === 'image')) {
    return blocksToHtml(blocks, {
      preview: options.preview,
      slug: draft.slug,
      draftId: draft.id,
    });
  }
  if (blocks.length) {
    return blocksToHtml(blocks, {
      preview: options.preview,
      slug: draft.slug,
      draftId: draft.id,
    });
  }
  const paragraphs = draft.bodyParagraphs || [];
  return paragraphsToHtml(paragraphs);
}

function buildArticleHtml(draft, { preview = false } = {}) {
  const template = readTemplate('article.html');
  const title = draft.title || 'Untitled';
  const bodyHtml = buildBodyHtml(draft, { preview });
  const paths = preview
    ? {
        STYLES_HREF: '/styles.css',
        INDEX_HREF: '/index.html',
        WRITING_HREF: '/writing.html',
        SIDEQUESTS_HREF: '/sidequests.html',
        BACK_HREF: '/writing.html',
      }
    : {
        STYLES_HREF: '../styles.css',
        INDEX_HREF: '../index.html',
        WRITING_HREF: '../writing.html',
        SIDEQUESTS_HREF: '../sidequests.html',
        BACK_HREF: '../writing.html',
      };

  return renderTemplate(template, {
    TITLE: escapeHtml(title),
    TITLE_PLAIN: title,
    META_LINE: buildMetaLine(draft),
    BODY_HTML: bodyHtml,
    ...paths,
  });
}

function buildWritingRow(post, index) {
  const num = toRomanNumeral(index);
  return `      <a href="articles/${post.slug}.html" class="wrow">
        <span class="num">${num}.</span>
        <div>
          <div class="title">${escapeHtml(post.title)}</div>
          <div class="excerpt">${escapeHtml(post.excerpt)}</div>
        </div>
        <span class="pub"><b>${escapeHtml(post.publication)}</b> · ${escapeHtml(post.date)}</span>
        <span class="tag">${escapeHtml(post.tag)}</span>
      </a>`;
}

function buildWritingHtml(posts) {
  const template = readTemplate('writing.html');
  const fictionRows = posts.fiction.map((p, i) => buildWritingRow(p, i)).join('\n\n');
  const nonfictionRows = posts.nonfiction.map((p, i) => buildWritingRow(p, i)).join('\n\n');

  return renderTemplate(template, {
    FICTION_ROWS: fictionRows,
    NONFICTION_ROWS: nonfictionRows,
  });
}

function postFromDraft(draft) {
  return {
    slug: draft.slug,
    title: draft.title,
    excerpt: draft.excerpt,
    publication: draft.publication,
    date: draft.date,
    tag: draft.tag,
    metaAccent: draft.metaAccent,
    metaVenue: draft.metaVenue || draft.publication?.toLowerCase() || '',
    metaDate: draft.metaDate || draft.date?.toLowerCase() || '',
  };
}

function upsertPost(posts, draft) {
  const category = draft.category === 'fiction' ? 'fiction' : 'nonfiction';
  const other = category === 'fiction' ? 'nonfiction' : 'fiction';
  const entry = postFromDraft(draft);

  posts[other] = posts[other].filter((p) => p.slug !== entry.slug);
  const idx = posts[category].findIndex((p) => p.slug === entry.slug);
  if (idx >= 0) {
    posts[category][idx] = entry;
  } else {
    posts[category].unshift(entry);
  }

  return posts;
}

function copyDraftImages(draft) {
  const srcDir = path.join(DRAFT_MEDIA_DIR, draft.id);
  const destDir = path.join(IMAGES_DIR, draft.slug);
  const copied = [];

  if (!fs.existsSync(srcDir)) return copied;

  fs.mkdirSync(destDir, { recursive: true });

  for (const block of ensureBodyBlocks(draft)) {
    if (block.type !== 'image' || !block.filename) continue;
    const src = path.join(srcDir, block.filename);
    const dest = path.join(destDir, block.filename);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      copied.push(`images/posts/${draft.slug}/${block.filename}`);
    }
  }

  return copied;
}

function publishDraft(draft) {
  if (!draft.title?.trim()) {
    throw new Error('Title is required before publishing.');
  }
  if (!draft.slug?.trim()) {
    throw new Error('URL slug is required before publishing.');
  }
  if (!draft.excerpt?.trim()) {
    throw new Error('Excerpt is required before publishing.');
  }
  if (!draft.publication?.trim()) {
    throw new Error('Publication venue is required before publishing.');
  }
  if (!hasBodyContent(draft)) {
    throw new Error('Body content is required before publishing.');
  }

  const posts = readPosts();
  upsertPost(posts, draft);
  writePosts(posts);

  const imageFiles = copyDraftImages(draft);
  const articlePath = path.join(ARTICLES_DIR, `${draft.slug}.html`);
  fs.writeFileSync(articlePath, buildArticleHtml(draft));

  fs.writeFileSync(WRITING_PATH, buildWritingHtml(posts));
  deleteDraftMedia(draft.id);

  const changedFiles = [
    `articles/${draft.slug}.html`,
    'writing.html',
    'posts.json',
    ...imageFiles,
  ];

  return {
    slug: draft.slug,
    articlePath: `articles/${draft.slug}.html`,
    changedFiles,
  };
}

function buildPreviewHtml(draft) {
  return buildArticleHtml(draft, { preview: true });
}

module.exports = {
  readPosts,
  writePosts,
  publishDraft,
  buildPreviewHtml,
  buildArticleHtml,
  buildWritingHtml,
};
