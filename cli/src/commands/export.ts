import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { configExists, readConfig } from '../lib/config';
import { initDb, getAllChangelogs } from '../lib/storage';

interface ExportOptions {
  out: string;
}

export async function exportCommand(options: ExportOptions): Promise<void> {
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    console.error(chalk.red('Error: Changelog not initialized. Run `changelog init` first.'));
    process.exit(1);
  }

  initDb(cwd);

  const changelogs = getAllChangelogs(cwd);
  const config = readConfig(cwd);

  const outDir = path.resolve(options.out);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Write changelogs.json
  fs.writeFileSync(
    path.join(outDir, 'changelogs.json'),
    JSON.stringify(changelogs, null, 2)
  );

  // Write config.json with productName
  fs.writeFileSync(
    path.join(outDir, 'config.json'),
    JSON.stringify({ productName: config.productName || 'Changelog' }, null, 2)
  );

  console.log(chalk.green(`    Exported ${changelogs.length} changelogs to ${outDir}/`));
  console.log(chalk.dim('    Copy this directory to website/data/ for Vercel deployment.'));
}
