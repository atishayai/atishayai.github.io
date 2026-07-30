/**
 * One-time utility: sync posts.json from writing.html if needed.
 * The manifest is already checked in; this validates article files exist.
 */
const fs = require('fs');
const path = require('path');
const { POSTS_PATH, ARTICLES_DIR } = require('./paths');

function main() {
  const posts = JSON.parse(fs.readFileSync(POSTS_PATH, 'utf8'));
  let missing = 0;

  const list = (posts.posts || []).filter((p) => p.slug);
  for (const post of list) {
    const articlePath = path.join(ARTICLES_DIR, `${post.slug}.html`);
    if (!fs.existsSync(articlePath)) {
      console.warn(`Missing article: ${post.slug}.html`);
      missing++;
    }
  }

  console.log(`Validated ${list.length} readable of ${(posts.posts || []).length} entries.`);
  if (missing) {
    console.warn(`${missing} article file(s) missing.`);
    process.exit(1);
  }
  console.log('All article files present.');
}

main();
