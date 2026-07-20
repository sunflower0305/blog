import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppCloudflareEnv: vi.fn(),
  authenticateRequest: vi.fn(),
  ensureAiConfigInfrastructure: vi.fn(),
  ensureDefaultProfileId: vi.fn(),
  resolveAiConfigSecret: vi.fn(),
  run: vi.fn(),
}));

vi.mock("@/lib/cloudflare", () => ({
  getAppCloudflareEnv: mocks.getAppCloudflareEnv,
}));

vi.mock("@/lib/admin-auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

vi.mock("@/lib/ai-provider-profiles", () => ({
  ensureAiConfigInfrastructure: mocks.ensureAiConfigInfrastructure,
  ensureDefaultProfileId: mocks.ensureDefaultProfileId,
  resolveAiConfigSecret: mocks.resolveAiConfigSecret,
}));

import { POST } from "@/app/api/admin/ai-actions/route";
import { PUT } from "@/app/api/admin/ai-actions/[id]/route";

// A chainable D1 stub: SELECT MAX(...) resolves a row, INSERT/UPDATE delegate to mocks.run.
function makeDb() {
  return {
    prepare: (sql: string) => ({
      bind: () => ({
        run: () => mocks.run(),
      }),
      first: async () => (/MAX\(sort_order\)/.test(sql) ? { max_sort: 20 } : null),
    }),
  };
}

function makeRequest(body: unknown) {
  return { json: async () => body } as never;
}

const duplicateError = new Error(
  "D1_ERROR: UNIQUE constraint failed: ai_actions.action_key: SQLITE_CONSTRAINT_UNIQUE",
);

// Each branch owns the same catch → 409 → rethrow shape but a distinct regex literal;
// exercising both guards each literal separately, since the bug proved they drift together.
const branches = [
  {
    name: "POST (create)",
    invoke: () =>
      POST(
        makeRequest({
          action_key: "summarize",
          label: "总结",
          description: "总结选中文本",
          prompt: "请总结：",
        }),
      ),
  },
  {
    name: "PUT (update)",
    invoke: () =>
      PUT(makeRequest({ action_key: "summarize" }), {
        params: Promise.resolve({ id: "7" }),
      }),
  },
] as const;

describe("/api/admin/ai-actions — UNIQUE constraint handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: makeDb() });
    mocks.authenticateRequest.mockResolvedValue(true);
    mocks.ensureAiConfigInfrastructure.mockResolvedValue(undefined);
    mocks.ensureDefaultProfileId.mockResolvedValue(1);
    mocks.resolveAiConfigSecret.mockReturnValue("secret");
  });

  for (const branch of branches) {
    describe(branch.name, () => {
      it("returns 409 when D1 reports a duplicate action_key", async () => {
        // The exact shape D1 raises — the regex must match this or the friendly 409 is lost.
        mocks.run.mockRejectedValue(duplicateError);

        const response = await branch.invoke();
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "操作标识已存在" });
      });

      it("rethrows unrelated DB errors instead of masking them as 409", async () => {
        mocks.run.mockRejectedValue(new Error("D1_ERROR: database is locked"));

        await expect(branch.invoke()).rejects.toThrow(/database is locked/);
      });

      it("succeeds when the write goes through", async () => {
        mocks.run.mockResolvedValue({ success: true });

        const response = await branch.invoke();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
      });
    });
  }
});
