import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { isGitRepo, listTrackedFiles } from '../lib/git';
import { shouldIncludeFile, prioritizeFiles } from '../lib/files';
import { mapFiles, reduceToContext } from '../lib/openai';
import { writeConfig, configExists, getConfigDir } from '../lib/config';
import { initDb } from '../lib/storage';
import { checkApiKey } from '../lib/setup';

const BATCH_SIZE = 10;
const MAX_FILE_SIZE = 50 * 1024; // 50KB
const MAX_FILES = 100;

export async function initCommand(): Promise<void> {
  const cwd = process.cwd();

  checkApiKey();

  if (!isGitRepo(cwd)) {
    console.error(chalk.red('Error: Not a git repository. Run `git init` first.'));
    process.exit(1);
  }

  if (configExists(cwd)) {
    console.log(chalk.yellow('Changelog already initialized.'));
    console.log(chalk.dim('Run `changelog refresh` to update your project context.'));
    return;
  }

  console.log(chalk.bold('\nScanning codebase...\n'));

  // Scan and filter files
  const allFiles = listTrackedFiles(cwd);
  const filtered = allFiles.filter(shouldIncludeFile);
  const prioritized = prioritizeFiles(filtered).slice(0, MAX_FILES);

  for (const file of prioritized) {
    console.log(chalk.dim(`  → ${file}`));
  }
  console.log(chalk.dim(`\n  ${prioritized.length} files selected for analysis\n`));

  // Read file contents
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

  // Batch into groups
  const batches: Array<{ path: string; content: string }[]> = [];
  for (let i = 0; i < fileContents.length; i += BATCH_SIZE) {
    batches.push(fileContents.slice(i, i + BATCH_SIZE));
  }

  console.log(chalk.blue(`Analyzing ${batches.length} batch${batches.length !== 1 ? 'es' : ''} in parallel...`));

  // Map: analyze each batch in parallel
  let completed = 0;
  const partialSummaries = await Promise.all(
    batches.map(async (batch) => {
      const result = await mapFiles(batch);
      completed++;
      process.stdout.write(chalk.dim(`  ${completed}/${batches.length} complete\r`));
      return result;
    })
  );
  process.stdout.write('\n');

  // Reduce: synthesize into project context + tags
  console.log(chalk.blue('Building project context...'));
  const { projectContext, suggestedTags } = await reduceToContext(partialSummaries);

  // Write config and initialize DB
  const configDir = getConfigDir(cwd);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  writeConfig({ projectContext, tags: suggestedTags, scannedFiles: prioritized }, cwd);
  initDb(cwd);

  // Create CHANGELOG.md
  const changelogMd = path.join(cwd, 'CHANGELOG.md');
  if (!fs.existsSync(changelogMd)) {
    fs.writeFileSync(changelogMd, '# Changelog\n');
  }

  console.log(chalk.green('\n✓ Changelog initialized!\n'));
  console.log(chalk.dim('Suggested tags:'));
  for (const tag of suggestedTags) {
    console.log(chalk.cyan(`  · ${tag}`));
  }
  console.log(chalk.dim('\nEdit .changelog/config.json to customize your tags.'));
  console.log(chalk.dim('Run `changelog generate` to create your first entry.\n'));
}
