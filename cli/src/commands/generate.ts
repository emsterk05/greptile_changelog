import chalk from 'chalk';
import ora from 'ora';
import { v4 as uuidv4 } from 'uuid';
import { readConfig, writeConfig, configExists } from '../lib/config';
import { initDb, readState, updateState, insertChangelog } from '../lib/storage';
import { isGitRepo, getDiff, resolveRef, getCurrentBranch, getDefaultBranch } from '../lib/git';
import { generateChangelog, DIFF_LIMIT, setActiveSpinner } from '../lib/openai';
import { appendToChangelogMd } from '../lib/files';
import { checkApiKey } from '../lib/setup';

interface GenerateOptions {
  from?: string;
  to?: string;
  date?: string;
}

// Split a diff into chunks of at most maxBytes, splitting only at file boundaries.
function splitDiffIntoChunks(diff: string, maxBytes: number): string[] {
  const parts = diff.split(/(?=^diff --git )/m);
  const chunks: string[] = [];
  let current = '';

  for (let part of parts) {
    if (part.length > maxBytes) {
      part = part.slice(0, maxBytes) + '\n[... diff truncated: file too large ...]\n';
    }
    if (current.length + part.length > maxBytes && current.length > 0) {
      chunks.push(current);
      current = part;
    } else {
      current += part;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

// Match a glob pattern against a file path.
// Supports * (within a segment), ** (across segments), and ? (single char).
function matchGlob(filePath: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex special chars (not * or ?)
    .replace(/\*\*/g, '\x00')              // placeholder for **
    .replace(/\*/g, '[^/]*')               // * matches within one path segment
    .replace(/\x00/g, '.*')               // ** matches across segments
    .replace(/\?/g, '[^/]');              // ? matches a single char
  return new RegExp(`^${regexStr}$`).test(filePath);
}

// Strip hunks for files matching any exclude pattern from the diff.
function filterDiff(diff: string, excludePatterns: string[]): string {
  if (!excludePatterns.length) return diff;
  const parts = diff.split(/(?=^diff --git )/m);
  return parts
    .filter((part) => {
      const match = part.match(/^diff --git a\/.* b\/(.+)$/m);
      if (!match) return true; // keep preamble
      return !excludePatterns.some((p) => matchGlob(match[1], p));
    })
    .join('');
}

export async function generateCommand(options: GenerateOptions): Promise<void> {
  const cwd = process.cwd();

  checkApiKey();

  if (!isGitRepo(cwd)) {
    console.error(chalk.red('Error: Not a git repository.'));
    process.exit(1);
  }

  // Abort if not on the default branch
  if (!options.from && !options.to) {
    const current = getCurrentBranch(cwd);
    const defaultBranch = getDefaultBranch(cwd);
    if (current && defaultBranch && current !== defaultBranch) {
      console.error(
        chalk.red(
          `Error: You are on branch "${current}", not "${defaultBranch}".\n` +
          `Switch to "${defaultBranch}" before generating a changelog.`
        )
      );
      process.exit(1);
    }
  }

  if (!configExists(cwd)) {
    console.error(chalk.red('Error: Changelog not initialized. Run `changelog init` first.'));
    process.exit(1);
  }

  // Ensure the DB schema is up to date (migrates older databases missing new tables)
  initDb(cwd);

  const config = readConfig(cwd);
  const state = readState(cwd);

  // Determine commit range
  const fromRef = options.from ?? state.last_commit_hash ?? null;
  const toRef = options.to ?? 'HEAD';

  if (!fromRef) {
    console.error(
      chalk.red('Error: No previous commit found. Use --from <ref> to specify a starting point.')
    );
    process.exit(1);
  }

  const fromHash = resolveRef(fromRef, cwd);
  const toHash = resolveRef(toRef, cwd);

  console.log(`    Generating changelog: ${fromHash.slice(0, 7)} → ${toHash.slice(0, 7)}\n`);

  let diff = getDiff(fromRef, toRef, cwd);

  if (!diff.trim()) {
    console.log(chalk.yellow('No changes found in the specified range.'));
    return;
  }

  // Apply exclude patterns
  if (config.excludePatterns.length) {
    const before = diff.length;
    diff = filterDiff(diff, config.excludePatterns);
    const removed = before - diff.length;
    if (removed > 0) {
      console.log(chalk.dim(`    Excluded ${(removed / 1024).toFixed(1)}KB matching exclude patterns.\n`));
    }
    if (!diff.trim()) {
      console.log(chalk.yellow('No changes remain after applying exclude patterns.'));
      return;
    }
  }

  const chunkCount = Math.ceil(diff.length / DIFF_LIMIT);
  const indent = '    ';
  const spinnerText = chunkCount > 1
    ? `${indent}Analyzing ${chunkCount} batches in parallel (${(diff.length / 1024).toFixed(0)}KB diff)`
    : `${indent}Analyzing diff (${(diff.length / 1024).toFixed(1)}KB)`;

  const spinner = ora({ text: spinnerText, spinner: 'dots', indent: 4 }).start();
  setActiveSpinner(spinner);

  let entries: Awaited<ReturnType<typeof generateChangelog>>['entries'];
  let newTags: string[];
  let actualChunks: number;

  try {
    const result = await generateChangelog(
      config.projectContext,
      config.tags,
      diff,
      {
        audience: config.audience || undefined,
        alwaysInclude: config.alwaysInclude,
        model: config.model,
      }
    );
    entries = result.entries;
    newTags = result.newTags;
    actualChunks = result.chunkCount;

    setActiveSpinner(null);
    if (actualChunks > 1) {
      spinner.succeed(chalk.green(`Analyzed ${actualChunks} batches`));
    } else {
      spinner.succeed(chalk.green('Analysis complete'));
    }
  } catch (err) {
    setActiveSpinner(null);
    spinner.fail('Analysis failed');
    throw err;
  }

  if (entries.length === 0) {
    console.log(chalk.yellow('No user-facing changes found in this diff.'));
    return;
  }

  // Add any new tags suggested by the LLM to the config
  if (newTags.length > 0) {
    const addedTags: string[] = [];
    for (const t of newTags) {
      if (!config.tags.includes(t)) {
        config.tags.push(t);
        addedTags.push(t);
      }
    }
    if (addedTags.length > 0) {
      writeConfig(config, cwd);
      console.log(chalk.dim(`    Added new tags to config: ${addedTags.join(', ')}\n`));
    }
  }

  const date = options.date ?? new Date().toISOString().split('T')[0];
  if (options.date && !/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
    console.error(chalk.red('Error: --date must be in YYYY-MM-DD format.'));
    process.exit(1);
  }
  const id = uuidv4();

  // Write to database
  insertChangelog(id, date, fromHash, toHash, entries, cwd);

  // Write CHANGELOG.md
  appendToChangelogMd({ id, date, from_commit: fromHash, to_commit: toHash, entries }, cwd);

  // Update state
  const newCount = state.generate_count + 1;
  updateState(toHash, newCount, cwd);

  // Print summary
  const count = entries.length;
  const chunkNote = actualChunks > 1 ? ` (from ${actualChunks} diff chunks)` : '';
  // Staggered output — lines appear one at a time
  const lines: string[] = [];

  lines.push(chalk.green(`    ✓ Generated ${count} changelog ${count === 1 ? 'entry' : 'entries'}${chunkNote}:`));
  for (const entry of entries) {
    lines.push(`      ${chalk.cyan(`[${entry.tags.join(', ')}]`)} ${chalk.gray(entry.title)}`);
  }

  // Refresh suggestion — only every 10 generates, only if significant structural changes
  if (newCount % 10 === 0) {
    const diffPaths = [...diff.matchAll(/^diff --git a\/.* b\/(.+)$/gm)].map((m) => m[1]);
    const scannedTopDirs = new Set(
      config.scannedFiles.map((p: string) => p.split('/')[0]).filter(Boolean)
    );
    const diffTopDirs = new Set(
      diffPaths.map((p) => p.split('/')[0]).filter(Boolean)
    );
    const hasNewTopDirs = [...diffTopDirs].some((d) => !scannedTopDirs.has(d));

    if (hasNewTopDirs) {
      lines.push('');
      lines.push(chalk.dim('    Tip: new areas of the codebase detected. Run `changelog refresh` to update your project context.'));
    }
  }

  lines.push('');
  lines.push('    Saved changelog to database.');
  lines.push(chalk.dim('    Run `changelog serve` to view your changelog on the web.'));
  lines.push('');

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (const line of lines) {
    await delay(80);
    console.log(line);
  }
}
