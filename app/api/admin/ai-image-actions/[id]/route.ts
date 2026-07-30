import { NextRequest, NextResponse } from "next/server";
import {
  ensureAiImageConfigInfrastructure,
  ensureDefaultImageProfileId,
} from "@/lib/ai-image-config";
import {
  deriveLegacyQualityFromResolution,
  deriveLegacySizeFromAspectRatio,
  inferAspectRatioFromLegacySize,
  inferResolutionFromLegacyQuality,
  normalizeAiImageAspectRatio,
  normalizeAiImageResolution,
} from "@/lib/ai-image-options";
import {
  appendCommonActionUpdates,
  appendProfileUpdate,
  deleteAction,
  finishActionUpdate,
  initializeActionRoute,
  type CommonActionBody,
  type SqlValue,
} from "@/lib/server/ai-action-route";
import { getAuthenticatedRoute, readJsonBody } from "@/lib/server/route-helpers";

interface ImageActionBody extends CommonActionBody {
  aspect_ratio?: string;
  resolution?: string;
  size?: string;
  quality?: string;
}

interface CurrentImageOptions {
  id: number;
  aspect_ratio: string;
  resolution: string;
  size: string;
  quality: string;
}

async function initialize(req: NextRequest) {
  return initializeActionRoute(req, (db) => ensureAiImageConfigInfrastructure(db));
}

function appendImageOptionUpdates(
  body: ImageActionBody,
  current: CurrentImageOptions,
  sets: string[],
  values: SqlValue[],
) {
  if (
    body.aspect_ratio === undefined &&
    body.resolution === undefined &&
    body.size === undefined &&
    body.quality === undefined
  ) {
    return;
  }
  const aspectRatio = normalizeAiImageAspectRatio(
    body.aspect_ratio ||
      (body.size !== undefined ? inferAspectRatioFromLegacySize(body.size) : current.aspect_ratio),
  );
  const resolution = normalizeAiImageResolution(
    body.resolution ||
      (body.quality !== undefined
        ? inferResolutionFromLegacyQuality(body.quality)
        : current.resolution),
  );
  sets.push("aspect_ratio = ?", "resolution = ?", "size = ?", "quality = ?");
  values.push(
    aspectRatio,
    resolution,
    deriveLegacySizeFromAspectRatio(aspectRatio, body.size || current.size),
    deriveLegacyQualityFromResolution(resolution, body.quality || current.quality),
  );
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const route = await initialize(req);
  if (!route.ok) return route.response;
  const parsed = await readJsonBody<ImageActionBody>(req);
  if (!parsed.ok) return parsed.response;
  const id = Number((await params).id);
  const current = await route.db
    .prepare(
      "SELECT id, aspect_ratio, resolution, size, quality FROM ai_image_actions WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .first<CurrentImageOptions>();
  if (!current?.id) {
    return NextResponse.json({ error: "操作不存在" }, { status: 404 });
  }

  const sets: string[] = [];
  const values: SqlValue[] = [];
  appendCommonActionUpdates(parsed.body, sets, values);
  appendImageOptionUpdates(parsed.body, current, sets, values);
  await appendProfileUpdate(
    route.db,
    parsed.body.profile_id,
    ensureDefaultImageProfileId,
    sets,
    values,
  );
  if (sets.length === 0) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  }

  return finishActionUpdate(
    route.db,
    "ai_image_actions",
    id,
    sets,
    values,
  );
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const route = await initialize(req);
  if (!route.ok) return route.response;
  return deleteAction(route.db, "ai_image_actions", Number((await params).id));
}
