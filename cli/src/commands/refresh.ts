import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { isGitRepo, listTrackedFiles } from '../lib/git';
import { shouldIncludeFile, prioritizeFiles } from '../lib/files';
import { mapFiles, reduceToContext } from '../lib/openai';
import { readConfig, writeConfig, configExists } from '../lib/config';
import { checkApiKey } from '../lib/setup';

const BATCH_SIZE = 10;
const MAX_FILE_SIZE = 50 * 1024;
const MAX_FILES = 100;

export async function refreshCommand(): Promise<void> {
  const cwd = process.cwd();

  checkApiKey();

  if (!isGitRepo(cwd)) {
    console.error(chalk.red('Error: Not a git repository.'));
    process.exit(1);
  }

  if (!configExists(cwd)) {
    console.error(chalk.red('Error: Changelog not initialized. Run `changelog init` first.'));
    process.exit(1);
  }

  process.stdout.write('\n');

  // Scan files (sync — no spinner, event loop would be blocked anyway)
  const allFiles = listTrackedFiles(cwd);
  const filtered = allFiles.filter(shouldIncludeFile);
  const prioritized = prioritizeFiles(filtered).slice(0, MAX_FILES);

  // Scroll file list through a 5-line window
  const DISPLAY_ROWS = 5;
  for (let i = 0; i < DISPLAY_ROWS; i++) process.stdout.write('\n');
  for (let i = 0; i < prioritized.length; i++) {
    process.stdout.write(`\x1b[${DISPLAY_ROWS}A`);
    const window = prioritized.slice(Math.max(0, i - DISPLAY_ROWS + 1), i + 1);
    while (window.length < DISPLAY_ROWS) window.unshift('');
    for (const f of window) {
      process.stdout.write(`\x1b[2K  ${f ? chalk.dim(`→ ${f}`) : ''}\n`);
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  // Clear the file list lines
  process.stdout.write(`\x1b[${DISPLAY_ROWS}A`);
  for (let i = 0; i < DISPLAY_ROWS; i++) process.stdout.write('\x1b[2K\n');
  process.stdout.write(`\x1b[${DISPLAY_ROWS}A`);

  // Read file contents and batch
  const fileContents = prioritized
    .map((filePath) => {
      try {
        const fullPath = path.join(cwd, filePath);
        if (fs.statSync(fullPath).size > MAX_FILE_SIZE) return null;
        return { path: filePath, content: fs.readFileSync(fullPath, 'utf-8') };
      } catch {
        return null;
      }
    })
    .filter((f): f is { path: string; content: string } => f !== null);

  const batches: Array<{ path: string; content: string }[]> = [];
  for (let i = 0; i < fileContents.length; i += BATCH_SIZE) {
    batches.push(fileContents.slice(i, i + BATCH_SIZE));
  }

  // Single spinner covers both batch analysis and context rebuild
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIdx = 0;
  const label = 'Rebuilding project context...';
  const spinId = setInterval(() => {
    process.stdout.write(`\r\x1b[2K  ${chalk.blue(spinnerFrames[frameIdx % spinnerFrames.length])}  ${label}`);
    frameIdx++;
  }, 80);

  const partialSummaries = await Promise.all(batches.map((batch) => mapFiles(batch)));
  const { projectContext, suggestedTags } = await reduceToContext(partialSummaries);

  clearInterval(spinId);
  process.stdout.write(`\r\x1b[2K`);

  const existing = readConfig(cwd);
  const addedTags = suggestedTags.filter((t) => !existing.tags.includes(t));
  const mergedTags = [...existing.tags, ...addedTags];

  writeConfig(
    { ...existing, projectContext, tags: mergedTags, scannedFiles: prioritized },
    cwd
  );

  console.log(chalk.green('✓ Project context refreshed!'));
  if (addedTags.length > 0) {
    console.log(chalk.dim('New tags added:'));
    for (const t of addedTags) console.log(chalk.cyan(`  · ${t}`));
  } else {
    console.log(chalk.dim('Tags are up to date.'));
  }
  console.log(chalk.dim('\nEdit .changelog/config.json to customize your tags.\n'));
}
