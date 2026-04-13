import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs';
import { spawn, execSync } from 'child_process';
import { getDbPath, getConfigPath, configExists } from '../lib/config';

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
  const configPath = getConfigPath(cwd);
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
    console.log(chalk.blue('    Installing website dependencies (first run only)...\n'));
    execSync('pnpm install', { cwd: websiteDir, stdio: 'inherit' });
  }

  const port = options.port ?? '3000';
  const nextBin = path.join(websiteDir, 'node_modules', '.bin', 'next');

  const spinner = ora({ text: 'Starting changelog website', spinner: 'dots', indent: 4 }).start();

  const proc = spawn(nextBin, ['dev', '-p', port], {
    cwd: websiteDir,
    env: {
      ...process.env,
      DB_PATH: dbPath,
      CONFIG_PATH: configPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.on('error', (err) => {
    spinner.fail(`Failed to start website: ${err.message}`);
    process.exit(1);
  });

  // Wait for Next.js to signal it's ready, then print our own message
  let ready = false;
  const onData = (data: Buffer) => {
    if (!ready && data.toString().includes('Ready')) {
      ready = true;
      spinner.succeed('Changelog website is ready at');
      console.log(chalk.bold(`\n        http://localhost:${port}\n`));
      console.log(chalk.dim('    Press Ctrl+C to stop.\n'));
    }
  };
  proc.stdout?.on('data', onData);
  proc.stderr?.on('data', onData);

  // Clean exit: forward signals to the child and wait for it to die
  const cleanup = (signal: NodeJS.Signals) => {
    if (ready) {
      console.log(chalk.dim('\n    Shutting down...'));
    }
    proc.kill(signal);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  await new Promise<void>((resolve) => {
    proc.on('close', (code) => {
      process.off('SIGINT', cleanup);
      process.off('SIGTERM', cleanup);
      resolve();
      process.exit(code ?? 0);
    });
  });
}
