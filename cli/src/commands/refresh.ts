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
const SCROLL_ROWS = 5;

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

  // Scan files silently
  const allFiles = listTrackedFiles(cwd);
  const filtered = allFiles.filter(shouldIncludeFile);
  const prioritized = prioritizeFiles(filtered).slice(0, MAX_FILES);

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

  // Reserve scroll lines
  process.stdout.write('\n');
  for (let i = 0; i < SCROLL_ROWS; i++) process.stdout.write('\n');

  // 1. API starts immediately in the background
  const apiPromise = Promise.all(batches.map((batch) => mapFiles(batch)))
    .then((partials) => reduceToContext(partials));

  // 2. Scroll runs — resolves when all files have been shown
  let scrollPos = 0;
  const scrollDone = new Promise<void>((resolve) => {
    const scrollId = setInterval(() => {
      if (scrollPos < prioritized.length) scrollPos++;
      else { clearInterval(scrollId); resolve(); }
    }, 30);
  });

  const renderId = setInterval(() => {
    const window = prioritized.slice(Math.max(0, scrollPos - SCROLL_ROWS), scrollPos);
    const padded = [...Array(SCROLL_ROWS - window.length).fill(''), ...window];
    process.stdout.write(`\x1b[${SCROLL_ROWS}A`);
    for (const f of padded) {
      process.stdout.write(`\r\x1b[2K  ${f ? chalk.dim(`→ ${f}`) : ''}\n`);
    }
  }, 80);

  await scrollDone;
  clearInterval(renderId);

  // Clear scroll lines
  process.stdout.write(`\x1b[${SCROLL_ROWS}A`);
  for (let i = 0; i < SCROLL_ROWS; i++) process.stdout.write('\r\x1b[2K\n');
  process.stdout.write(`\x1b[${SCROLL_ROWS + 1}A`);

  // 3. Spinner: "Rebuilding context and updating tags..."
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinFrame = 0;
  const spinnerId = setInterval(() => {
    process.stdout.write(`\r\x1b[2K  ${chalk.blue(spinnerFrames[spinFrame % spinnerFrames.length])}  Rebuilding context and updating tags...`);
    spinFrame++;
  }, 80);

  // 4. When API finishes, stop spinner and show final output
  const { projectContext, suggestedTags } = await apiPromise;
  clearInterval(spinnerId);
  process.stdout.write('\r\x1b[2K');

  const existing = readConfig(cwd);
  const addedTags = suggestedTags.filter((t) => !existing.tags.includes(t));
  const mergedTags = [...existing.tags, ...addedTags];
  writeConfig({ ...existing, projectContext, tags: mergedTags, scannedFiles: prioritized }, cwd);

  process.stdout.write(`  ${chalk.green('✓')}  Project context refreshed!\n`);
  process.stdout.write(chalk.dim('     Tags are up to date. Edit .changelog/config.json to customize your tags.\n'));
  process.stdout.write('\n');
}
