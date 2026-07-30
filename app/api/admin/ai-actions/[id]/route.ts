import { NextRequest, NextResponse } from "next/server";
import {
  ensureAiConfigInfrastructure,
  ensureDefaultProfileId,
  resolveAiConfigSecret,
} from "@/lib/ai-provider-profiles";
import {
  appendCommonActionUpdates,
  appendProfileUpdate,
  finishActionUpdate,
  handleActionDelete,
  initializeActionRoute,
  type CommonActionBody,
  type SqlValue,
} from "@/lib/server/ai-action-route";
import { readJsonBody } from "@/lib/server/route-helpers";

interface TextActionBody extends CommonActionBody {
  temperature?: number;
}

async function initialize(req: NextRequest) {
  return initializeActionRoute(req, (db, env) =>
    ensureAiConfigInfrastructure(db, resolveAiConfigSecret(env)),
  );
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const route = await initialize(req);
  if (!route.ok) return route.response;
  const parsed = await readJsonBody<TextActionBody>(req);
  if (!parsed.ok) return parsed.response;

  const sets: string[] = [];
  const values: SqlValue[] = [];
  appendCommonActionUpdates(parsed.body, sets, values);
  if (Number.isFinite(parsed.body.temperature)) {
    sets.push("temperature = ?");
    values.push(Number(parsed.body.temperature));
  }
  await appendProfileUpdate(route.db, parsed.body.profile_id, ensureDefaultProfileId, sets, values);
  if (sets.length === 0) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  }

  return finishActionUpdate(route.db, "ai_actions", Number((await params).id), sets, values);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleActionDelete(req, params, "ai_actions", initialize);
}
