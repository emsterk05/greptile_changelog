import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import { readConfig, writeConfig, configExists } from '../lib/config';
import { readState, updateState, insertChangelog } from '../lib/storage';
import { isGitRepo, getDiff, resolveRef, getCurrentBranch, getDefaultBranch } from '../lib/git';
import { generateChangelog, DIFF_LIMIT } from '../lib/openai';
import { appendToChangelogMd } from '../lib/files';
import { checkApiKey } from '../lib/setup';

interface GenerateOptions {
  from?: string;
  to?: string;
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

  // Warn if not on the default branch
  if (!options.from && !options.to) {
    const current = getCurrentBranch(cwd);
    const defaultBranch = getDefaultBranch(cwd);
    if (current && defaultBranch && current !== defaultBranch) {
      console.warn(
        chalk.yellow(
          `Warning: You are on branch "${current}", not "${defaultBranch}".\n` +
          `Changelogs should be generated from the default branch to capture all merged changes.\n` +
          `Switch to "${defaultBranch}" or use --from/--to to set an explicit range.\n`
        )
      );
    }
  }

  if (!configExists(cwd)) {
    console.error(chalk.red('Error: Changelog not initialized. Run `changelog init` first.'));
    process.exit(1);
  }

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

  console.log(chalk.blue(`\nGenerating changelog: ${fromHash.slice(0, 7)} → ${toHash.slice(0, 7)}\n`));

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
      console.log(chalk.dim(`Excluded ${(removed / 1024).toFixed(1)}KB matching exclude patterns.\n`));
    }
    if (!diff.trim()) {
      console.log(chalk.yellow('No changes remain after applying exclude patterns.'));
      return;
    }
  }

  // Warn if diff exceeds the limit and will be truncated
  if (diff.length > DIFF_LIMIT) {
    console.warn(
      chalk.yellow(
        `Warning: diff is ${(diff.length / 1024).toFixed(0)}KB — only the first ${(DIFF_LIMIT / 1024).toFixed(0)}KB will be analyzed.\n` +
        `Changes at the end of the diff may be missed.\n` +
        `Tip: use --from/--to to generate over a smaller commit range.\n`
      )
    );
  }

  console.log(chalk.dim(`Diff: ${(diff.length / 1024).toFixed(1)}KB — calling OpenAI...\n`));

  const { entries, newTags } = await generateChangelog(
    config.projectContext,
    config.tags,
    diff,
    {
      audience: config.audience || undefined,
      alwaysInclude: config.alwaysInclude,
      model: config.model,
    }
  );

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
      console.log(chalk.dim(`Added new tags to config: ${addedTags.join(', ')}\n`));
    }
  }

  const date = new Date().toISOString().split('T')[0];
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
  console.log(chalk.green(`✓ Generated ${count} changelog ${count === 1 ? 'entry' : 'entries'}:\n`));
  for (const entry of entries) {
    console.log(`  ${chalk.cyan(`[${entry.tags.join(', ')}]`)} ${chalk.bold(entry.title)}`);
  }

  // Refresh suggestion
  const diffPaths = [...diff.matchAll(/^diff --git a\/.* b\/(.+)$/gm)].map((m) => m[1]);
  const hasNewFiles = diffPaths.some((p) => !config.scannedFiles.includes(p));

  if (newCount % 5 === 0 || hasNewFiles) {
    console.log(
      chalk.yellow(
        '\nTip: your codebase has grown since init. Run `changelog refresh` to update your project context.'
      )
    );
  }

  console.log(chalk.dim('\nSaved to database and CHANGELOG.md.'));
  console.log(chalk.bold('\n→ Run `changelog serve` to view your changelog on the web.\n'));
}
