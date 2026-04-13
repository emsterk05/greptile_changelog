import chalk from 'chalk';
import { configExists } from '../lib/config';
import { getRecentChangelogs } from '../lib/storage';

interface HistoryOptions {
  count: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function historyCommand(options: HistoryOptions): void {
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    console.error(chalk.red('Error: Changelog not initialized. Run `changelog init` first.'));
    process.exit(1);
  }

  const limit = Math.max(1, parseInt(options.count, 10) || 1);
  const changelogs = getRecentChangelogs(limit, cwd);

  if (changelogs.length === 0) {
    console.log(chalk.yellow('No changelog entries yet. Run `changelog generate` to create some.'));
    return;
  }

  const label = limit === 1 ? 'last generate run' : `last ${changelogs.length} generate runs`;
  console.log(chalk.bold(`\nShowing ${label}:\n`));

  for (const cl of changelogs) {
    console.log(
      chalk.bold(`${formatDate(cl.date)}`) +
      chalk.dim(`  ${cl.from_commit.slice(0, 7)} → ${cl.to_commit.slice(0, 7)}`)
    );

    for (const entry of cl.entries) {
      const tags = entry.tags.length > 0 ? chalk.cyan(`[${entry.tags.join(', ')}] `) : '';
      console.log(`  ${tags}${chalk.white(entry.title)}`);
      console.log(chalk.dim(`    ${entry.description}`));
    }

    console.log();
  }
}
