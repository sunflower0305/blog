import { DatabaseSync, type SQLInputValue } from "node:sqlite";

interface D1RunMeta {
  changes: number;
  last_row_id: number;
}

export interface TestD1Database {
  db: D1Database;
  raw: DatabaseSync;
  close: () => void;
}

function normalizeValue(value: unknown): SQLInputValue {
  if (typeof value === "boolean") return value ? 1 : 0;
  return value as SQLInputValue;
}

export function createTestD1Database(): TestD1Database {
  const raw = new DatabaseSync(":memory:");
  raw.exec(`
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      html TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT '未分类',
      tags TEXT,
      status TEXT DEFAULT 'published',
      password TEXT,
      is_pinned INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      cover_image TEXT,
      deleted_at INTEGER,
      published_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      view_count INTEGER DEFAULT 0
    );

    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      post_count INTEGER DEFAULT 0
    );

    CREATE TABLE site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE posts_fts USING fts5(
      title,
      content,
      content=posts,
      content_rowid=id,
      tokenize='unicode61'
    );

    CREATE TRIGGER posts_ai AFTER INSERT ON posts BEGIN
      INSERT INTO posts_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;

    CREATE TRIGGER posts_au AFTER UPDATE ON posts BEGIN
      INSERT INTO posts_fts(posts_fts, rowid, title, content)
      VALUES ('delete', old.id, old.title, old.content);
      INSERT INTO posts_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;

    CREATE TRIGGER posts_ad AFTER DELETE ON posts BEGIN
      INSERT INTO posts_fts(posts_fts, rowid, title, content)
      VALUES ('delete', old.id, old.title, old.content);
    END;
  `);

  const db = {
    prepare(sql: string) {
      const statement = raw.prepare(sql);
      let values: SQLInputValue[] = [];

      const prepared = {
        bind(...args: unknown[]) {
          values = args.map(normalizeValue);
          return prepared;
        },
        async all<T>() {
          return { results: statement.all(...values) as T[] };
        },
        async first<T>() {
          return (statement.get(...values) as T | undefined) ?? null;
        },
        async run() {
          const result = statement.run(...values);
          return {
            success: true,
            meta: {
              changes: Number(result.changes),
              last_row_id: Number(result.lastInsertRowid),
            } satisfies D1RunMeta,
          };
        },
      };

      return prepared;
    },
  } as unknown as D1Database;

  return { db, raw, close: () => raw.close() };
}
