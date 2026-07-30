import { NextRequest, NextResponse } from "next/server";
import { normalizeBaseUrl } from "@/lib/ai-provider-profiles";
import { getAuthenticatedRoute, readJsonBody } from "@/lib/server/route-helpers";

export interface SaveProviderProfileBody {
  id?: number;
  name?: string;
  provider?: string;
  provider_name?: string;
  provider_type?: string;
  provider_category?: string;
  api_key_url?: string;
  base_url?: string;
  model?: string;
  api_key?: string;
  is_default?: boolean;
}

export interface ProviderProfilePayload {
  name: string;
  provider: string;
  provider_name: string;
  provider_type: string;
  provider_category: string;
  api_key_url: string;
  base_url: string;
  model: string;
}

export async function initializeProviderProfileRoute(
  req: NextRequest,
  initialize: (
    db: D1Database,
    env: Partial<CloudflareEnv>,
    secret: string,
  ) => Promise<void>,
  resolveSecret: (env: Partial<CloudflareEnv>) => string,
) {
  const route = await getAuthenticatedRoute(req);
  if (!route.ok) return route;
  const secret = resolveSecret(route.env);
  await initialize(route.db, route.env, secret);
  return { ...route, secret };
}

export async function handleProviderProfileList<T>(
  req: NextRequest,
  initialize: (req: NextRequest) => Promise<
    | { ok: false; response: NextResponse }
    | { ok: true; db: D1Database }
  >,
  list: (db: D1Database) => Promise<{ profiles: T[]; defaultProfileId: number | null }>,
) {
  const route = await initialize(req);
  if (!route.ok) return route.response;
  const result = await list(route.db);
  return NextResponse.json({
    profiles: result.profiles,
    default_profile_id: result.defaultProfileId,
  });
}

export function buildProviderProfilePayload(
  body: SaveProviderProfileBody,
  defaultProviderType: string,
): ProviderProfilePayload | { error: string } {
  const name = (body.name || "").trim();
  const model = (body.model || "").trim();
  const baseUrl = normalizeBaseUrl(body.base_url || "");
  if (!name) return { error: "配置名称不能为空" };
  if (!baseUrl) return { error: "Base URL 不能为空" };
  if (!model) return { error: "模型名称不能为空" };
  return {
    name,
    provider: (body.provider || "custom").trim() || "custom",
    provider_name: (body.provider_name || "").trim(),
    provider_type: (body.provider_type || defaultProviderType).trim() || defaultProviderType,
    provider_category: (body.provider_category || "").trim(),
    api_key_url: (body.api_key_url || "").trim(),
    base_url: baseUrl,
    model,
  };
}

export function invalidProfileIdResponse(id: number) {
  return Number.isFinite(id) && id > 0
    ? null
    : NextResponse.json({ error: "缺少有效的配置 ID" }, { status: 400 });
}

export async function readProviderProfileBody<
  TBody extends SaveProviderProfileBody,
  TPayload extends object,
>(
  req: NextRequest,
  build: (body: TBody) => TPayload | { error: string },
): Promise<
  | { ok: true; body: TBody; payload: TPayload }
  | { ok: false; response: NextResponse }
> {
  const parsed = await readJsonBody<TBody>(req);
  if (!parsed.ok) return parsed;
  const payload = build(parsed.body);
  if ("error" in payload && typeof payload.error === "string") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: payload.error }, { status: 400 }),
    };
  }
  return { ok: true, body: parsed.body, payload: payload as TPayload };
}

export async function prepareProviderProfileRequest<
  TBody extends SaveProviderProfileBody,
  TPayload extends object,
>(
  req: NextRequest,
  initialize: (
    db: D1Database,
    env: Partial<CloudflareEnv>,
    secret: string,
  ) => Promise<void>,
  resolveSecret: (env: Partial<CloudflareEnv>) => string,
  build: (body: TBody) => TPayload | { error: string },
) {
  const route = await initializeProviderProfileRoute(req, initialize, resolveSecret);
  if (!route.ok) return route;
  const parsed = await readProviderProfileBody<TBody, TPayload>(req, build);
  return parsed.ok ? { ...route, ...parsed } : parsed;
}

export async function prepareProviderProfileUpdateRequest<
  TBody extends SaveProviderProfileBody,
  TPayload extends object,
>(
  req: NextRequest,
  table: string,
  initialize: (
    db: D1Database,
    env: Partial<CloudflareEnv>,
    secret: string,
  ) => Promise<void>,
  resolveSecret: (env: Partial<CloudflareEnv>) => string,
  build: (body: TBody) => TPayload | { error: string },
) {
  const prepared = await prepareProviderProfileRequest(
    req,
    initialize,
    resolveSecret,
    build,
  );
  if (!prepared.ok) return prepared;
  const id = Number(prepared.body.id);
  const loaded = await loadExistingProviderProfile(prepared.db, table, id);
  return loaded.ok
    ? { ...prepared, id, existing: loaded.profile }
    : { ok: false as const, response: loaded.response };
}

export async function prepareProviderProfileCreateRequest<
  TBody extends SaveProviderProfileBody,
  TPayload extends object,
>(
  req: NextRequest,
  initialize: (
    db: D1Database,
    env: Partial<CloudflareEnv>,
    secret: string,
  ) => Promise<void>,
  resolveSecret: (env: Partial<CloudflareEnv>) => string,
  build: (body: TBody) => TPayload | { error: string },
  encrypt: (rawKey: string, secret: string) => Promise<{ encrypted: string; masked: string }>,
) {
  const prepared = await prepareProviderProfileRequest(
    req,
    initialize,
    resolveSecret,
    build,
  );
  if (!prepared.ok) return prepared;
  const key = await encrypt((prepared.body.api_key || "").trim(), prepared.secret);
  return { ...prepared, ...key };
}

export async function readProviderProfileId(req: NextRequest) {
  const parsed = await readJsonBody<{ id?: number }>(req);
  if (!parsed.ok) return parsed;
  const id = Number(parsed.body.id);
  const response = invalidProfileIdResponse(id);
  return response ? { ok: false as const, response } : { ok: true as const, id };
}

export async function initializeAndReadProviderProfileId(
  req: NextRequest,
  initialize: (
    db: D1Database,
    env: Partial<CloudflareEnv>,
    secret: string,
  ) => Promise<void>,
  resolveSecret: (env: Partial<CloudflareEnv>) => string,
) {
  const route = await initializeProviderProfileRoute(req, initialize, resolveSecret);
  if (!route.ok) return route;
  const parsed = await readProviderProfileId(req);
  return parsed.ok ? { ...route, id: parsed.id } : parsed;
}

export async function loadExistingProviderProfile(
  db: D1Database,
  table: string,
  id: number,
) {
  const invalid = invalidProfileIdResponse(id);
  if (invalid) return { ok: false as const, response: invalid };
  const profile = await loadProviderProfileRow<{
    id: number;
    api_key_masked: string;
    is_default: number;
  }>(db, `SELECT id, api_key_masked, is_default FROM ${table} WHERE id = ?`, id);
  return profile
    ? { ok: true as const, profile }
    : {
        ok: false as const,
        response: NextResponse.json({ error: "配置不存在" }, { status: 404 }),
      };
}

export function findDefaultProfileId<T extends { id: number; is_default: number }>(profiles: T[]) {
  return profiles.find((profile) => profile.is_default === 1)?.id ?? null;
}

export function resolveNextProfileDefault(
  requested: boolean | undefined,
  current: number,
) {
  return requested === true ? 1 : requested === false ? 0 : current;
}

export async function loadProviderProfileRow<T>(db: D1Database, sql: string, id: number) {
  return db.prepare(sql).bind(id).first<T>();
}

export function providerProfileSuccess<T>(row: T | null, map: (value: T) => unknown = (v) => v) {
  return NextResponse.json({ success: true, profile: row ? map(row) : null });
}

export async function finishProviderProfileWrite<T>(options: {
  db: D1Database;
  id: number;
  actionTable: string;
  ensureDefaultId: (db: D1Database) => Promise<number | null>;
  selectSql: string;
  map?: (row: T) => unknown;
}) {
  await backfillActionProfiles(
    options.db,
    options.actionTable,
    await options.ensureDefaultId(options.db),
  );
  const row = await loadProviderProfileRow<T>(options.db, options.selectSql, options.id);
  return providerProfileSuccess(row, options.map);
}

export async function createProviderProfile<T>(options: {
  insert: Parameters<typeof insertProviderProfile>[0];
  actionTable: string;
  ensureDefaultId: (db: D1Database) => Promise<number | null>;
  selectSql: string;
  map?: (row: T) => unknown;
}) {
  const id = await insertProviderProfile(options.insert);
  return finishProviderProfileWrite<T>({
    db: options.insert.db,
    id,
    actionTable: options.actionTable,
    ensureDefaultId: options.ensureDefaultId,
    selectSql: options.selectSql,
    map: options.map,
  });
}

export async function clearDefaultProfile(db: D1Database, table: string, shouldClear: boolean) {
  if (shouldClear) await db.prepare(`UPDATE ${table} SET is_default = 0`).run();
}

export async function insertProviderProfile(options: {
  db: D1Database;
  table: string;
  body: SaveProviderProfileBody;
  payload: ProviderProfilePayload;
  extraColumns?: string[];
  extraValues?: Array<string | number>;
  encrypted: string;
  masked: string;
}) {
  await clearDefaultProfile(options.db, options.table, options.body.is_default === true);
  const columns = [
    "name",
    "provider",
    "provider_name",
    "provider_type",
    "provider_category",
    "api_key_url",
    "base_url",
    "model",
    ...(options.extraColumns ?? []),
    "api_key_encrypted",
    "api_key_masked",
    "is_default",
  ];
  const values = [
    options.payload.name,
    options.payload.provider,
    options.payload.provider_name,
    options.payload.provider_type,
    options.payload.provider_category,
    options.payload.api_key_url,
    options.payload.base_url,
    options.payload.model,
    ...(options.extraValues ?? []),
    options.encrypted,
    options.masked,
    options.body.is_default ? 1 : 0,
  ];
  const placeholders = columns.map(() => "?").join(", ");
  const result = await options.db
    .prepare(
      `INSERT INTO ${options.table} (${columns.join(", ")}, created_at, updated_at) ` +
        `VALUES (${placeholders}, strftime('%s', 'now'), strftime('%s', 'now'))`,
    )
    .bind(...values)
    .run();
  return result.meta.last_row_id;
}

export async function backfillActionProfiles(
  db: D1Database,
  actionTable: string,
  defaultId: number | null,
) {
  if (!defaultId) return;
  await db
    .prepare(`UPDATE ${actionTable} SET profile_id = ? WHERE profile_id IS NULL`)
    .bind(defaultId)
    .run();
}

export function baseProfileUpdate(
  payload: ProviderProfilePayload,
  masked: string,
  isDefault: number,
) {
  return {
    sets: [
      "name = ?",
      "provider = ?",
      "provider_name = ?",
      "provider_type = ?",
      "provider_category = ?",
      "api_key_url = ?",
      "base_url = ?",
      "model = ?",
      "api_key_masked = ?",
      "is_default = ?",
      "updated_at = strftime('%s', 'now')",
    ],
    values: [
      payload.name,
      payload.provider,
      payload.provider_name,
      payload.provider_type,
      payload.provider_category,
      payload.api_key_url,
      payload.base_url,
      payload.model,
      masked,
      isDefault,
    ] as Array<string | number>,
  };
}

export async function executeProfileUpdate(
  db: D1Database,
  table: string,
  sets: string[],
  values: Array<string | number>,
  id: number,
) {
  await db
    .prepare(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values, id)
    .run();
}
