import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { isGitRepo, listTrackedFiles } from '../lib/git';
import { shouldIncludeFile, prioritizeFiles } from '../lib/files';
import { mapFiles, reduceToContext, setActiveSpinner } from '../lib/openai';
import { writeConfig, configExists, getConfigDir } from '../lib/config';
import { initDb } from '../lib/storage';
import { checkApiKey } from '../lib/setup';

const BATCH_SIZE = 10;
const MAX_FILE_SIZE = 50 * 1024; // 50KB
const MAX_FILES = 100;
const MAX_CONCURRENT = 3;

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const idx = next++;
      results[idx] = await tasks[idx]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return results;
}

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

  // Prompt for product name
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const productName = await new Promise<string>((resolve) => {
    rl.question(chalk.bold('Product or company name (shown on changelog website): '), (answer) => {
      rl.close();
      resolve(answer.trim() || 'Changelog');
    });
  });

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

  // Map: analyze batches with limited concurrency to avoid rate limits
  const indent = '  ';
  const mapSpinner = ora({
    text: `${indent}Analyzing ${batches.length} batch${batches.length !== 1 ? 'es' : ''}`,
    spinner: 'dots',
    indent: 2,
  }).start();
  setActiveSpinner(mapSpinner);

  let completed = 0;
  let partialSummaries: string[];
  try {
    partialSummaries = await runWithConcurrency(
      batches.map((batch) => async () => {
        const result = await mapFiles(batch);
        completed++;
        mapSpinner.text = `${indent}Analyzing batches (${completed}/${batches.length})`;
        return result;
      }),
      MAX_CONCURRENT
    );
    setActiveSpinner(null);
    mapSpinner.succeed(`${indent}Analyzed ${batches.length} batch${batches.length !== 1 ? 'es' : ''}`);
  } catch (err) {
    setActiveSpinner(null);
    mapSpinner.fail(`${indent}Batch analysis failed`);
    throw err;
  }

  // Reduce: synthesize into project context + tags
  const reduceSpinner = ora({
    text: `${indent}Building project context`,
    spinner: 'dots',
    indent: 2,
  }).start();
  setActiveSpinner(reduceSpinner);

  let projectContext: string;
  let suggestedTags: string[];
  try {
    const reduced = await reduceToContext(partialSummaries);
    projectContext = reduced.projectContext;
    suggestedTags = reduced.suggestedTags;
    setActiveSpinner(null);
    reduceSpinner.succeed(`${indent}Project context built`);
  } catch (err) {
    setActiveSpinner(null);
    reduceSpinner.fail(`${indent}Failed to build project context`);
    throw err;
  }

  // Write config and initialize DB
  const configDir = getConfigDir(cwd);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  writeConfig({
    productName,
    projectContext,
    tags: suggestedTags,
    scannedFiles: prioritized,
    alwaysInclude: [],
    excludePatterns: [],
    audience: '',
    model: 'gpt-4o',
    projectName: '',
    dateFormat: 'YYYY-MM-DD',
  }, cwd);
  initDb(cwd);

  // Create CHANGELOG.md
  const changelogMd = path.join(cwd, 'CHANGELOG.md');
  if (!fs.existsSync(changelogMd)) {
    fs.writeFileSync(changelogMd, '# Changelog\n');
  }

  console.log(chalk.green(`\n  ✓ Changelog initialized!\n`));
  console.log(chalk.dim('  Tags:'));
  for (const tag of suggestedTags) {
    console.log(chalk.cyan(`    + ${tag}`));
  }
  console.log(chalk.dim('\n  Edit .changelog/config.json to customize your tags.'));
  console.log(chalk.dim('  Run `changelog generate` to create your first entry.\n'));
}
