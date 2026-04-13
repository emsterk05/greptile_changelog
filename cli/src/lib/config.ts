import fs from 'fs';
import path from 'path';

export interface Config {
  projectContext: string;
  tags: string[];
  scannedFiles: string[];
}

const CONFIG_DIR = '.changelog';
const CONFIG_FILE = 'config.json';

export function getConfigDir(cwd: string = process.cwd()): string {
  return path.join(cwd, CONFIG_DIR);
}

export function getConfigPath(cwd: string = process.cwd()): string {
  return path.join(cwd, CONFIG_DIR, CONFIG_FILE);
}

export function getDbPath(cwd: string = process.cwd()): string {
  return path.join(cwd, CONFIG_DIR, 'state.db');
}

export function configExists(cwd: string = process.cwd()): boolean {
  return fs.existsSync(getConfigPath(cwd));
}

export function readConfig(cwd: string = process.cwd()): Config {
  const configPath = getConfigPath(cwd);
  if (!fs.existsSync(configPath)) {
    throw new Error('Changelog not initialized. Run `changelog init` first.');
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

export function writeConfig(config: Config, cwd: string = process.cwd()): void {
  const configDir = getConfigDir(cwd);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(getConfigPath(cwd), JSON.stringify(config, null, 2));
}
