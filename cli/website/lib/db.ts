import Database from 'better-sqlite3';

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

function getDbPath(): string {
  const p = process.env.DB_PATH;
  if (!p) throw new Error('DB_PATH environment variable is not set.');
  return p;
}

function openDb(): Database.Database {
  return new Database(getDbPath(), { readonly: true });
}

export function getAllChangelogs(tag?: string): ChangelogWithEntries[] {
  const db = openDb();

  const changelogs = db
    .prepare('SELECT * FROM changelogs ORDER BY date DESC, created_at DESC')
    .all() as ChangelogRow[];

  const result: ChangelogWithEntries[] = [];

  for (const cl of changelogs) {
    const entries = (
      tag
        ? db
            .prepare(
              'SELECT * FROM entries WHERE changelog_id = ? AND tag = ? ORDER BY position ASC'
            )
            .all(cl.id, tag)
        : db
            .prepare('SELECT * FROM entries WHERE changelog_id = ? ORDER BY position ASC')
            .all(cl.id)
    ) as EntryRow[];

    if (entries.length > 0) {
      result.push({ ...cl, entries });
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

  const entries = db
    .prepare('SELECT * FROM entries WHERE changelog_id = ? ORDER BY position ASC')
    .all(id) as EntryRow[];

  db.close();
  return { ...changelog, entries };
}

export function getAllTags(): string[] {
  const db = openDb();
  const rows = db
    .prepare('SELECT DISTINCT tag FROM entries ORDER BY tag ASC')
    .all() as { tag: string }[];
  db.close();
  return rows.map((r) => r.tag);
}
