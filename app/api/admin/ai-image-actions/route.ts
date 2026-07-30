import { NextRequest, NextResponse } from "next/server";
import {
  ensureAiImageConfigInfrastructure,
  ensureDefaultImageProfileId,
  type AIImageActionRow,
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
  handleActionReorder,
  initializeActionRoute,
  createAction,
  readValidActionBody,
  type CommonActionBody,
} from "@/lib/server/ai-action-route";

interface ImageActionBody extends CommonActionBody {
  aspect_ratio?: string;
  resolution?: string;
  size?: string;
  quality?: string;
}

async function initialize(req: NextRequest) {
  return initializeActionRoute(req, (db) => ensureAiImageConfigInfrastructure(db));
}

export async function GET(req: NextRequest) {
  const route = await initialize(req);
  if (!route.ok) return route.response;
  const { results } = await route.db
    .prepare(`
      SELECT id, action_key, label, description, prompt, aspect_ratio, resolution, size, quality, profile_id, sort_order, is_enabled, is_builtin,
             created_at, updated_at
      FROM ai_image_actions ORDER BY sort_order ASC
    `)
    .all<AIImageActionRow>();
  return NextResponse.json({ actions: results });
}

export async function POST(req: NextRequest) {
  const route = await initialize(req);
  if (!route.ok) return route.response;
  const parsed = await readValidActionBody<ImageActionBody>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const aspectRatio = normalizeAiImageAspectRatio(
    body.aspect_ratio || inferAspectRatioFromLegacySize(body.size),
  );
  const resolution = normalizeAiImageResolution(
    body.resolution || inferResolutionFromLegacyQuality(body.quality),
  );
  return createAction({
    db: route.db,
    table: "ai_image_actions",
    body,
    ensureDefaultId: ensureDefaultImageProfileId,
    extraColumns: ["aspect_ratio", "resolution", "size", "quality"],
    extraValues: [
      aspectRatio,
      resolution,
      deriveLegacySizeFromAspectRatio(aspectRatio, body.size),
      deriveLegacyQualityFromResolution(resolution, body.quality),
    ],
  });
}

export async function PUT(req: NextRequest) {
  const route = await initialize(req);
  if (!route.ok) return route.response;
  return handleActionReorder(req, route.db, "ai_image_actions");
}
