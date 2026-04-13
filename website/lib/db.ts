import fs from 'fs';
import path from 'path';

export interface EntryRow {
  id: string;
  changelog_id: string;
  title: string;
  description: string;
  details: string;
  position: number;
  tags: string[];
}

export interface ChangelogWithEntries {
  id: string;
  date: string;
  from_commit: string;
  to_commit: string;
  created_at: string;
  entries: EntryRow[];
}

export interface EntryWithChangelog extends EntryRow {
  date: string;
  from_commit: string;
  to_commit: string;
}

export interface EntryDetailResult {
  entry: EntryWithChangelog;
  siblingEntries: EntryRow[];
}

function dataDir(): string {
  return path.join(process.cwd(), 'data');
}

function loadChangelogs(): ChangelogWithEntries[] {
  const filePath = path.join(dataDir(), 'changelogs.json');
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function loadConfig(): { productName?: string; tags?: string[] } {
  const filePath = path.join(dataDir(), 'config.json');
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

export function getAllChangelogs(): ChangelogWithEntries[] {
  const changelogs = loadChangelogs();
  return changelogs.sort((a, b) => b.date.localeCompare(a.date));
}

export function getChangelogById(id: string): ChangelogWithEntries | null {
  const changelogs = loadChangelogs();
  return changelogs.find((cl) => cl.id === id) ?? null;
}

export function getAllTags(): string[] {
  const changelogs = loadChangelogs();
  const tagSet = new Set<string>();
  for (const cl of changelogs) {
    for (const entry of cl.entries) {
      for (const tag of entry.tags) {
        tagSet.add(tag);
      }
    }
  }
  return [...tagSet].sort();
}

export function getEntryById(entryId: string): EntryDetailResult | null {
  const changelogs = loadChangelogs();

  for (const cl of changelogs) {
    const entry = cl.entries.find((e) => e.id === entryId);
    if (!entry) continue;

    const currentIdx = cl.entries.findIndex((e) => e.id === entryId);
    const rotated = [
      ...cl.entries.slice(currentIdx + 1),
      ...cl.entries.slice(0, currentIdx),
    ];

    return {
      entry: {
        ...entry,
        date: cl.date,
        from_commit: cl.from_commit,
        to_commit: cl.to_commit,
      },
      siblingEntries: rotated,
    };
  }

  return null;
}

export function getProductName(): string {
  const config = loadConfig();
  return config.productName || 'Changelog';
}
