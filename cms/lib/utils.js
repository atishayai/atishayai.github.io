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

module.exports = {
  escapeHtml,
  slugify,
  toRomanNumeral,
  renderTemplate,
  textToParagraphs,
  paragraphsToHtml,
  bodyTextToParagraphs,
  buildMetaLine,
};
