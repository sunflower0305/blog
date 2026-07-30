import { NextRequest, NextResponse } from "next/server";
import {
  ensureAiConfigInfrastructure,
  ensureDefaultProfileId,
  resolveAiConfigSecret,
} from "@/lib/ai-provider-profiles";
import {
  handleActionReorder,
  initializeActionRoute,
  createAction,
  readValidActionBody,
  type CommonActionBody,
} from "@/lib/server/ai-action-route";

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
  const parsed = await readValidActionBody<TextActionBody>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  return createAction({
    db: route.db,
    table: "ai_actions",
    body,
    ensureDefaultId: ensureDefaultProfileId,
    extraColumns: ["temperature"],
    extraValues: [Number.isFinite(body.temperature) ? Number(body.temperature) : 0.6],
  });
}

export async function PUT(req: NextRequest) {
  const route = await initialize(req);
  if (!route.ok) return route.response;
  return handleActionReorder(req, route.db, "ai_actions");
}
