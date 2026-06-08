const { v4: uuidv4 } = require('uuid');
const { escapeHtml } = require('./utils');

function paragraphsToBlocks(paragraphs) {
  return (paragraphs || [])
    .filter((text) => String(text).trim())
    .map((text) => ({
      id: uuidv4(),
      type: 'paragraph',
      text: String(text).trim(),
    }));
}

function bodyTextToBlocks(bodyText) {
  if (!bodyText?.trim()) return [];
  return paragraphsToBlocks(
    bodyText
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\n/g, ' ').trim())
      .filter(Boolean)
  );
}

function ensureBodyBlocks(draft) {
  if (draft.bodyBlocks?.length) return draft.bodyBlocks;
  if (draft.bodyParagraphs?.length) return paragraphsToBlocks(draft.bodyParagraphs);
  if (draft.bodyText?.trim()) return bodyTextToBlocks(draft.bodyText);
  return [];
}

function blocksToParagraphs(blocks) {
  return (blocks || [])
    .filter((b) => b.type === 'paragraph' && b.text?.trim())
    .map((b) => b.text.trim());
}

function blocksToBodyText(blocks) {
  return blocksToParagraphs(blocks).join('\n\n');
}

function blocksToHtml(blocks, { preview = false, slug = '', draftId = '' } = {}) {
  return (blocks || [])
    .map((block) => {
      if (block.type === 'paragraph') {
        const text = String(block.text || '').trim();
        if (!text) return '';
        return `      <p>${escapeHtml(text)}</p>`;
      }

      if (block.type === 'image' && block.filename) {
        const src = preview
          ? `/api/drafts/${draftId}/media/${encodeURIComponent(block.filename)}`
          : `../images/posts/${slug}/${encodeURIComponent(block.filename)}`;
        const alt = escapeHtml(block.alt || '');
        const caption = block.caption
          ? `\n        <figcaption>${escapeHtml(block.caption)}</figcaption>`
          : '';
        return `      <figure class="article-figure">\n        <img src="${src}" alt="${alt}" loading="lazy">${caption}\n      </figure>`;
      }

      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function hasBodyContent(draft) {
  const blocks = ensureBodyBlocks(draft);
  if (
    blocks.some(
      (b) =>
        (b.type === 'paragraph' && b.text?.trim()) ||
        (b.type === 'image' && b.filename)
    )
  ) {
    return true;
  }
  return Boolean(draft.bodyHtml || draft.bodyParagraphs?.length);
}

module.exports = {
  paragraphsToBlocks,
  bodyTextToBlocks,
  ensureBodyBlocks,
  blocksToParagraphs,
  blocksToBodyText,
  blocksToHtml,
  hasBodyContent,
};
