const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { ROOT, STUDIO_PORT, IMAGES_DIR } = require('./lib/paths');
const { extractWithProgress, cleanupUpload, ensureUploadsDir } = require('./lib/extract');
const {
  listDrafts,
  getDraft,
  createDraft,
  updateDraft,
  deleteDraft,
  draftMediaDir,
} = require('./lib/drafts');
const {
  publishDraft,
  buildPreviewHtml,
  readPosts,
  deletePost,
  loadPostForEdit,
  republishPost,
} = require('./lib/publish');
const { listPublications, addPublication } = require('./lib/publications');
const { getGitStatus, getPushInstructions } = require('./lib/git');

ensureUploadsDir();

const upload = multer({
  dest: path.join(ROOT, 'cms/uploads'),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/styles.css', (_req, res) => {
  res.sendFile(path.join(ROOT, 'styles.css'));
});
app.use('/scripts', express.static(path.join(ROOT, 'scripts')));
app.use('/articles', express.static(path.join(ROOT, 'articles')));
app.use('/images', express.static(path.join(ROOT, 'images')));
app.get('/writing.html', (_req, res) => {
  res.sendFile(path.join(ROOT, 'writing.html'));
});
app.get('/index.html', (_req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});
app.use(express.static(path.join(ROOT, 'cms/public')));

app.get('/api/drafts', (_req, res) => {
  res.json({ drafts: listDrafts() });
});

app.get('/api/posts', (_req, res) => {
  res.json(readPosts());
});

app.get('/api/publications', (_req, res) => {
  res.json({ publications: listPublications() });
});

app.post('/api/publications', (req, res) => {
  try {
    const publications = addPublication(req.body?.name);
    res.json({ publications });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/drafts/:id', (req, res) => {
  const draft = getDraft(req.params.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  res.json(draft);
});

app.put('/api/drafts/:id', (req, res) => {
  const draft = updateDraft(req.params.id, req.body);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  res.json(draft);
});

app.delete('/api/drafts/:id', (req, res) => {
  const ok = deleteDraft(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Draft not found' });
  res.json({ ok: true });
});

app.get('/api/drafts/:id/preview', (req, res) => {
  const draft = getDraft(req.params.id);
  if (!draft) return res.status(404).send('Draft not found');
  res.type('html').send(buildPreviewHtml(draft));
});

function publishedMediaDir(id) {
  const slug = id.replace(/^published-/, '');
  return path.join(IMAGES_DIR, slug);
}

function resolveMediaDir(id) {
  if (String(id).startsWith('published-')) {
    return publishedMediaDir(id);
  }
  return draftMediaDir(id);
}

app.get('/api/drafts/:id/media/:filename', (req, res) => {
  const { id, filename } = req.params;
  const isPublished = String(id).startsWith('published-');

  if (!isPublished) {
    const draft = getDraft(id);
    if (!draft) return res.status(404).send('Draft not found');
  } else {
    try {
      loadPostForEdit(id.replace(/^published-/, ''));
    } catch {
      return res.status(404).send('Post not found');
    }
  }

  const file = path.join(resolveMediaDir(id), filename);
  if (!fs.existsSync(file)) return res.status(404).send('Image not found');
  res.sendFile(file);
});

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = resolveMediaDir(req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed (.jpg, .png, .gif, .webp)'));
  },
});

app.post('/api/drafts/:id/images', imageUpload.single('image'), (req, res) => {
  const { id } = req.params;
  const isPublished = String(id).startsWith('published-');

  if (!isPublished) {
    const draft = getDraft(id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
  } else {
    try {
      loadPostForEdit(id.replace(/^published-/, ''));
    } catch (err) {
      return res.status(404).json({ error: err.message });
    }
  }

  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const url = isPublished
    ? `/images/posts/${id.replace(/^published-/, '')}/${encodeURIComponent(req.file.filename)}`
    : `/api/drafts/${id}/media/${encodeURIComponent(req.file.filename)}`;

  res.json({
    block: {
      id: uuidv4(),
      type: 'image',
      filename: req.file.filename,
      alt: path.basename(req.file.originalname, path.extname(req.file.originalname)),
      caption: '',
    },
    url,
  });
});

app.post('/api/drafts/:id/publish', (req, res) => {
  const draft = getDraft(req.params.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });

  try {
    const result = publishDraft(draft);
    deleteDraft(req.params.id);
    const git = getGitStatus();
    const push = getPushInstructions(draft.title);
    res.json({ ...result, git, push });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/posts/:slug/edit', (req, res) => {
  try {
    const post = loadPostForEdit(req.params.slug);
    res.json(post);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.put('/api/posts/:slug', (req, res) => {
  try {
    const createRedirect = req.body?.createRedirect !== false;
    const result = republishPost(req.params.slug, req.body, { createRedirect });
    const git = getGitStatus();
    const push = getPushInstructions(req.body.title);
    res.json({ ...result, git, push });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/posts/:slug/preview', (req, res) => {
  try {
    const draft = {
      ...req.body,
      id: `published-${req.params.slug}`,
      publishedSlug: req.params.slug,
    };
    res.type('html').send(buildPreviewHtml(draft));
  } catch (err) {
    res.status(400).send(err.message);
  }
});

app.delete('/api/posts/:slug', (req, res) => {
  try {
    const result = deletePost(req.params.slug);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get('/api/git/status', (_req, res) => {
  res.json(getGitStatus());
});

const uploadJobs = new Map();

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const jobId = req.file.filename;

  try {
    const onProgress = (step) => {
      uploadJobs.set(jobId, step);
    };

    uploadJobs.set(jobId, { label: 'Uploading', pct: 5 });

    const { paragraphs } = await extractWithProgress(
      req.file.path,
      req.file.originalname,
      onProgress
    );

    const draft = createDraft({
      sourceFile: req.file.originalname,
      paragraphs,
    });

    cleanupUpload(req.file.path);
    uploadJobs.delete(jobId);

    res.json({ draftId: draft.id, draft });
  } catch (err) {
    cleanupUpload(req.file?.path);
    uploadJobs.delete(jobId);
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/upload/progress/:jobId', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const jobId = req.params.jobId;
  const interval = setInterval(() => {
    const step = uploadJobs.get(jobId);
    if (step) {
      res.write(`data: ${JSON.stringify(step)}\n\n`);
    }
  }, 200);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(ROOT, 'cms/public/index.html'));
});

app.listen(STUDIO_PORT, () => {
  console.log('');
  console.log('  Writing Studio');
  console.log('  ─────────────────────────────────');
  console.log(`  Open: http://localhost:${STUDIO_PORT}`);
  console.log('  Press Ctrl+C to stop');
  console.log('');
});
