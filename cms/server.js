const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { ROOT, STUDIO_PORT } = require('./lib/paths');
const { extractWithProgress, cleanupUpload, ensureUploadsDir } = require('./lib/extract');
const {
  listDrafts,
  getDraft,
  createDraft,
  updateDraft,
  deleteDraft,
  draftMediaDir,
} = require('./lib/drafts');
const { publishDraft, buildPreviewHtml, readPosts } = require('./lib/publish');
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
app.get('/sidequests.html', (_req, res) => {
  res.sendFile(path.join(ROOT, 'sidequests.html'));
});
app.use(express.static(path.join(ROOT, 'cms/public')));

app.get('/api/drafts', (_req, res) => {
  res.json({ drafts: listDrafts() });
});

app.get('/api/posts', (_req, res) => {
  res.json(readPosts());
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

app.get('/api/drafts/:id/media/:filename', (req, res) => {
  const draft = getDraft(req.params.id);
  if (!draft) return res.status(404).send('Draft not found');
  const file = path.join(draftMediaDir(req.params.id), req.params.filename);
  if (!fs.existsSync(file)) return res.status(404).send('Image not found');
  res.sendFile(file);
});

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = draftMediaDir(req.params.id);
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
  const draft = getDraft(req.params.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  res.json({
    block: {
      id: uuidv4(),
      type: 'image',
      filename: req.file.filename,
      alt: path.basename(req.file.originalname, path.extname(req.file.originalname)),
      caption: '',
    },
    url: `/api/drafts/${req.params.id}/media/${encodeURIComponent(req.file.filename)}`,
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
