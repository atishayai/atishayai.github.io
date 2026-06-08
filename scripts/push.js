#!/usr/bin/env node
const readline = require('readline');
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  let status;
  try {
    status = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (err) {
    console.error('Git is not available or this is not a git repository.');
    process.exit(1);
  }

  if (!status) {
    console.log('Nothing to commit — working tree clean.');
    process.exit(0);
  }

  console.log('Changed files:');
  status.split('\n').forEach((line) => console.log(`  ${line.slice(3)}`));

  const defaultMsg = 'Update writing';
  const msg = (await ask(`\nCommit message [${defaultMsg}]: `)) || defaultMsg;
  const confirm = await ask('Run git add, commit, and push? (y/N): ');

  if (confirm.toLowerCase() !== 'y') {
    console.log('Cancelled. Run these manually when ready:');
    console.log('  git add .');
    console.log(`  git commit -m "${msg}"`);
    console.log('  git push');
    process.exit(0);
  }

  run('git add .');
  run(`git commit -m "${msg.replace(/"/g, '\\"')}"`);
  run('git push');
  console.log('\nPushed. GitHub Pages should update in 1–2 minutes.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
