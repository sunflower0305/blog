import { NextRequest, NextResponse } from "next/server";
import {
  ensureAiImageConfigInfrastructure,
  ensureDefaultImageProfileId,
  saveEncryptedAiImageApiKey,
  type AIImageProviderProfileRow,
} from "@/lib/ai-image-config";
import { resolveAiConfigSecret } from "@/lib/ai-provider-profiles";
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
  type SaveProviderProfileBody,
} from "@/lib/server/provider-profile-route";

type SaveProfileBody = SaveProviderProfileBody;

async function listProfiles(db: D1Database) {
  const { results } = await db
    .prepare(`
    SELECT id, name, provider, provider_name, provider_type, provider_category, api_key_url,
           base_url, model, api_key_masked, is_default, created_at, updated_at
    FROM ai_image_provider_profiles
    ORDER BY is_default DESC, updated_at DESC, id DESC
  `)
    .all<AIImageProviderProfileRow>();

  const profiles = results || [];
  const defaultProfileId = findDefaultProfileId(profiles);
  return { profiles, defaultProfileId };
}

async function initialize(req: NextRequest) {
  return initializeProviderProfileRoute(
    req,
    (db) => ensureAiImageConfigInfrastructure(db),
    resolveAiConfigSecret,
  );
}

export async function GET(req: NextRequest) {
  return handleProviderProfileList(req, initialize, listProfiles);
}

function prepareCreateRequest(req: NextRequest) {
  return prepareProviderProfileCreateRequest(
    req,
    (db) => ensureAiImageConfigInfrastructure(db),
    resolveAiConfigSecret,
    (body: SaveProfileBody) => buildProviderProfilePayload(body, "openai_images"),
    saveEncryptedAiImageApiKey,
  );
}

export async function POST(req: NextRequest) {
  const route = await prepareCreateRequest(req);
  if (!route.ok) return route.response;
  const { db, body, payload, encrypted, masked } = route;

  return createProviderProfile<AIImageProviderProfileRow>({
    insert: {
      db,
      table: "ai_image_provider_profiles",
      body,
      payload,
      encrypted,
      masked,
    },
    actionTable: "ai_image_actions",
    ensureDefaultId: ensureDefaultImageProfileId,
    selectSql: `SELECT id, name, provider, provider_name, provider_type, provider_category,
      api_key_url, base_url, model, api_key_masked, is_default, created_at, updated_at
      FROM ai_image_provider_profiles WHERE id = ?`,
  });
}

export async function PUT(req: NextRequest) {
  const route = await prepareProviderProfileUpdateRequest(
    req,
    "ai_image_provider_profiles",
    (db) => ensureAiImageConfigInfrastructure(db),
    resolveAiConfigSecret,
    (body: SaveProfileBody) => buildProviderProfilePayload(body, "openai_images"),
  );
  if (!route.ok) return route.response;
  const { db, secret, body, payload, id, existing: exists } = route;

  const rawApiKey = (body.api_key || "").trim();
  const encryptedPayload = rawApiKey ? await saveEncryptedAiImageApiKey(rawApiKey, secret) : null;

  const nextIsDefault = resolveNextProfileDefault(body.is_default, exists.is_default);

  await clearDefaultProfile(db, "ai_image_provider_profiles", nextIsDefault === 1);

  const { sets, values } = baseProfileUpdate(
    payload,
    encryptedPayload?.masked || exists.api_key_masked,
    nextIsDefault,
  );

  if (encryptedPayload) {
    sets.splice(8, 0, "api_key_encrypted = ?");
    values.splice(8, 0, encryptedPayload.encrypted);
  }

  await executeProfileUpdate(db, "ai_image_provider_profiles", sets, values, id);

  return finishProviderProfileWrite<AIImageProviderProfileRow>({
    db,
    id,
    actionTable: "ai_image_actions",
    ensureDefaultId: ensureDefaultImageProfileId,
    selectSql: `SELECT id, name, provider, provider_name, provider_type, provider_category,
      api_key_url, base_url, model, api_key_masked, is_default, created_at, updated_at
      FROM ai_image_provider_profiles WHERE id = ?`,
  });
}

export async function DELETE(req: NextRequest) {
  const route = await initializeAndReadProviderProfileId(
    req,
    (db) => ensureAiImageConfigInfrastructure(db),
    resolveAiConfigSecret,
  );
  if (!route.ok) return route.response;
  const { db, id } = route;

  const boundCount = await db
    .prepare(`
    SELECT COUNT(*) as count
    FROM ai_image_actions
    WHERE profile_id = ?
  `)
    .bind(id)
    .first<{ count: number }>();

  await db.prepare("DELETE FROM ai_image_provider_profiles WHERE id = ?").bind(id).run();

  const defaultId = await ensureDefaultImageProfileId(db);
  if ((boundCount?.count ?? 0) > 0) {
    await db
      .prepare("UPDATE ai_image_actions SET profile_id = ? WHERE profile_id = ?")
      .bind(defaultId ?? null, id)
      .run();
  }

  return NextResponse.json({ success: true });
}
