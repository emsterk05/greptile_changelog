import Database from 'better-sqlite3';
import fs from 'fs';

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

function getDbPath(): string {
  const p = process.env.DB_PATH;
  if (!p) throw new Error('DB_PATH environment variable is not set.');
  return p;
}

function openDb(): Database.Database {
  return new Database(getDbPath(), { readonly: true });
}

function loadTagsForEntries(db: Database.Database, rows: RawEntryRow[]): EntryRow[] {
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

export function getAllChangelogs(tag?: string): ChangelogWithEntries[] {
  const db = openDb();

  const changelogs = db
    .prepare('SELECT * FROM changelogs ORDER BY date DESC, created_at DESC')
    .all() as ChangelogRow[];

  const getEntries = tag
    ? db.prepare(
        `SELECT e.* FROM entries e
         JOIN entry_tags et ON et.entry_id = e.id AND et.tag = ?
         WHERE e.changelog_id = ?
         ORDER BY e.position ASC`
      )
    : db.prepare('SELECT * FROM entries WHERE changelog_id = ? ORDER BY position ASC');

  const result: ChangelogWithEntries[] = [];
  for (const cl of changelogs) {
    const rawEntries = (
      tag ? getEntries.all(tag, cl.id) : getEntries.all(cl.id)
    ) as RawEntryRow[];

    if (rawEntries.length > 0) {
      result.push({ ...cl, entries: loadTagsForEntries(db, rawEntries) });
    }
  }

  db.close();
  return result;
}

export function getChangelogById(id: string): ChangelogWithEntries | null {
  const db = openDb();

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

export function getAllTags(): string[] {
  const db = openDb();
  const rows = db
    .prepare('SELECT DISTINCT tag FROM entry_tags ORDER BY tag ASC')
    .all() as { tag: string }[];
  db.close();
  return rows.map((r) => r.tag);
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

export function getEntryById(entryId: string): EntryDetailResult | null {
  const db = openDb();

  const raw = db
    .prepare(
      `SELECT e.*, c.date, c.from_commit, c.to_commit
       FROM entries e
       JOIN changelogs c ON c.id = e.changelog_id
       WHERE e.id = ?`
    )
    .get(entryId) as (RawEntryRow & { date: string; from_commit: string; to_commit: string }) | undefined;

  if (!raw) {
    db.close();
    return null;
  }

  const [entry] = loadTagsForEntries(db, [raw]);

  // Fetch sibling entries from the same changelog, rotated so the next entry after
  // the current one comes first (e.g. viewing entry 2 of [1,2,3,4,5] → [3,4,5,1])
  const allSiblingsRaw = db
    .prepare('SELECT * FROM entries WHERE changelog_id = ? ORDER BY position ASC')
    .all(raw.changelog_id) as RawEntryRow[];
  const currentIdx = allSiblingsRaw.findIndex((e) => e.id === entryId);
  const rotated = [
    ...allSiblingsRaw.slice(currentIdx + 1),
    ...allSiblingsRaw.slice(0, currentIdx),
  ];
  const siblingEntries = loadTagsForEntries(db, rotated);

  db.close();
  return {
    entry: { ...entry, date: raw.date, from_commit: raw.from_commit, to_commit: raw.to_commit },
    siblingEntries,
  };
}

export function getProductName(): string {
  const configPath = process.env.CONFIG_PATH;
  if (!configPath || !fs.existsSync(configPath)) return 'Changelog';
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.productName || 'Changelog';
  } catch {
    return 'Changelog';
  }
}
