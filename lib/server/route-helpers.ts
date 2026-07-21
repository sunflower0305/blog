import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/admin-auth";
import {
  getAppCloudflareContext,
  getAppCloudflareEnv,
  type AppExecutionContext,
} from "@/lib/cloudflare";

export type RouteDbEnv = Partial<CloudflareEnv> & { DB: D1Database };

type RouteEnvWithDbResult =
  | {
      ok: true;
      env: RouteDbEnv;
      db: D1Database;
    }
  | {
      ok: false;
      response: NextResponse;
    };

type RouteContextWithDbResult =
  | {
      ok: true;
      env: RouteDbEnv;
      db: D1Database;
      ctx: AppExecutionContext | undefined;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export function jsonOk<T>(payload: T, status = 200) {
  return NextResponse.json(payload, { status });
}

export function jsonError(error: string, status = 500) {
  return NextResponse.json({ error }, { status });
}

type JsonBodyResult<T> = { ok: true; body: T } | { ok: false; response: NextResponse };

/**
 * 读取并解析 JSON 请求体，匹配 getRouteEnvWithDb 的早返回结果契约：
 * 成功返回 `{ ok: true, body }`，解析失败返回 `{ ok: false, response }`（400），
 * 路由统一用 `if (!parsed.ok) return parsed.response;`，畸形请求体不会退化成 500。
 */
export async function readJsonBody<T>(
  req: NextRequest,
  invalidMessage = "请求体不是有效 JSON",
): Promise<JsonBodyResult<T>> {
  try {
    return { ok: true, body: (await req.json()) as T };
  } catch {
    return { ok: false, response: jsonError(invalidMessage, 400) };
  }
}

export async function getRouteEnvWithDb(
  missingDbMessage = "DB unavailable",
): Promise<RouteEnvWithDbResult> {
  const env = await getAppCloudflareEnv();
  const db = env?.DB as D1Database | undefined;

  if (!db) {
    return {
      ok: false,
      response: jsonError(missingDbMessage, 500),
    };
  }

  return {
    ok: true,
    env: env as RouteDbEnv,
    db,
  };
}

export async function getRouteContextWithDb(
  missingDbMessage = "DB unavailable",
): Promise<RouteContextWithDbResult> {
  const cf = await getAppCloudflareContext();
  const db = cf.env?.DB as D1Database | undefined;

  if (!db) {
    return {
      ok: false,
      response: jsonError(missingDbMessage, 500),
    };
  }

  return {
    ok: true,
    env: cf.env as RouteDbEnv,
    db,
    ctx: cf.ctx,
  };
}

export async function ensureAuthenticatedRequest(
  req: NextRequest,
  db?: D1Database,
  unauthorizedMessage = "Unauthorized",
) {
  if (!(await authenticateRequest(req, db))) {
    return jsonError(unauthorizedMessage, 401);
  }
  return null;
}
