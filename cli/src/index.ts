#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { generateCommand } from './commands/generate';
import { serveCommand } from './commands/serve';
import { refreshCommand } from './commands/refresh';
import { historyCommand } from './commands/history';
import { configCommand } from './commands/config';

const program = new Command();

program
  .name('changelog')
  .description('AI-powered changelog generator')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize changelog in the current git repo')
  .action(initCommand);

program
  .command('generate')
  .description('Generate changelog entries from git diff')
  .option('--from <ref>', 'Starting git ref (default: last generated commit)')
  .option('--to <ref>', 'Ending git ref (default: HEAD)')
  .action(generateCommand);

program
  .command('refresh')
  .description('Re-scan codebase and update project context')
  .action(refreshCommand);

program
  .command('history')
  .description('Show recent changelog generate runs')
  .option('-n, --count <n>', 'Number of runs to show', '1')
  .action(historyCommand);

program
  .command('config')
  .description('Configure changelog preferences interactively')
  .action(configCommand);

program
  .command('serve')
  .description('Start local changelog website')
  .option('-p, --port <port>', 'Port to run on', '3000')
  .action(serveCommand);

program.parse();
