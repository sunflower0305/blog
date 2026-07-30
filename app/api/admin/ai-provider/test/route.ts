import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/admin-auth";
import { getAppCloudflareEnv } from "@/lib/cloudflare";
import {
  clampMaxTokens,
  clampTemperature,
  decryptApiKey,
  ensureAiConfigInfrastructure,
  normalizeBaseUrl,
  resolveAiConfigSecret,
} from "@/lib/ai-provider-profiles";
import { readJsonBody } from "@/lib/server/route-helpers";

interface ProviderTestBody {
  profile_id?: number;
  base_url?: string;
  api_key?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

interface ProviderTestProfile {
  base_url: string;
  model: string;
  api_key_encrypted: string;
}

interface ProviderTestConfig {
  baseUrl: string;
  model: string;
  key: string;
  temperature: number;
  maxTokens: number;
  storedKeyUnavailable: boolean;
}

function isGeminiBaseUrl(baseUrl: string): boolean {
  return /generativelanguage\.googleapis\.com/i.test(baseUrl);
}

function ensureGeminiBase(baseUrl: string): string {
  if (baseUrl.includes("/v1") || baseUrl.includes("/v1beta")) {
    return baseUrl;
  }
  return `${baseUrl}/v1`;
}

function toStringSafe(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

function buildProviderErrorMessage(
  resStatus: number,
  resStatusText: string,
  rawBody: string,
): string {
  let parsed: unknown;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsed = null;
  }

  if (parsed && typeof parsed === "object") {
    const payload = parsed as {
      message?: unknown;
      error?: unknown;
    };

    if (payload.error && typeof payload.error === "object") {
      const errObj = payload.error as {
        message?: unknown;
        code?: unknown;
        metadata?:
          | {
              raw?: unknown;
              provider_name?: unknown;
              provider_error?: unknown;
              reason?: unknown;
            }
          | unknown;
      };
      const message = toStringSafe(errObj.message);
      const code = toStringSafe(errObj.code);

      let providerRaw = "";
      let providerName = "";
      if (errObj.metadata && typeof errObj.metadata === "object") {
        const meta = errObj.metadata as {
          raw?: unknown;
          provider_name?: unknown;
          provider_error?: unknown;
          reason?: unknown;
        };
        providerRaw =
          toStringSafe(meta.raw) || toStringSafe(meta.provider_error) || toStringSafe(meta.reason);
        providerName = toStringSafe(meta.provider_name);
      }

      const parts = [
        message || "Provider returned error",
        providerRaw ? `详情: ${providerRaw}` : "",
        providerName ? `Provider: ${providerName}` : "",
        code ? `Code: ${code}` : "",
      ].filter(Boolean);
      return parts.join(" · ");
    }

    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error.trim();
    }

    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }
  }

  const raw = rawBody.trim();
  if (raw) return raw.slice(0, 500);
  return `HTTP ${resStatus}: ${resStatusText}`;
}

async function loadProviderTestProfile(db: D1Database, profileId: number) {
  if (!Number.isFinite(profileId) || profileId <= 0) return null;
  return db
    .prepare(`
      SELECT base_url, model, api_key_encrypted
      FROM ai_provider_profiles
      WHERE id = ?
      LIMIT 1
    `)
    .bind(profileId)
    .first<ProviderTestProfile>();
}

async function resolveProviderTestConfig(
  body: ProviderTestBody,
  profile: ProviderTestProfile | null,
  secret: string,
): Promise<ProviderTestConfig> {
  const enteredKey = (body.api_key || "").trim();
  const profileApiKey = profile?.api_key_encrypted
    ? await decryptApiKey(profile.api_key_encrypted, secret)
    : "";

  return {
    baseUrl: normalizeBaseUrl(body.base_url || profile?.base_url || ""),
    model: (body.model || profile?.model || "").trim(),
    key: enteredKey || profileApiKey,
    temperature: clampTemperature(Number(body.temperature)),
    maxTokens: Math.max(1, Math.min(256, Math.floor(clampMaxTokens(Number(body.max_tokens))))),
    storedKeyUnavailable:
      !enteredKey && Boolean(profile?.api_key_encrypted?.trim()) && !profileApiKey,
  };
}

function buildProviderTestRequest(config: ProviderTestConfig): [string, RequestInit] {
  if (isGeminiBaseUrl(config.baseUrl)) {
    const geminiBase = ensureGeminiBase(config.baseUrl);
    return [
      `${geminiBase}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: 'Say "OK"' }] }],
          generationConfig: {
            temperature: config.temperature,
            maxOutputTokens: config.maxTokens,
          },
        }),
        signal: AbortSignal.timeout(15000),
      },
    ];
  }

  return [
    `${config.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: 'Say "OK"' }],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      }),
      signal: AbortSignal.timeout(15000),
    },
  ];
}

async function runProviderTest(config: ProviderTestConfig) {
  try {
    const startedAt = Date.now();
    const res = await fetch(...buildProviderTestRequest(config));
    if (!res.ok) {
      const rawBody = await res.text().catch(() => "");
      return NextResponse.json({
        success: false,
        error: buildProviderErrorMessage(res.status, res.statusText, rawBody),
      });
    }

    return NextResponse.json({
      success: true,
      latency_ms: Date.now() - startedAt,
      model: config.model,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "连接失败",
    });
  }
}

export async function POST(req: NextRequest) {
  const env = await getAppCloudflareEnv();
  const db = env?.DB as D1Database | undefined;
  if (!(await authenticateRequest(req, db))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const secret = resolveAiConfigSecret(env);
  await ensureAiConfigInfrastructure(db, secret);
  const parsed = await readJsonBody<ProviderTestBody>(req);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body;
  const profileId = Number(body.profile_id);
  const profile = await loadProviderTestProfile(db, profileId);
  const config = await resolveProviderTestConfig(body, profile, secret);
  if (config.storedKeyUnavailable && config.baseUrl && config.model) {
    return NextResponse.json({
      success: false,
      error:
        "已保存 API Key 无法解密，请重新输入 API Key，或检查 AI_CONFIG_ENCRYPTION_SECRET / ADMIN_TOKEN_SALT 是否与保存时一致",
    });
  }

  if (!config.baseUrl || !config.key || !config.model) {
    return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
  }

  return runProviderTest(config);
}
