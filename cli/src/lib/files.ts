import fs from 'fs';
import path from 'path';
import { ChangelogEntry } from './openai';

export interface ChangelogData {
  id: string;
  date: string;
  from_commit: string;
  to_commit: string;
  entries: ChangelogEntry[];
}

export function appendToChangelogMd(data: ChangelogData, cwd: string = process.cwd()): void {
  const changelogPath = path.join(cwd, 'CHANGELOG.md');

  let existing = '';
  if (fs.existsSync(changelogPath)) {
    existing = fs.readFileSync(changelogPath, 'utf-8');
  }

  const newSection = formatMarkdownSection(data);

  if (existing.startsWith('# Changelog')) {
    const afterHeader = existing.slice('# Changelog\n'.length).trimStart();
    const separator = afterHeader ? '\n\n' : '';
    fs.writeFileSync(changelogPath, `# Changelog\n\n${newSection}${separator}${afterHeader}`);
  } else {
    fs.writeFileSync(changelogPath, `# Changelog\n\n${newSection}\n`);
  }
}

function formatMarkdownSection(data: ChangelogData): string {
  const lines: string[] = [`## ${data.date}`, ''];
  for (const entry of data.entries) {
    lines.push(`### ${entry.title}`);
    lines.push(`**${entry.tag}**`);
    lines.push('');
    lines.push(entry.description);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

const EXCLUDE_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.next', '.turbo',
  'coverage', '__pycache__', '.pytest_cache', 'venv', '.venv', 'vendor',
  '.changelog', 'changelogs',
]);

const EXCLUDE_EXTENSIONS = new Set([
  '.lock', '.log', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.tar', '.gz',
  '.db', '.sqlite', '.map', '.min.js', '.min.css',
]);

const PRIORITY_NAMES = new Set([
  'README.md', 'readme.md', 'index.ts', 'index.js', 'main.ts', 'main.js',
  'app.ts', 'app.js', 'server.ts', 'server.js',
]);

export function shouldIncludeFile(filePath: string): boolean {
  const parts = filePath.split('/');
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return false;

  const ext = path.extname(filePath).toLowerCase();
  if (EXCLUDE_EXTENSIONS.has(ext)) return false;

  if (
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('__tests__') ||
    filePath.includes('/test/') ||
    filePath.includes('/tests/') ||
    filePath.includes('/fixtures/')
  ) {
    return false;
  }

  return true;
}

export function prioritizeFiles(files: string[]): string[] {
  const priority = files.filter((f) => PRIORITY_NAMES.has(path.basename(f)));
  const rest = files.filter((f) => !PRIORITY_NAMES.has(path.basename(f)));
  return [...priority, ...rest];
}
