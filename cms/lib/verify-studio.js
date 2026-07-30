/**
 * Unit-style checks for Writing Studio publish/delete/shell/blocks logic.
 */
const assert = require('assert');
const { sanitizeInlineHtml, slugify, alignClass } = require('./utils');
const { blocksToHtml, ensureBodyBlocks } = require('./blocks');
const { renderSiteNav, renderSiteFooter, SITE_EMAIL } = require('./shell');
const { parseArticleBodyHtml, buildWritingHtml } = require('./publish');
const { listPublications } = require('./publications');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('verify-studio\n');

test('slugify produces URL-safe slugs', () => {
  assert.strictEqual(slugify("The Paan Shot Dilemma"), 'the-paan-shot-dilemma');
  assert.strictEqual(slugify('  Hello World!  '), 'hello-world');
});

test('sanitizeInlineHtml allows bold/italic/color', () => {
  const html = sanitizeInlineHtml('<b>bold</b> <i>it</i> <span style="color: #c4a97d">gold</span>');
  assert.ok(html.includes('<b>bold</b>'));
  assert.ok(html.includes('<i>it</i>'));
  assert.ok(html.includes('color: #c4a97d'));
});

test('sanitizeInlineHtml strips scripts', () => {
  const html = sanitizeInlineHtml('<script>alert(1)</script><b>ok</b>');
  assert.ok(!html.includes('script'));
  assert.ok(html.includes('<b>ok</b>'));
});

test('blocksToHtml renders paragraph alignment', () => {
  const html = blocksToHtml([
    { id: '1', type: 'paragraph', text: 'centered', align: 'center' },
  ]);
  assert.ok(html.includes('article-p-center'));
  assert.ok(html.includes('centered'));
});

test('blocksToHtml renders inline html in paragraphs', () => {
  const html = blocksToHtml([
    { id: '1', type: 'paragraph', html: '<b>bold</b> word' },
  ]);
  assert.ok(html.includes('<b>bold</b>'));
});

test('parseArticleBodyHtml extracts paragraphs', () => {
  const article = `<div class="article-body">
      <p>First paragraph.</p>
      <p class="article-p-center">Centered.</p>
    </div>`;
  const blocks = parseArticleBodyHtml(article);
  assert.strictEqual(blocks.length, 2);
  assert.strictEqual(blocks[0].text, 'First paragraph.');
  assert.strictEqual(blocks[1].align, 'center');
});

test('renderSiteNav includes atishay.io links', () => {
  const nav = renderSiteNav(0, { active: 'writing' });
  assert.ok(nav.includes('atishay'));
  assert.ok(nav.includes('writing.html'));
  assert.ok(!nav.includes('sidequests'));
  assert.ok(!nav.includes('work'));
});

test('renderSiteNav depth prefix for articles', () => {
  const nav = renderSiteNav(1);
  assert.ok(nav.includes('../writing.html'));
  assert.ok(nav.includes('../index.html#about'));
});

test('renderSiteNav root pages link to index anchors', () => {
  const nav = renderSiteNav(0);
  assert.ok(nav.includes('#about') || nav.includes('index.html#about'));
  assert.ok(!nav.includes('sidequests'));
});

test('renderSiteFooter has email and copyright', () => {
  const footer = renderSiteFooter();
  assert.ok(footer.includes(SITE_EMAIL));
  assert.ok(footer.includes('© atishay.io 2026'));
  assert.ok(footer.includes('v2-footer-x'));
});

test('buildWritingHtml includes v2 nav/footer', () => {
  const html = buildWritingHtml({ posts: [] });
  assert.ok(html.includes('v2-nav'));
  assert.ok(html.includes('v2-footer'));
});

test('listPublications returns sorted venues', () => {
  const pubs = listPublications();
  assert.ok(Array.isArray(pubs));
  assert.ok(pubs.length >= 1);
  const sorted = [...pubs].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  assert.deepStrictEqual(pubs, sorted);
});

test('alignClass maps alignment values', () => {
  assert.strictEqual(alignClass('center'), 'article-p-center');
  assert.strictEqual(alignClass('right'), 'article-p-right');
  assert.strictEqual(alignClass('left'), '');
});

test('ensureBodyBlocks prefers bodyBlocks', () => {
  const blocks = ensureBodyBlocks({
    bodyBlocks: [{ id: '1', type: 'paragraph', text: 'hi' }],
    bodyParagraphs: ['other'],
  });
  assert.strictEqual(blocks[0].text, 'hi');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
