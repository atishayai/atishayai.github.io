function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(title) {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

function toRomanNumeral(index) {
  return ROMAN[index] || String(index + 1);
}

function renderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return vars[key] !== undefined ? vars[key] : '';
  });
}

function textToParagraphs(text) {
  return String(text)
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);
}

function paragraphsToHtml(paragraphs) {
  return paragraphs.map((p) => `      <p>${escapeHtml(p)}</p>`).join('\n');
}

function bodyTextToParagraphs(bodyText) {
  return textToParagraphs(bodyText);
}

function buildMetaLine(draft) {
  const accent = draft.metaAccent || draft.tag?.toLowerCase() || 'essay';
  const venue = draft.metaVenue || draft.publication?.toLowerCase() || 'draft';
  const date = draft.metaDate || draft.date?.toLowerCase() || 'draft';
  return `<span class="accent">${escapeHtml(accent)}</span> · ${escapeHtml(venue)} · ${escapeHtml(date)}`;
}

const ALLOWED_INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'span', 'a', 'br']);

function sanitizeInlineHtml(html) {
  if (!html?.trim()) return '';
  let out = String(html);

  out = out.replace(/<script[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style[\s\S]*?<\/style>/gi, '');
  out = out.replace(/on\w+\s*=\s*(['"])[^'"]*\1/gi, '');
  out = out.replace(/javascript:/gi, '');

  out = out.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (match, tag, attrs) => {
    const lower = tag.toLowerCase();
    if (!ALLOWED_INLINE_TAGS.has(lower)) return '';
    if (match.startsWith('</')) return `</${lower}>`;

    if (lower === 'span') {
      const colorMatch = attrs.match(/style\s*=\s*(['"])([^'"]*)\1/i);
      if (colorMatch) {
        const style = colorMatch[2];
        const colorOnly = style.match(/^\s*color\s*:\s*([^;]+)\s*;?\s*$/i);
        if (colorOnly) {
          const color = colorOnly[1].trim().replace(/[^#a-z0-9(),.%\s-]/gi, '');
          return `<span style="color: ${color}">`;
        }
      }
      return '<span>';
    }

    if (lower === 'a') {
      const hrefMatch = attrs.match(/href\s*=\s*(['"])([^'"]*)\1/i);
      if (hrefMatch) {
        const href = hrefMatch[2].replace(/javascript:/gi, '');
        return `<a href="${escapeHtml(href)}">`;
      }
      return '';
    }

    return `<${lower}>`;
  });

  return out.trim();
}

function alignClass(align) {
  if (align === 'center') return 'article-p-center';
  if (align === 'right') return 'article-p-right';
  return '';
}

module.exports = {
  escapeHtml,
  slugify,
  toRomanNumeral,
  renderTemplate,
  textToParagraphs,
  paragraphsToHtml,
  bodyTextToParagraphs,
  buildMetaLine,
  sanitizeInlineHtml,
  alignClass,
};
