import { NextRequest, NextResponse } from "next/server";
import { buildPresetModels, errorMessage } from "@/lib/provider-model-discovery";

export interface ProviderModelQuery {
  provider: string;
  baseUrl: string;
  apiKey: string;
  profileId: number;
}

export interface ProviderModelConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  fallbackModels: string[];
  storedKeyUnavailable: boolean;
}

export function readProviderModelQuery(req: NextRequest): ProviderModelQuery {
  const params = new URL(req.url).searchParams;
  const read = (name: string) => params.get(name)?.trim() || "";
  return {
    provider: read("provider"),
    baseUrl: read("base_url"),
    apiKey: read("api_key"),
    profileId: Number(params.get("profile_id") || ""),
  };
}

export function firstDefinedValue(values: Array<string | null | undefined>, fallback = "") {
  return values.find(Boolean) || fallback;
}

export function presetModelResponse(models: string[], warning: string) {
  return NextResponse.json({ models: buildPresetModels(models), source: "preset", warning });
}

export function missingProviderKeyResponse(config: ProviderModelConfig) {
  const warning = config.storedKeyUnavailable
    ? "已保存 API Key 无法解密，请重新输入 API Key，或检查 AI_CONFIG_ENCRYPTION_SECRET / ADMIN_TOKEN_SALT 是否与保存时一致"
    : "未提供 API Key，返回预设模型列表";
  return config.fallbackModels.length > 0
    ? presetModelResponse(config.fallbackModels, warning)
    : NextResponse.json(
        { error: config.storedKeyUnavailable ? warning : "缺少 API Key" },
        { status: 400 },
      );
}

export function emptyProviderModelResponse(warning: string | undefined, fallbackModels: string[]) {
  if (fallbackModels.length > 0) {
    return presetModelResponse(
      fallbackModels,
      warning ? `接口拉取失败，已回退预设：${warning}` : "接口返回为空，已回退预设模型",
    );
  }
  return NextResponse.json(
    { error: warning ? `获取模型列表失败：${warning}` : undefined },
    { status: warning ? 502 : 200 },
  );
}

export function providerModelNetworkError(error: unknown, fallbackModels: string[]) {
  const message = errorMessage(error, "获取模型列表失败");
  return fallbackModels.length > 0
    ? presetModelResponse(fallbackModels, `网络异常，已回退预设：${message}`)
    : NextResponse.json({ error: message }, { status: 502 });
}
