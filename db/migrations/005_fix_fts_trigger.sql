-- Fix FTS5 external content table update trigger.
-- The original trigger used UPDATE which is unsupported for external content FTS5 tables,
-- causing SQLITE_CORRUPT_VTAB errors. The correct pattern is delete + insert.

DROP TRIGGER IF EXISTS posts_au;

CREATE TRIGGER posts_au AFTER UPDATE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
  INSERT INTO posts_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;

-- Rebuild the FTS index to clear any existing corruption.
INSERT INTO posts_fts(posts_fts) VALUES('rebuild');
