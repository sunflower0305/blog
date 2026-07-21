import { getCategories, createCategory, updateCategory, deleteCategory } from "@/lib/db";
import { invalidatePublicContentCache } from "@/lib/cache";
import {
  ensureAuthenticatedRequest,
  getRouteEnvWithDb,
  jsonError,
  jsonOk,
  readJsonBody,
} from "@/lib/server/route-helpers";
import type { NextRequest } from "next/server";

interface CreateCategoryBody {
  name?: string;
  slug?: string;
}

interface UpdateCategoryBody {
  oldSlug?: string;
  name?: string;
  slug?: string;
}

interface DeleteCategoryBody {
  slug?: string;
}

export async function GET(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb("DB not available");
    if (!route.ok) return route.response;

    // 分类列表允许 Bearer Token 访问（Obsidian/Chrome 插件需要）
    const authError = await ensureAuthenticatedRequest(req, route.db);
    if (authError) return authError;

    const categories = await getCategories(route.db);
    return jsonOk({ categories });
  } catch (err) {
    return jsonError(String(err), 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb("DB not available");
    if (!route.ok) return route.response;
    const authError = await ensureAuthenticatedRequest(req, route.db, "未授权");
    if (authError) return authError;

    const parsed = await readJsonBody<CreateCategoryBody>(req);
    if (!parsed.ok) return parsed.response;
    const { name, slug } = parsed.body;
    if (!name || !slug) {
      return jsonError("名称和slug不能为空", 400);
    }

    await createCategory(route.db, name, slug);
    await invalidatePublicContentCache(route.env);
    return jsonOk({ success: true });
  } catch (err) {
    return jsonError(String(err), 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb("DB not available");
    if (!route.ok) return route.response;
    const authError = await ensureAuthenticatedRequest(req, route.db, "未授权");
    if (authError) return authError;

    const parsed = await readJsonBody<UpdateCategoryBody>(req);
    if (!parsed.ok) return parsed.response;
    const { oldSlug, name, slug } = parsed.body;
    if (!oldSlug || !name || !slug) {
      return jsonError("参数不完整", 400);
    }

    await updateCategory(route.db, oldSlug, name, slug);
    await invalidatePublicContentCache(route.env);
    return jsonOk({ success: true });
  } catch (err) {
    return jsonError(String(err), 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb("DB not available");
    if (!route.ok) return route.response;
    const authError = await ensureAuthenticatedRequest(req, route.db, "未授权");
    if (authError) return authError;

    const parsed = await readJsonBody<DeleteCategoryBody>(req);
    if (!parsed.ok) return parsed.response;
    const { slug } = parsed.body;
    if (!slug) {
      return jsonError("slug不能为空", 400);
    }

    await deleteCategory(route.db, slug);
    await invalidatePublicContentCache(route.env);
    return jsonOk({ success: true });
  } catch (err) {
    return jsonError(String(err), 500);
  }
}
