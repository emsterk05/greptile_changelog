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

interface RawEntryRow {
  id: string;
  changelog_id: string;
  title: string;
  description: string;
  details: string;
  position: number;
}

export interface EntryRow extends RawEntryRow {
  tags: string[];
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
      details TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entry_tags (
      entry_id TEXT NOT NULL REFERENCES entries(id),
      tag TEXT NOT NULL,
      PRIMARY KEY (entry_id, tag)
    );

    CREATE INDEX IF NOT EXISTS idx_entry_tags_entry ON entry_tags(entry_id);
    CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag);

    INSERT OR IGNORE INTO state (id, last_commit_hash, generate_count)
    VALUES (1, NULL, 0);
  `);

  // Migrate: add details column if missing
  const entryCols = db.prepare('PRAGMA table_info(entries)').all() as { name: string }[];
  if (!entryCols.some((c) => c.name === 'details')) {
    db.exec("ALTER TABLE entries ADD COLUMN details TEXT NOT NULL DEFAULT ''");
  }

  // Migrate from old schemas that stored tags in the entries table itself
  const cols = db.prepare('PRAGMA table_info(entries)').all() as { name: string }[];
  const hasTagsJson = cols.some((c) => c.name === 'tags');
  const hasTagSingle = cols.some((c) => c.name === 'tag');

  if (hasTagsJson || hasTagSingle) {
    const insertTag = db.prepare(
      'INSERT OR IGNORE INTO entry_tags (entry_id, tag) VALUES (?, ?)'
    );
    if (hasTagsJson) {
      const rows = db
        .prepare("SELECT id, tags FROM entries WHERE tags IS NOT NULL AND tags != '[]'")
        .all() as { id: string; tags: string }[];
      const migrate = db.transaction(() => {
        for (const row of rows) {
          for (const tag of JSON.parse(row.tags) as string[]) {
            insertTag.run(row.id, tag);
          }
        }
      });
      migrate();
    } else {
      const rows = db
        .prepare('SELECT id, tag FROM entries WHERE tag IS NOT NULL')
        .all() as { id: string; tag: string }[];
      const migrate = db.transaction(() => {
        for (const row of rows) {
          insertTag.run(row.id, row.tag);
        }
      });
      migrate();
    }
  }

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
  details: string;
  tags: string[];
}

function loadTagsForEntries(
  db: Database.Database,
  rows: RawEntryRow[]
): EntryRow[] {
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => '?').join(',');
  const ids = rows.map((e) => e.id);
  const tagRows = db
    .prepare(
      `SELECT entry_id, tag FROM entry_tags WHERE entry_id IN (${placeholders}) ORDER BY tag ASC`
    )
    .all(...ids) as { entry_id: string; tag: string }[];

  const tagsByEntry = new Map<string, string[]>();
  for (const { entry_id, tag } of tagRows) {
    if (!tagsByEntry.has(entry_id)) tagsByEntry.set(entry_id, []);
    tagsByEntry.get(entry_id)!.push(tag);
  }

  return rows.map((e) => ({ ...e, tags: tagsByEntry.get(e.id) ?? [] }));
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

  const insertCl = db.prepare(
    'INSERT INTO changelogs (id, date, from_commit, to_commit, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const insertEntry = db.prepare(
    'INSERT INTO entries (id, changelog_id, title, description, details, position) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertTag = db.prepare(
    'INSERT OR IGNORE INTO entry_tags (entry_id, tag) VALUES (?, ?)'
  );

  db.transaction(() => {
    insertCl.run(id, date, fromCommit, toCommit, createdAt);
    for (let i = 0; i < entries.length; i++) {
      const entryId = uuidv4();
      const { title, description, details, tags } = entries[i];
      insertEntry.run(entryId, id, title, description, details ?? '', i);
      for (const tag of tags) {
        insertTag.run(entryId, tag);
      }
    }
  })();

  db.close();
}

export function getRecentChangelogs(
  limit: number,
  cwd: string = process.cwd()
): ChangelogWithEntries[] {
  const db = openDb(cwd);
  const changelogs = db
    .prepare('SELECT * FROM changelogs ORDER BY date DESC, created_at DESC LIMIT ?')
    .all(limit) as ChangelogRow[];

  const getEntries = db.prepare(
    'SELECT * FROM entries WHERE changelog_id = ? ORDER BY position ASC'
  );

  const result = changelogs.map((cl) => ({
    ...cl,
    entries: loadTagsForEntries(db, getEntries.all(cl.id) as RawEntryRow[]),
  }));

  db.close();
  return result;
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
    entries: loadTagsForEntries(db, getEntries.all(cl.id) as RawEntryRow[]),
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

  const rawEntries = db
    .prepare('SELECT * FROM entries WHERE changelog_id = ? ORDER BY position ASC')
    .all(id) as RawEntryRow[];

  const entries = loadTagsForEntries(db, rawEntries);
  db.close();
  return { ...changelog, entries };
}

export function getAllTags(cwd: string = process.cwd()): string[] {
  const db = openDb(cwd);
  const rows = db
    .prepare('SELECT DISTINCT tag FROM entry_tags ORDER BY tag ASC')
    .all() as { tag: string }[];
  db.close();
  return rows.map((r) => r.tag);
}
