const { execSync } = require('child_process');
const { ROOT } = require('./paths');

function runGit(args) {
  return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function getGitStatus() {
  try {
    const porcelain = runGit('status --porcelain');
    const branch = runGit('rev-parse --abbrev-ref HEAD');
    const files = porcelain
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const status = line.slice(0, 2).trim() || '?';
        const file = line.slice(3);
        return { status, file };
      });

    return {
      ok: true,
      branch,
      files,
      hasChanges: files.length > 0,
      ahead: getAheadCount(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      files: [],
      hasChanges: false,
    };
  }
}

function getAheadCount() {
  try {
    const out = runGit('rev-list --count @{u}..HEAD 2>/dev/null || echo 0');
    return parseInt(out, 10) || 0;
  } catch {
    return 0;
  }
}

function getPushInstructions(title) {
  const commitMsg = title ? `Add: ${title}` : 'Update writing';
  return {
    steps: [
      'Open Terminal in this project folder',
      'Run: git add .',
      `Run: git commit -m "${commitMsg}"`,
      'Run: git push',
      'Wait 1–2 minutes for GitHub Pages to update',
    ],
    commands: ['git add .', `git commit -m "${commitMsg}"`, 'git push'],
  };
}

module.exports = {
  getGitStatus,
  getPushInstructions,
};
