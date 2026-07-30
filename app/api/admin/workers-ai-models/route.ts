import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/admin-auth";
import { getAppCloudflareEnv } from "@/lib/cloudflare";
import {
  WORKERS_AI_IMAGE_MODEL_SUGGESTIONS,
  WORKERS_AI_TEXT_MODEL_SUGGESTIONS,
} from "@/lib/ai-post-generators";
import {
  decryptApiKey,
  ensureAiConfigInfrastructure,
  normalizeBaseUrl,
  resolveAiConfigSecret,
} from "@/lib/ai-provider-profiles";
import { extractCloudflareAccountId, fetchWorkersAiModels } from "@/lib/workers-ai-models";

interface WorkersAiProfileRow {
  id: number;
  provider: string;
  base_url: string;
  api_key_encrypted: string;
  is_default: number;
}

type WorkersAiKind = "image" | "text";

function toModelOptions(ids: string[]) {
  return ids.map((id) => ({ id, name: id }));
}

async function loadWorkersAiProfile(db: D1Database, requestedProfileId: number) {
  let profile: WorkersAiProfileRow | null = null;
  if (Number.isFinite(requestedProfileId) && requestedProfileId > 0) {
    profile = await db
      .prepare(`
      SELECT id, provider, base_url, api_key_encrypted, is_default
      FROM ai_provider_profiles
      WHERE id = ?
        AND (
          provider = 'workers_ai'
          OR base_url LIKE '%api.cloudflare.com/client/v4/accounts/%/ai/%'
        )
      LIMIT 1
    `)
      .bind(requestedProfileId)
      .first<WorkersAiProfileRow>();
  }

  if (profile) return profile;
  return db
    .prepare(`
      SELECT id, provider, base_url, api_key_encrypted, is_default
      FROM ai_provider_profiles
      WHERE provider = 'workers_ai'
         OR base_url LIKE '%api.cloudflare.com/client/v4/accounts/%/ai/%'
      ORDER BY is_default DESC, updated_at DESC, id DESC
      LIMIT 1
    `)
    .first<WorkersAiProfileRow>();
}

async function resolveWorkersAiCredentials(
  profile: WorkersAiProfileRow | null,
  env: Partial<CloudflareEnv>,
  secret: string,
) {
  const profileBaseUrl = normalizeBaseUrl(profile?.base_url || "");
  const profileApiToken = profile?.api_key_encrypted
    ? await decryptApiKey(profile.api_key_encrypted, secret)
    : "";
  const storedKeyUnavailable = Boolean(profile?.api_key_encrypted?.trim()) && !profileApiToken;

  return {
    accountId:
      extractCloudflareAccountId(profileBaseUrl) ||
      env.CLOUDFLARE_ACCOUNT_ID ||
      process.env.CLOUDFLARE_ACCOUNT_ID ||
      "",
    apiToken: profileApiToken || env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || "",
    storedKeyUnavailable,
  };
}

function missingCredentialsWarning(
  profile: WorkersAiProfileRow | null,
  storedKeyUnavailable: boolean,
) {
  if (storedKeyUnavailable) {
    return "已保存的 Workers AI API Token 无法解密，已回退预设模型，请重新保存该配置";
  }
  if (profile) {
    return "已存在 Workers AI 配置，但缺少可用的 Account ID 或 API Token，已回退预设模型";
  }
  return "未找到可用的 Workers AI provider profile，也未配置 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN，已回退预设模型";
}

function presetModelsResponse(fallbackModels: string[], warning: string) {
  return NextResponse.json({
    models: toModelOptions(fallbackModels),
    source: "preset",
    warning,
  });
}

async function fetchWorkersAiModelsResponse(options: {
  accountId: string;
  apiToken: string;
  kind: WorkersAiKind;
  fallbackModels: string[];
  storedKeyUnavailable: boolean;
}) {
  try {
    const models = await fetchWorkersAiModels(
      options.accountId,
      options.apiToken,
      options.kind,
      options.fallbackModels,
    );
    if (models.length === 0) {
      return presetModelsResponse(
        options.fallbackModels,
        "Workers AI 接口返回为空，已回退预设模型",
      );
    }

    return NextResponse.json({
      models,
      source: "provider",
      ...(options.storedKeyUnavailable
        ? {
            warning:
              "当前已改用环境变量中的 Workers AI 凭证拉取模型；已保存配置中的 API Token 无法解密",
          }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取 Workers AI 模型失败";
    return presetModelsResponse(
      options.fallbackModels,
      `Workers AI 拉取失败，已回退预设：${message}`,
    );
  }
}

export async function GET(req: NextRequest) {
  const env = await getAppCloudflareEnv();
  const db = env?.DB as D1Database | undefined;
  if (!(await authenticateRequest(req, db))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const kind: WorkersAiKind = url.searchParams.get("kind") === "image" ? "image" : "text";
  const fallbackModels =
    kind === "image" ? WORKERS_AI_IMAGE_MODEL_SUGGESTIONS : WORKERS_AI_TEXT_MODEL_SUGGESTIONS;
  const secret = resolveAiConfigSecret(env);
  await ensureAiConfigInfrastructure(db, secret);

  const profile = await loadWorkersAiProfile(db, Number(url.searchParams.get("profile_id") || ""));
  const credentials = await resolveWorkersAiCredentials(profile, env ?? {}, secret);
  if (!credentials.accountId || !credentials.apiToken) {
    return presetModelsResponse(
      fallbackModels,
      missingCredentialsWarning(profile, credentials.storedKeyUnavailable),
    );
  }

  return fetchWorkersAiModelsResponse({ kind, fallbackModels, ...credentials });
}
