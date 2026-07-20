import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppCloudflareEnv: vi.fn(),
  authenticateRequest: vi.fn(),
  ensureAiImageConfigInfrastructure: vi.fn(),
  ensureDefaultImageProfileId: vi.fn(),
  run: vi.fn(),
}));

vi.mock("@/lib/cloudflare", () => ({
  getAppCloudflareEnv: mocks.getAppCloudflareEnv,
}));

vi.mock("@/lib/admin-auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

vi.mock("@/lib/ai-image-config", () => ({
  ensureAiImageConfigInfrastructure: mocks.ensureAiImageConfigInfrastructure,
  ensureDefaultImageProfileId: mocks.ensureDefaultImageProfileId,
}));

import { POST } from "@/app/api/admin/ai-image-actions/route";
import { PUT } from "@/app/api/admin/ai-image-actions/[id]/route";

// Chainable D1 stub. POST reads MAX(sort_order); PUT first SELECTs the current row
// (must be non-null or it 404s before reaching the UNIQUE catch), then UPDATEs.
function makeDb() {
  return {
    prepare: (sql: string) => ({
      bind: () => ({
        run: () => mocks.run(),
        first: async () =>
          /MAX\(sort_order\)/.test(sql)
            ? { max_sort: 20 }
            : { id: 7, aspect_ratio: "auto", resolution: "2k", size: "", quality: "" },
      }),
      first: async () => (/MAX\(sort_order\)/.test(sql) ? { max_sort: 20 } : null),
    }),
  };
}

function makeRequest(body: unknown) {
  return { json: async () => body } as never;
}

const duplicateError = new Error(
  "D1_ERROR: UNIQUE constraint failed: ai_image_actions.action_key: SQLITE_CONSTRAINT_UNIQUE",
);

const branches = [
  {
    name: "POST (create)",
    invoke: () =>
      POST(
        makeRequest({
          action_key: "cover",
          label: "封面",
          description: "生成封面",
          prompt: "画一张封面",
        }),
      ),
  },
  {
    name: "PUT (update)",
    invoke: () =>
      PUT(makeRequest({ action_key: "cover" }), {
        params: Promise.resolve({ id: "7" }),
      }),
  },
] as const;

describe("/api/admin/ai-image-actions — UNIQUE constraint handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: makeDb() });
    mocks.authenticateRequest.mockResolvedValue(true);
    mocks.ensureAiImageConfigInfrastructure.mockResolvedValue(undefined);
    mocks.ensureDefaultImageProfileId.mockResolvedValue(1);
  });

  for (const branch of branches) {
    describe(branch.name, () => {
      it("returns 409 when D1 reports a duplicate action_key", async () => {
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
