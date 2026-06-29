const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
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
const { renderSiteNav, renderSiteFooter } = require('./shell');

function readPosts() {
  return JSON.parse(fs.readFileSync(POSTS_PATH, 'utf8'));
}

function writePosts(posts) {
  fs.writeFileSync(POSTS_PATH, JSON.stringify(posts, null, 2) + '\n');
}

function readTemplate(name) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf8');
}

function findPost(slug) {
  const posts = readPosts();
  for (const category of ['fiction', 'nonfiction']) {
    const index = posts[category].findIndex((p) => p.slug === slug);
    if (index >= 0) {
      return { posts, category, index, post: posts[category][index] };
    }
  }
  return null;
}

function buildBodyHtml(draft, options = {}) {
  if (draft.bodyHtml) return draft.bodyHtml;
  const blocks = ensureBodyBlocks(draft);
  if (blocks.length) {
    return blocksToHtml(blocks, {
      preview: options.preview,
      slug: draft.slug,
      draftId: draft.id || '',
    });
  }
  const paragraphs = draft.bodyParagraphs || [];
  return paragraphsToHtml(paragraphs);
}

function buildArticleHtml(draft, { preview = false } = {}) {
  const template = readTemplate('article.html');
  const title = draft.title || 'Untitled';
  const bodyHtml = buildBodyHtml(draft, { preview });
  const depth = preview ? 0 : 1;

  const nav = renderSiteNav(depth, { active: 'writing' });
  const footer = renderSiteFooter();
  const stylesHref = preview ? '/styles.css' : '../styles.css';
  const backHref = preview ? '/writing.html' : '../writing.html';

  return renderTemplate(template, {
    TITLE: escapeHtml(title),
    TITLE_PLAIN: title,
    META_LINE: buildMetaLine(draft),
    BODY_HTML: bodyHtml,
    SITE_NAV: nav,
    SITE_FOOTER: footer,
    STYLES_HREF: stylesHref,
    BACK_HREF: backHref,
    SCRIPTS_TAG: preview
      ? '<script src="/scripts/site.js" defer></script>'
      : '<script src="../scripts/site.js" defer></script>',
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
  const nav = renderSiteNav(0, { active: 'writing' });
  const footer = renderSiteFooter();

  return renderTemplate(template, {
    FICTION_ROWS: fictionRows,
    NONFICTION_ROWS: nonfictionRows,
    SITE_NAV: nav,
    SITE_FOOTER: footer,
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

function removePostFromManifest(posts, slug) {
  for (const category of ['fiction', 'nonfiction']) {
    posts[category] = posts[category].filter((p) => p.slug !== slug);
  }
  return posts;
}

function copyDraftImages(draft) {
  const isPublished = String(draft.id || '').startsWith('published-');
  const srcDir = isPublished
    ? path.join(IMAGES_DIR, draft.publishedSlug || draft.slug)
    : path.join(DRAFT_MEDIA_DIR, draft.id);
  const destDir = path.join(IMAGES_DIR, draft.slug);
  const copied = [];

  if (!fs.existsSync(srcDir) && !isPublished) return copied;

  fs.mkdirSync(destDir, { recursive: true });

  for (const block of ensureBodyBlocks(draft)) {
    if (block.type !== 'image' || !block.filename) continue;
    const src = path.join(srcDir, block.filename);
    const dest = path.join(destDir, block.filename);
    if (fs.existsSync(src) && src !== dest) {
      fs.copyFileSync(src, dest);
    }
    if (fs.existsSync(dest)) {
      copied.push(`images/posts/${draft.slug}/${block.filename}`);
    }
  }

  return copied;
}

function validateDraftForPublish(draft) {
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
}

function publishDraft(draft) {
  validateDraftForPublish(draft);

  const posts = readPosts();
  upsertPost(posts, draft);
  writePosts(posts);

  const imageFiles = copyDraftImages(draft);
  const articlePath = path.join(ARTICLES_DIR, `${draft.slug}.html`);
  fs.writeFileSync(articlePath, buildArticleHtml(draft));

  fs.writeFileSync(WRITING_PATH, buildWritingHtml(posts));
  if (!String(draft.id || '').startsWith('published-')) {
    deleteDraftMedia(draft.id);
  }

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

function buildRedirectStub(oldSlug, newSlug) {
  const newPath = `${newSlug}.html`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0; url=${newPath}">
<link rel="canonical" href="${newPath}">
<title>Moved</title>
</head>
<body>
<p>Moved: <a href="${newPath}">Continue to article</a></p>
</body>
</html>
`;
}

function parseParagraphBlock(pHtml) {
  const alignMatch = pHtml.match(/class="[^"]*\barticle-p-(center|right)\b/);
  const align = alignMatch ? alignMatch[1] : 'left';
  const innerMatch = pHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const inner = innerMatch ? innerMatch[1].trim() : '';
  const hasTags = /<[a-z][\s\S]*>/i.test(inner);

  const block = {
    id: uuidv4(),
    type: 'paragraph',
    text: hasTags ? '' : inner.replace(/<[^>]+>/g, '').trim(),
    html: hasTags ? inner : '',
    align: align === 'left' ? undefined : align,
  };

  if (!block.html) delete block.html;
  if (!block.align) delete block.align;

  return block;
}

function parseFigureBlock(figureHtml, slug) {
  const filenameMatch = figureHtml.match(/images\/posts\/[^/]+\/([^"']+)/);
  const altMatch = figureHtml.match(/alt="([^"]*)"/);
  const captionMatch = figureHtml.match(/<figcaption>([\s\S]*?)<\/figcaption>/i);
  if (!filenameMatch) return null;

  return {
    id: uuidv4(),
    type: 'image',
    filename: decodeURIComponent(filenameMatch[1]),
    alt: altMatch ? altMatch[1] : '',
    caption: captionMatch ? captionMatch[1].replace(/<[^>]+>/g, '').trim() : '',
  };
}

function parseArticleBodyHtml(articleHtml) {
  const bodyMatch = articleHtml.match(/<div class="article-body">\s*([\s\S]*?)\s*<\/div>/i);
  if (!bodyMatch) return [];

  const bodyContent = bodyMatch[1];
  const blocks = [];
  const tokenRe = /(<figure[\s\S]*?<\/figure>|<p[\s\S]*?<\/p>)/gi;
  let match;

  while ((match = tokenRe.exec(bodyContent)) !== null) {
    const chunk = match[1];
    if (chunk.startsWith('<figure')) {
      const imgBlock = parseFigureBlock(chunk);
      if (imgBlock) blocks.push(imgBlock);
    } else if (chunk.startsWith('<p')) {
      const pBlock = parseParagraphBlock(chunk);
      if (pBlock.text || pBlock.html) blocks.push(pBlock);
    }
  }

  return blocks;
}

function loadPostForEdit(slug) {
  const found = findPost(slug);
  if (!found) throw new Error('Post not found.');

  const articlePath = path.join(ARTICLES_DIR, `${slug}.html`);
  if (!fs.existsSync(articlePath)) {
    throw new Error(`Article file missing: articles/${slug}.html`);
  }

  const articleHtml = fs.readFileSync(articlePath, 'utf8');
  const bodyBlocks = parseArticleBodyHtml(articleHtml);

  return {
    id: `published-${slug}`,
    publishedSlug: slug,
    isPublished: true,
    title: found.post.title,
    slug: found.post.slug,
    category: found.category,
    tag: found.post.tag,
    publication: found.post.publication,
    date: found.post.date,
    excerpt: found.post.excerpt,
    metaAccent: found.post.metaAccent,
    metaVenue: found.post.metaVenue,
    metaDate: found.post.metaDate,
    bodyBlocks,
    sourceFile: null,
  };
}

function deletePost(slug) {
  const found = findPost(slug);
  if (!found) throw new Error('Post not found.');

  const posts = removePostFromManifest(found.posts, slug);
  writePosts(posts);
  fs.writeFileSync(WRITING_PATH, buildWritingHtml(posts));

  const articlePath = path.join(ARTICLES_DIR, `${slug}.html`);
  if (fs.existsSync(articlePath)) fs.unlinkSync(articlePath);

  const imagesDir = path.join(IMAGES_DIR, slug);
  if (fs.existsSync(imagesDir)) fs.rmSync(imagesDir, { recursive: true, force: true });

  return {
    slug,
    changedFiles: ['writing.html', 'posts.json', `articles/${slug}.html`],
  };
}

function republishPost(oldSlug, draft, { createRedirect = true } = {}) {
  validateDraftForPublish(draft);

  const newSlug = draft.slug.trim();
  const found = findPost(oldSlug);
  if (!found) throw new Error('Post not found.');

  let posts = found.posts;
  const slugChanged = newSlug !== oldSlug;

  if (slugChanged) {
    posts = removePostFromManifest(posts, oldSlug);

    const oldArticle = path.join(ARTICLES_DIR, `${oldSlug}.html`);
    if (fs.existsSync(oldArticle)) fs.unlinkSync(oldArticle);

    const oldImages = path.join(IMAGES_DIR, oldSlug);
    const newImages = path.join(IMAGES_DIR, newSlug);
    if (fs.existsSync(oldImages)) {
      if (fs.existsSync(newImages)) fs.rmSync(newImages, { recursive: true, force: true });
      fs.renameSync(oldImages, newImages);
    }

    if (createRedirect) {
      const stubPath = path.join(ARTICLES_DIR, `${oldSlug}.html`);
      fs.writeFileSync(stubPath, buildRedirectStub(oldSlug, newSlug));
    }
  }

  upsertPost(posts, draft);
  writePosts(posts);

  const imageFiles = copyDraftImages({
    ...draft,
    id: `published-${newSlug}`,
    publishedSlug: newSlug,
  });
  const articlePath = path.join(ARTICLES_DIR, `${newSlug}.html`);
  fs.writeFileSync(articlePath, buildArticleHtml(draft));
  fs.writeFileSync(WRITING_PATH, buildWritingHtml(posts));

  const changedFiles = [
    `articles/${newSlug}.html`,
    'writing.html',
    'posts.json',
    ...imageFiles,
  ];
  if (slugChanged && createRedirect) {
    changedFiles.push(`articles/${oldSlug}.html`);
  }

  return {
    slug: newSlug,
    oldSlug: slugChanged ? oldSlug : null,
    articlePath: `articles/${newSlug}.html`,
    changedFiles,
  };
}

function buildPreviewHtml(draft) {
  return buildArticleHtml(draft, { preview: true });
}

function rebuildArticleFile(slug) {
  const found = findPost(slug);
  if (!found) return false;

  const articlePath = path.join(ARTICLES_DIR, `${slug}.html`);
  if (!fs.existsSync(articlePath)) return false;

  const bodyBlocks = parseArticleBodyHtml(fs.readFileSync(articlePath, 'utf8'));
  const draft = {
    ...found.post,
    category: found.category,
    bodyBlocks,
    id: `published-${slug}`,
  };

  fs.writeFileSync(articlePath, buildArticleHtml(draft));
  return true;
}

module.exports = {
  readPosts,
  writePosts,
  publishDraft,
  buildPreviewHtml,
  buildArticleHtml,
  buildWritingHtml,
  deletePost,
  loadPostForEdit,
  republishPost,
  parseArticleBodyHtml,
  rebuildArticleFile,
  findPost,
};
