const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

module.exports = {
  ROOT,
  POSTS_PATH: path.join(ROOT, 'posts.json'),
  ARTICLES_DIR: path.join(ROOT, 'articles'),
  WRITING_PATH: path.join(ROOT, 'writing.html'),
  DRAFTS_DIR: path.join(ROOT, 'cms/drafts'),
  DRAFT_MEDIA_DIR: path.join(ROOT, 'cms/drafts/media'),
  UPLOADS_DIR: path.join(ROOT, 'cms/uploads'),
  IMAGES_DIR: path.join(ROOT, 'images/posts'),
  TEMPLATES_DIR: path.join(ROOT, 'cms/templates'),
  STUDIO_PORT: 3333,
};
