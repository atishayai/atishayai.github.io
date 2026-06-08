const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { textToParagraphs } = require('./utils');
const { UPLOADS_DIR } = require('./paths');

const SUPPORTED = new Set(['.txt', '.md', '.pdf', '.docx']);

function getExtension(filename) {
  return path.extname(filename).toLowerCase();
}

async function extractFromFile(filePath, originalName) {
  const ext = getExtension(originalName || filePath);

  if (!SUPPORTED.has(ext)) {
    if (ext === '.doc') {
      throw new Error('Legacy .doc files are not supported. Please save as .docx or PDF.');
    }
    throw new Error(`Unsupported file type "${ext}". Use .txt, .md, .docx, or .pdf.`);
  }

  if (ext === '.txt' || ext === '.md') {
    const text = fs.readFileSync(filePath, 'utf8');
    return { text, paragraphs: textToParagraphs(text) };
  }

  if (ext === '.pdf') {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    const text = data.text || '';
    return { text, paragraphs: textToParagraphs(text) };
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value || '';
    return { text, paragraphs: textToParagraphs(text) };
  }

  throw new Error('Unsupported file type.');
}

async function extractWithProgress(filePath, originalName, onProgress) {
  const steps = [
    { label: 'Reading file', pct: 20 },
    { label: 'Extracting text', pct: 55 },
    { label: 'Splitting paragraphs', pct: 80 },
    { label: 'Creating draft', pct: 100 },
  ];

  onProgress(steps[0]);
  await delay(120);

  onProgress(steps[1]);
  const result = await extractFromFile(filePath, originalName);

  onProgress(steps[2]);
  await delay(80);

  onProgress(steps[3]);
  return result;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanupUpload(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore cleanup errors
  }
}

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

module.exports = {
  SUPPORTED,
  getExtension,
  extractFromFile,
  extractWithProgress,
  cleanupUpload,
  ensureUploadsDir,
};
