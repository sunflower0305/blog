import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRoute, readJsonBody } from "@/lib/server/route-helpers";

export interface CommonActionBody {
  action_key?: string;
  label?: string;
  description?: string;
  prompt?: string;
  profile_id?: number;
  sort_order?: number;
  is_enabled?: number;
}

export type SqlValue = string | number | null;

export async function initializeActionRoute(
  req: NextRequest,
  initialize: (db: D1Database, env: Partial<CloudflareEnv>) => Promise<void>,
) {
  const route = await getAuthenticatedRoute(req);
  if (!route.ok) return route;
  await initialize(route.db, route.env);
  return route;
}

function validateRequiredActionFields(body: CommonActionBody) {
  return Boolean(body.action_key && body.label && body.description && body.prompt);
}

export async function readValidActionBody<T extends CommonActionBody>(req: NextRequest) {
  const parsed = await readJsonBody<T>(req);
  if (!parsed.ok) return parsed;
  return validateRequiredActionFields(parsed.body)
    ? parsed
    : {
        ok: false as const,
        response: NextResponse.json({ error: "缺少必填字段" }, { status: 400 }),
      };
}

async function resolveActionProfileId(
  db: D1Database,
  requestedId: number | undefined,
  ensureDefaultId: (db: D1Database) => Promise<number | null>,
) {
  return Number.isFinite(requestedId) && Number(requestedId) > 0
    ? Number(requestedId)
    : await ensureDefaultId(db);
}

async function resolveActionSortOrder(
  db: D1Database,
  table: string,
  requestedOrder: number | undefined,
) {
  if (requestedOrder !== undefined) return requestedOrder;
  const row = await db
    .prepare(`SELECT MAX(sort_order) as max_sort FROM ${table}`)
    .first<{ max_sort: number | null }>();
  return (row?.max_sort ?? 0) + 10;
}

async function prepareActionCreate(
  db: D1Database,
  table: string,
  body: CommonActionBody,
  ensureDefaultId: (db: D1Database) => Promise<number | null>,
) {
  return {
    profileId: await resolveActionProfileId(db, body.profile_id, ensureDefaultId),
    sortOrder: await resolveActionSortOrder(db, table, body.sort_order),
  };
}

export async function createAction(options: {
  db: D1Database;
  table: string;
  body: CommonActionBody;
  ensureDefaultId: (db: D1Database) => Promise<number | null>;
  extraColumns: string[];
  extraValues: SqlValue[];
}) {
  const { profileId, sortOrder } = await prepareActionCreate(
    options.db,
    options.table,
    options.body,
    options.ensureDefaultId,
  );
  const columns = [
    "action_key",
    "label",
    "description",
    "prompt",
    ...options.extraColumns,
    "profile_id",
    "sort_order",
    "is_builtin",
  ];
  const values = [
    options.body.action_key!,
    options.body.label!,
    options.body.description!,
    options.body.prompt!,
    ...options.extraValues,
    profileId,
    sortOrder,
    0,
  ];
  const placeholders = columns.map(() => "?").join(", ");
  const duplicate = await runActionWrite(
    options.db,
    options.table,
    `INSERT INTO ${options.table} (${columns.join(", ")}) VALUES (${placeholders})`,
    values,
  );
  return duplicate ?? NextResponse.json({ success: true });
}

async function runActionWrite(db: D1Database, table: string, sql: string, values: SqlValue[]) {
  try {
    await db
      .prepare(sql)
      .bind(...values)
      .run();
  } catch (error) {
    const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (
      error instanceof Error &&
      new RegExp(`UNIQUE constraint failed: ${escapedTable}\\.action_key`, "i").test(error.message)
    ) {
      return NextResponse.json({ error: "操作标识已存在" }, { status: 409 });
    }
    throw error;
  }
  return null;
}

async function reorderActions(
  db: D1Database,
  table: string,
  items: Array<{ id: number; sort_order: number }> | undefined,
) {
  if (!items?.length) {
    return NextResponse.json({ error: "缺少排序数据" }, { status: 400 });
  }
  for (const item of items) {
    await db
      .prepare(
        `UPDATE ${table} SET sort_order = ?, updated_at = strftime('%s', 'now') WHERE id = ?`,
      )
      .bind(item.sort_order, item.id)
      .run();
  }
  return NextResponse.json({ success: true });
}

export async function handleActionReorder(req: NextRequest, db: D1Database, table: string) {
  const parsed = await readJsonBody<{ items?: Array<{ id: number; sort_order: number }> }>(req);
  return parsed.ok ? reorderActions(db, table, parsed.body.items) : parsed.response;
}

export function appendCommonActionUpdates(
  body: CommonActionBody,
  sets: string[],
  values: SqlValue[],
) {
  for (const key of ["action_key", "label", "description", "prompt"] as const) {
    if (body[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(body[key]);
    }
  }
  if (body.is_enabled !== undefined) {
    sets.push("is_enabled = ?");
    values.push(body.is_enabled);
  }
}

export async function appendProfileUpdate(
  db: D1Database,
  requestedId: number | undefined,
  ensureDefaultId: (db: D1Database) => Promise<number | null>,
  sets: string[],
  values: SqlValue[],
) {
  if (requestedId === undefined) return;
  sets.push("profile_id = ?");
  values.push(await resolveActionProfileId(db, requestedId, ensureDefaultId));
}

export async function finishActionUpdate(
  db: D1Database,
  table: string,
  id: number,
  sets: string[],
  values: SqlValue[],
) {
  sets.push("updated_at = strftime('%s', 'now')");
  values.push(id);
  const duplicate = await runActionWrite(
    db,
    table,
    `UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`,
    values,
  );
  return duplicate ?? NextResponse.json({ success: true });
}

async function deleteAction(db: D1Database, table: string, id: number) {
  const row = await db
    .prepare(`SELECT id FROM ${table} WHERE id = ?`)
    .bind(id)
    .first<{ id: number }>();
  if (!row?.id) return NextResponse.json({ error: "操作不存在" }, { status: 404 });
  await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
  return NextResponse.json({ success: true });
}

export async function handleActionDelete(
  req: NextRequest,
  params: Promise<{ id: string }>,
  table: string,
  initialize: (
    req: NextRequest,
  ) => Promise<{ ok: false; response: NextResponse } | { ok: true; db: D1Database }>,
) {
  const route = await initialize(req);
  return route.ok ? deleteAction(route.db, table, Number((await params).id)) : route.response;
}
