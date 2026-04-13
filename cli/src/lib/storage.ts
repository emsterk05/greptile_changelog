import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { getDbPath } from './config';

export interface DbState {
  last_commit_hash: string | null;
  generate_count: number;
}

export interface ChangelogRow {
  id: string;
  date: string;
  from_commit: string;
  to_commit: string;
  created_at: string;
}

export interface EntryRow {
  id: string;
  changelog_id: string;
  title: string;
  description: string;
  tag: string;
  position: number;
}

export interface ChangelogWithEntries extends ChangelogRow {
  entries: EntryRow[];
}

function openDb(cwd: string = process.cwd()): Database.Database {
  return new Database(getDbPath(cwd));
}

export function initDb(cwd: string = process.cwd()): void {
  const db = openDb(cwd);
  db.exec(`
    CREATE TABLE IF NOT EXISTS state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      last_commit_hash TEXT,
      generate_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS changelogs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      from_commit TEXT NOT NULL,
      to_commit TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      changelog_id TEXT NOT NULL REFERENCES changelogs(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      tag TEXT NOT NULL,
      position INTEGER NOT NULL
    );

    INSERT OR IGNORE INTO state (id, last_commit_hash, generate_count)
    VALUES (1, NULL, 0);
  `);
  db.close();
}

export function readState(cwd: string = process.cwd()): DbState {
  const db = openDb(cwd);
  const row = db
    .prepare('SELECT last_commit_hash, generate_count FROM state WHERE id = 1')
    .get() as DbState;
  db.close();
  return row;
}

export function updateState(
  lastCommitHash: string,
  generateCount: number,
  cwd: string = process.cwd()
): void {
  const db = openDb(cwd);
  db.prepare(
    'UPDATE state SET last_commit_hash = ?, generate_count = ? WHERE id = 1'
  ).run(lastCommitHash, generateCount);
  db.close();
}

export interface ChangelogEntry {
  title: string;
  description: string;
  tag: string;
}

export function insertChangelog(
  id: string,
  date: string,
  fromCommit: string,
  toCommit: string,
  entries: ChangelogEntry[],
  cwd: string = process.cwd()
): void {
  const db = openDb(cwd);
  const createdAt = new Date().toISOString();

  const insertChangelog = db.prepare(
    'INSERT INTO changelogs (id, date, from_commit, to_commit, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const insertEntry = db.prepare(
    'INSERT INTO entries (id, changelog_id, title, description, tag, position) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const run = db.transaction(() => {
    insertChangelog.run(id, date, fromCommit, toCommit, createdAt);
    entries.forEach((entry, i) => {
      insertEntry.run(uuidv4(), id, entry.title, entry.description, entry.tag, i);
    });
  });

  run();
  db.close();
}

export function getAllChangelogs(cwd: string = process.cwd()): ChangelogWithEntries[] {
  const db = openDb(cwd);
  const changelogs = db
    .prepare('SELECT * FROM changelogs ORDER BY date DESC, created_at DESC')
    .all() as ChangelogRow[];

  const getEntries = db.prepare(
    'SELECT * FROM entries WHERE changelog_id = ? ORDER BY position ASC'
  );

  const result = changelogs.map((cl) => ({
    ...cl,
    entries: getEntries.all(cl.id) as EntryRow[],
  }));

  db.close();
  return result;
}

export function getChangelogById(
  id: string,
  cwd: string = process.cwd()
): ChangelogWithEntries | null {
  const db = openDb(cwd);
  const changelog = db
    .prepare('SELECT * FROM changelogs WHERE id = ?')
    .get(id) as ChangelogRow | undefined;

  if (!changelog) {
    db.close();
    return null;
  }

  const entries = db
    .prepare('SELECT * FROM entries WHERE changelog_id = ? ORDER BY position ASC')
    .all(id) as EntryRow[];

  db.close();
  return { ...changelog, entries };
}

export function getAllTags(cwd: string = process.cwd()): string[] {
  const db = openDb(cwd);
  const rows = db
    .prepare('SELECT DISTINCT tag FROM entries ORDER BY tag ASC')
    .all() as { tag: string }[];
  db.close();
  return rows.map((r) => r.tag);
}
