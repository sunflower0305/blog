import { NextRequest, NextResponse } from "next/server";
import {
  ensureAiConfigInfrastructure,
  ensureDefaultProfileId,
  resolveAiConfigSecret,
} from "@/lib/ai-provider-profiles";
import {
  handleActionReorder,
  initializeActionRoute,
  prepareActionCreate,
  runActionWrite,
  validateRequiredActionFields,
  type CommonActionBody,
} from "@/lib/server/ai-action-route";
import { getAuthenticatedRoute, readJsonBody } from "@/lib/server/route-helpers";

interface AiActionRow {
  id: number;
  action_key: string;
  label: string;
  description: string;
  prompt: string;
  temperature: number;
  profile_id: number | null;
  sort_order: number;
  is_enabled: number;
  is_builtin: number;
}

interface TextActionBody extends CommonActionBody {
  temperature?: number;
}

async function initialize(req: NextRequest) {
  return initializeActionRoute(req, (db, env) =>
    ensureAiConfigInfrastructure(db, resolveAiConfigSecret(env)),
  );
}

export async function GET(req: NextRequest) {
  const route = await initialize(req);
  if (!route.ok) return route.response;
  const { results } = await route.db
    .prepare(
      "SELECT id, action_key, label, description, prompt, temperature, profile_id, sort_order, is_enabled, is_builtin FROM ai_actions ORDER BY sort_order ASC",
    )
    .all<AiActionRow>();
  return NextResponse.json({ actions: results });
}

export async function POST(req: NextRequest) {
  const route = await initialize(req);
  if (!route.ok) return route.response;
  const parsed = await readJsonBody<TextActionBody>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!validateRequiredActionFields(body)) {
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
  }

  const { profileId, sortOrder } = await prepareActionCreate(
    route.db,
    "ai_actions",
    body,
    ensureDefaultProfileId,
  );
  const duplicate = await runActionWrite(
    route.db,
    "ai_actions",
    "INSERT INTO ai_actions (action_key, label, description, prompt, temperature, profile_id, sort_order, is_builtin) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
    [
      body.action_key!,
      body.label!,
      body.description!,
      body.prompt!,
      Number.isFinite(body.temperature) ? Number(body.temperature) : 0.6,
      profileId,
      sortOrder,
    ],
  );
  return duplicate ?? NextResponse.json({ success: true });
}

export async function PUT(req: NextRequest) {
  const route = await initialize(req);
  if (!route.ok) return route.response;
  return handleActionReorder(req, route.db, "ai_actions");
}
