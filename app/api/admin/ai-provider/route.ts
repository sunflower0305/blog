import { NextRequest, NextResponse } from "next/server";
import {
  clampMaxTokens,
  clampTemperature,
  encryptApiKey,
  ensureAiConfigInfrastructure,
  ensureDefaultProfileId,
  mapProfileRow,
  maskApiKey,
  resolveAiConfigSecret,
  type AIProviderProfileRow,
} from "@/lib/ai-provider-profiles";
import {
  baseProfileUpdate,
  buildProviderProfilePayload,
  clearDefaultProfile,
  createProviderProfile,
  executeProfileUpdate,
  finishProviderProfileWrite,
  handleProviderProfileList,
  findDefaultProfileId,
  initializeProviderProfileRoute,
  initializeAndReadProviderProfileId,
  prepareProviderProfileCreateRequest,
  prepareProviderProfileUpdateRequest,
  resolveNextProfileDefault,
  type ProviderProfilePayload,
  type SaveProviderProfileBody,
} from "@/lib/server/provider-profile-route";

interface SaveProfileBody extends SaveProviderProfileBody {
  id?: number;
  temperature?: number;
  max_tokens?: number;
}

function buildProfilePayload(body: SaveProfileBody) {
  const base = buildProviderProfilePayload(body, "openai_compatible");
  if ("error" in base) return base;
  return {
    ...base,
    temperature: clampTemperature(Number(body.temperature)),
    max_tokens: clampMaxTokens(Number(body.max_tokens)),
  };
}

async function listProfiles(db: D1Database) {
  const { results } = await db
    .prepare(`
    SELECT id, name, provider, provider_name, provider_type, provider_category, api_key_url,
           base_url, model, temperature, max_tokens, api_key_masked, is_default,
           created_at, updated_at
    FROM ai_provider_profiles
    ORDER BY is_default DESC, updated_at DESC, id DESC
  `)
    .all<AIProviderProfileRow>();

  const profiles = (results || []).map((row) => mapProfileRow(row));
  const defaultProfileId = findDefaultProfileId(profiles);

  return { profiles, defaultProfileId };
}

async function initialize(req: NextRequest) {
  return initializeProviderProfileRoute(
    req,
    (db, _env, secret) => ensureAiConfigInfrastructure(db, secret),
    resolveAiConfigSecret,
  );
}

function prepareCreateRequest(req: NextRequest) {
  return prepareProviderProfileCreateRequest<
    SaveProfileBody,
    ProviderProfilePayload & { temperature: number; max_tokens: number }
  >(
    req,
    (db, _env, secret) => ensureAiConfigInfrastructure(db, secret),
    resolveAiConfigSecret,
    buildProfilePayload,
    async (rawKey, secret) => ({
      encrypted: rawKey ? await encryptApiKey(rawKey, secret) : "",
      masked: rawKey ? maskApiKey(rawKey) : "",
    }),
  );
}

export async function GET(req: NextRequest) {
  return handleProviderProfileList(req, initialize, listProfiles);
}

export async function POST(req: NextRequest) {
  const route = await prepareCreateRequest(req);
  if (!route.ok) return route.response;
  const { db, body, payload, encrypted, masked } = route;

  return createProviderProfile<AIProviderProfileRow>({
    insert: {
      db,
      table: "ai_provider_profiles",
      body,
      payload,
      extraColumns: ["temperature", "max_tokens"],
      extraValues: [payload.temperature, payload.max_tokens],
      encrypted,
      masked,
    },
    actionTable: "ai_actions",
    ensureDefaultId: ensureDefaultProfileId,
    selectSql: `SELECT id, name, provider, provider_name, provider_type, provider_category,
      api_key_url, base_url, model, temperature, max_tokens, api_key_masked, is_default,
      created_at, updated_at FROM ai_provider_profiles WHERE id = ?`,
    map: mapProfileRow,
  });
}

export async function PUT(req: NextRequest) {
  const route = await prepareProviderProfileUpdateRequest<
    SaveProfileBody,
    ProviderProfilePayload & { temperature: number; max_tokens: number }
  >(
    req,
    "ai_provider_profiles",
    (db, _env, secret) => ensureAiConfigInfrastructure(db, secret),
    resolveAiConfigSecret,
    buildProfilePayload,
  );
  if (!route.ok) return route.response;
  const { db, secret, body, payload, id, existing: exists } = route;

  const rawApiKey = (body.api_key || "").trim();
  const encrypted = rawApiKey ? await encryptApiKey(rawApiKey, secret) : null;
  const masked = rawApiKey ? maskApiKey(rawApiKey) : exists.api_key_masked;

  const nextIsDefault = resolveNextProfileDefault(body.is_default, exists.is_default);

  await clearDefaultProfile(db, "ai_provider_profiles", nextIsDefault === 1);

  const { sets, values } = baseProfileUpdate(payload, masked, nextIsDefault);
  sets.splice(8, 0, "temperature = ?", "max_tokens = ?");
  values.splice(8, 0, payload.temperature, payload.max_tokens);

  if (encrypted !== null) {
    sets.splice(10, 0, "api_key_encrypted = ?");
    values.splice(10, 0, encrypted);
  }

  await executeProfileUpdate(db, "ai_provider_profiles", sets, values, id);

  return finishProviderProfileWrite<AIProviderProfileRow>({
    db,
    id,
    actionTable: "ai_actions",
    ensureDefaultId: ensureDefaultProfileId,
    selectSql: `SELECT id, name, provider, provider_name, provider_type, provider_category,
      api_key_url, base_url, model, temperature, max_tokens, api_key_masked, is_default,
      created_at, updated_at FROM ai_provider_profiles WHERE id = ?`,
    map: mapProfileRow,
  });
}

export async function DELETE(req: NextRequest) {
  const route = await initializeAndReadProviderProfileId(
    req,
    (db, _env, secret) => ensureAiConfigInfrastructure(db, secret),
    resolveAiConfigSecret,
  );
  if (!route.ok) return route.response;
  const { db, id } = route;

  const target = await db
    .prepare("SELECT id, is_default FROM ai_provider_profiles WHERE id = ?")
    .bind(id)
    .first<{ id: number; is_default: number }>();
  if (!target) {
    return NextResponse.json({ error: "配置不存在" }, { status: 404 });
  }

  await db.prepare("DELETE FROM ai_provider_profiles WHERE id = ?").bind(id).run();

  const fallbackId = await ensureDefaultProfileId(db);
  if (fallbackId) {
    await db
      .prepare("UPDATE ai_actions SET profile_id = ? WHERE profile_id = ? OR profile_id IS NULL")
      .bind(fallbackId, id)
      .run();
  } else {
    await db.prepare("UPDATE ai_actions SET profile_id = NULL WHERE profile_id = ?").bind(id).run();
  }

  return NextResponse.json({ success: true });
}
