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

  console.log(chalk.bold('\nRefreshing project context...\n'));

  const allFiles = listTrackedFiles(cwd);
  const filtered = allFiles.filter(shouldIncludeFile);
  const prioritized = prioritizeFiles(filtered).slice(0, MAX_FILES);

  for (const file of prioritized) {
    console.log(chalk.dim(`  → ${file}`));
  }

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

  console.log(chalk.blue(`\nAnalyzing ${batches.length} batch${batches.length !== 1 ? 'es' : ''} in parallel...`));

  const partialSummaries = await Promise.all(batches.map((batch) => mapFiles(batch)));

  console.log(chalk.blue('Rebuilding project context...'));
  const { projectContext, suggestedTags } = await reduceToContext(partialSummaries);

  // Preserve existing tags — user may have customized them
  const existing = readConfig(cwd);

  writeConfig(
    { projectContext, tags: existing.tags, scannedFiles: prioritized },
    cwd
  );

  console.log(chalk.green('\n✓ Project context refreshed!\n'));
  console.log(chalk.dim('New suggested tags from scan:'), suggestedTags.join(', '));
  console.log(chalk.dim('(Your existing tags were preserved. Edit .changelog/config.json to update them.)\n'));
}
