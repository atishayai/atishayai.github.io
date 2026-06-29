const fs = require('fs');
const path = require('path');
const { ROOT, POSTS_PATH } = require('./paths');

const PUBLICATIONS_PATH = path.join(ROOT, 'cms/publications.json');

const DEFAULT_PUBLICATIONS = ['Personal', 'Joyland', 'The Margins'];

function readPublicationsFile() {
  if (!fs.existsSync(PUBLICATIONS_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(PUBLICATIONS_PATH, 'utf8'));
    return Array.isArray(data) ? data : data.publications || [];
  } catch {
    return [];
  }
}

function writePublicationsFile(list) {
  const dir = path.dirname(PUBLICATIONS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PUBLICATIONS_PATH, JSON.stringify(list, null, 2) + '\n');
}

function publicationsFromPosts() {
  const posts = JSON.parse(fs.readFileSync(POSTS_PATH, 'utf8'));
  const venues = new Set();
  for (const category of ['fiction', 'nonfiction']) {
    for (const post of posts[category] || []) {
      if (post.publication?.trim()) venues.add(post.publication.trim());
    }
  }
  return [...venues];
}

function listPublications() {
  const fromPosts = publicationsFromPosts();
  const fromFile = readPublicationsFile();
  const merged = [...new Set([...DEFAULT_PUBLICATIONS, ...fromFile, ...fromPosts])];
  return merged.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function addPublication(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Publication name is required.');
  const list = listPublications();
  if (list.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
    return list;
  }
  const fromFile = readPublicationsFile();
  fromFile.push(trimmed);
  writePublicationsFile(fromFile);
  return listPublications();
}

module.exports = {
  listPublications,
  addPublication,
};
