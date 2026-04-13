import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { spawn, execSync } from 'child_process';
import { getDbPath, configExists } from '../lib/config';

interface ServeOptions {
  port: string;
}

export async function serveCommand(options: ServeOptions): Promise<void> {
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    console.error(chalk.red('Error: Changelog not initialized. Run `changelog init` first.'));
    process.exit(1);
  }

  const dbPath = getDbPath(cwd);
  if (!fs.existsSync(dbPath)) {
    console.error(chalk.red('Error: Database not found. Run `changelog init` first.'));
    process.exit(1);
  }

  // Website lives alongside the compiled CLI output
  // dist/commands/serve.js → ../../website
  const websiteDir = path.join(__dirname, '../../website');

  if (!fs.existsSync(websiteDir)) {
    console.error(chalk.red(`Error: Website directory not found at ${websiteDir}`));
    console.error(chalk.dim('Make sure the CLI was built correctly with `pnpm build`.'));
    process.exit(1);
  }

  // Install website deps on first run
  if (!fs.existsSync(path.join(websiteDir, 'node_modules'))) {
    console.log(chalk.blue('Installing website dependencies (first run only)...\n'));
    execSync('pnpm install', { cwd: websiteDir, stdio: 'inherit' });
  }

  const port = options.port ?? '3000';
  const nextBin = path.join(websiteDir, 'node_modules', '.bin', 'next');

  console.log(chalk.green(`\nStarting changelog website → http://localhost:${port}\n`));
  console.log(chalk.dim(`Database: ${dbPath}\n`));

  const proc = spawn(nextBin, ['dev', '-p', port], {
    cwd: websiteDir,
    env: {
      ...process.env,
      DB_PATH: dbPath,
    },
    stdio: 'inherit',
  });

  proc.on('error', (err) => {
    console.error(chalk.red(`Failed to start website: ${err.message}`));
    process.exit(1);
  });
}
