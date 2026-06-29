/**
 * Rebuild article HTML files with current nav/footer templates.
 * Preserves article body content; skips hand-crafted zine pages.
 */
const fs = require('fs');
const path = require('path');
const { POSTS_PATH, ARTICLES_DIR, WRITING_PATH } = require('./paths');
const {
  buildWritingHtml,
  rebuildArticleFile,
  readPosts,
} = require('./publish');

const SKIP_SLUGS = new Set(['a-system-so-perfect']);

function main() {
  const posts = readPosts();
  let rebuilt = 0;
  let skipped = 0;

  for (const category of ['fiction', 'nonfiction']) {
    for (const post of posts[category]) {
      if (SKIP_SLUGS.has(post.slug)) {
        console.log(`  skip: ${post.slug} (custom layout)`);
        skipped += 1;
        continue;
      }
      const ok = rebuildArticleFile(post.slug);
      if (ok) {
        console.log(`  rebuilt: articles/${post.slug}.html`);
        rebuilt += 1;
      } else {
        console.warn(`  missing: articles/${post.slug}.html`);
      }
    }
  }

  fs.writeFileSync(WRITING_PATH, buildWritingHtml(posts));
  console.log(`\nRebuilt ${rebuilt} article(s), skipped ${skipped}. Updated writing.html.`);
}

main();
