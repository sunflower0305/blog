import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCategory,
  createPost,
  deleteCategory,
  deletePost,
  getCategories,
  getPosts,
  getPostsByCategory,
  getPostsCount,
  getPostsCountByCategory,
  getPublicCategories,
  getSetting,
  restorePost,
  searchPosts,
  setSetting,
  updateCategory,
  updatePost,
  updatePostBySlug,
} from "@/lib/db";
import { createTestD1Database, type TestD1Database } from "@/tests/helpers/sqlite-d1";

const databases: TestD1Database[] = [];

function createDatabase(): TestD1Database {
  const database = createTestD1Database();
  databases.push(database);
  return database;
}

function insertPost(
  database: TestD1Database,
  values: {
    slug: string;
    status?: string;
    password?: string | null;
    isHidden?: number;
    deletedAt?: number | null;
    category?: string;
    content?: string;
  },
) {
  database.raw
    .prepare(
      `INSERT INTO posts
       (slug, title, content, html, category, tags, status, password, is_hidden, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      values.slug,
      values.slug,
      values.content ?? "needle content",
      `<p>${values.slug}</p>`,
      values.category ?? "Engineering",
      JSON.stringify([values.slug]),
      values.status ?? "published",
      values.password ?? null,
      values.isHidden ?? 0,
      values.deletedAt ?? null,
    );
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
  vi.restoreAllMocks();
});

describe("repository public visibility contracts", () => {
  it("excludes drafts, encrypted, hidden, and deleted posts from every public listing", async () => {
    const database = createDatabase();
    database.raw
      .prepare("INSERT INTO categories (name, slug) VALUES (?, ?)")
      .run("Engineering", "engineering");

    insertPost(database, { slug: "public" });
    insertPost(database, { slug: "draft", status: "draft" });
    insertPost(database, { slug: "encrypted", password: "secret" });
    insertPost(database, { slug: "hidden", isHidden: 1 });
    insertPost(database, { slug: "deleted", deletedAt: 123 });

    const [posts, count, categoryPosts, categoryCount, categories] = await Promise.all([
      getPosts(database.db),
      getPostsCount(database.db),
      getPostsByCategory(database.db, "Engineering"),
      getPostsCountByCategory(database.db, "Engineering"),
      getPublicCategories(database.db),
    ]);

    expect(posts.map((post) => post.slug)).toEqual(["public"]);
    expect(count).toBe(1);
    expect(categoryPosts.map((post) => post.slug)).toEqual(["public"]);
    expect(categoryCount).toBe(1);
    expect(categories).toEqual([{ name: "Engineering", slug: "engineering", post_count: 1 }]);
  });

  it("returns all post states only when every administrative include flag is enabled", async () => {
    const database = createDatabase();
    insertPost(database, { slug: "public" });
    insertPost(database, { slug: "draft", status: "draft" });
    insertPost(database, { slug: "encrypted", password: "secret" });
    insertPost(database, { slug: "hidden", isHidden: 1 });
    insertPost(database, { slug: "deleted", deletedAt: 123 });

    const posts = await getPosts(database.db, 50, 0, true, true, true, true);
    const count = await getPostsCount(database.db, true, true, true, true);

    expect(new Set(posts.map((post) => post.slug))).toEqual(
      new Set(["public", "draft", "encrypted", "hidden", "deleted"]),
    );
    expect(count).toBe(5);
    expect(posts.find((post) => post.slug === "deleted")?.status).toBe("deleted");
  });
});

describe("searchPosts", () => {
  it("applies the public visibility filters to FTS results", async () => {
    const database = createDatabase();
    insertPost(database, { slug: "public" });
    insertPost(database, { slug: "draft", status: "draft" });
    insertPost(database, { slug: "encrypted", password: "secret" });
    insertPost(database, { slug: "hidden", isHidden: 1 });
    insertPost(database, { slug: "deleted", deletedAt: 123 });

    const posts = await searchPosts(database.db, "needle");

    expect(posts.map((post) => post.slug)).toEqual(["public"]);
  });

  it("falls back to LIKE without weakening visibility filters when FTS is unavailable", async () => {
    const database = createDatabase();
    insertPost(database, { slug: "public" });
    insertPost(database, { slug: "hidden", isHidden: 1 });
    database.raw.exec("DROP TABLE posts_fts");

    const posts = await searchPosts(database.db, "needle");

    expect(posts.map((post) => post.slug)).toEqual(["public"]);
  });
});

describe("post mutation contracts", () => {
  it("creates, updates, and deletes a post while keeping category counts synchronized", async () => {
    const database = createDatabase();
    database.raw.exec(`
      INSERT INTO categories (name, slug) VALUES ('Old', 'old');
      INSERT INTO categories (name, slug) VALUES ('New', 'new');
    `);

    const id = await createPost(database.db, {
      slug: "contract",
      title: "Original",
      content: "Body",
      html: "<p>Body</p>",
      category: "Old",
      tags: ["one"],
    });

    expect(id).toBeGreaterThan(0);
    expect(
      database.raw.prepare("SELECT post_count FROM categories WHERE name = 'Old'").get(),
    ).toEqual(expect.objectContaining({ post_count: 1 }));

    await updatePost(database.db, id, {
      title: "Updated",
      category: "New",
      tags: ["two", "three"],
      is_hidden: 1,
    });

    expect(database.raw.prepare("SELECT * FROM posts WHERE id = ?").get(id)).toEqual(
      expect.objectContaining({
        title: "Updated",
        category: "New",
        tags: '["two","three"]',
        is_hidden: 1,
      }),
    );
    expect(
      database.raw.prepare("SELECT name, post_count FROM categories ORDER BY name").all(),
    ).toEqual([
      expect.objectContaining({ name: "New", post_count: 1 }),
      expect.objectContaining({ name: "Old", post_count: 0 }),
    ]);

    await deletePost(database.db, "contract");

    expect(database.raw.prepare("SELECT id FROM posts WHERE id = ?").get(id)).toBeUndefined();
    expect(
      database.raw.prepare("SELECT post_count FROM categories WHERE name = 'New'").get(),
    ).toEqual(expect.objectContaining({ post_count: 0 }));
  });

  it("handles missing slug updates and restores soft-deleted posts as drafts", async () => {
    const database = createDatabase();
    await expect(updatePostBySlug(database.db, "missing", { title: "Nope" })).rejects.toThrow(
      "文章不存在",
    );

    insertPost(database, { slug: "trashed", status: "published", deletedAt: 123 });
    await restorePost(database.db, "trashed");

    expect(
      database.raw.prepare("SELECT status, deleted_at FROM posts WHERE slug = ?").get("trashed"),
    ).toEqual(expect.objectContaining({ status: "draft", deleted_at: null }));
  });
});

describe("category and setting repositories", () => {
  it("creates, renames, propagates, and deletes categories", async () => {
    const database = createDatabase();
    await createCategory(database.db, "Old", "old");
    await createCategory(database.db, "Old", "old");
    insertPost(database, { slug: "categorized", category: "Old" });

    await updateCategory(database.db, "old", "New", "new");

    expect(await getCategories(database.db)).toEqual([
      expect.objectContaining({ name: "New", slug: "new" }),
    ]);
    expect(
      database.raw.prepare("SELECT category FROM posts WHERE slug = ?").get("categorized"),
    ).toEqual(expect.objectContaining({ category: "New" }));

    await deleteCategory(database.db, "new");
    expect(await getCategories(database.db)).toEqual([]);
  });

  it("returns missing settings as null and replaces existing values", async () => {
    const database = createDatabase();
    expect(await getSetting(database.db, "theme")).toBeNull();

    await setSetting(database.db, "theme", "default");
    await setSetting(database.db, "theme", "terminal");

    expect(await getSetting(database.db, "theme")).toBe("terminal");
  });
});

describe("ensureSchema", () => {
  it("retries after an unexpected migration failure instead of caching a false success", async () => {
    vi.resetModules();
    const { ensureSchema } = await import("@/lib/repositories/schema");
    const databaseError = new Error("database unavailable");
    const run = vi
      .fn()
      .mockRejectedValueOnce(databaseError)
      .mockRejectedValue(new Error("duplicate column name: existing"));
    const prepare = vi.fn(() => ({ run }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = { prepare } as unknown as D1Database;

    await ensureSchema(db);
    await ensureSchema(db);

    expect(prepare).toHaveBeenCalledTimes(6);
    expect(consoleError).toHaveBeenCalledWith("Schema migration failed:", databaseError);
  });
});
