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
  prepareActionCreate,
  runActionWrite,
  validateRequiredActionFields,
  type CommonActionBody,
} from "@/lib/server/ai-action-route";
import { getAuthenticatedRoute, readJsonBody } from "@/lib/server/route-helpers";

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
  const parsed = await readJsonBody<ImageActionBody>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!validateRequiredActionFields(body)) {
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
  }

  const { profileId, sortOrder } = await prepareActionCreate(
    route.db,
    "ai_image_actions",
    body,
    ensureDefaultImageProfileId,
  );
  const aspectRatio = normalizeAiImageAspectRatio(
    body.aspect_ratio || inferAspectRatioFromLegacySize(body.size),
  );
  const resolution = normalizeAiImageResolution(
    body.resolution || inferResolutionFromLegacyQuality(body.quality),
  );
  const duplicate = await runActionWrite(
    route.db,
    "ai_image_actions",
    `INSERT INTO ai_image_actions (
      action_key, label, description, prompt, aspect_ratio, resolution, size, quality, profile_id, sort_order, is_builtin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      body.action_key!,
      body.label!,
      body.description!,
      body.prompt!,
      aspectRatio,
      resolution,
      deriveLegacySizeFromAspectRatio(aspectRatio, body.size),
      deriveLegacyQualityFromResolution(resolution, body.quality),
      profileId,
      sortOrder,
    ],
  );
  return duplicate ?? NextResponse.json({ success: true });
}

export async function PUT(req: NextRequest) {
  const route = await initialize(req);
  if (!route.ok) return route.response;
  return handleActionReorder(req, route.db, "ai_image_actions");
}
