import { describe, expect, it } from "vitest";
import { readJsonBody } from "@/lib/server/route-helpers";

function makeRequest(json: () => Promise<unknown>) {
  return { json } as never;
}

describe("readJsonBody", () => {
  it("returns the parsed body on valid JSON", async () => {
    const result = await readJsonBody<{ name: string }>(
      makeRequest(async () => ({ name: "token" })),
    );
    expect(result).toEqual({ ok: true, body: { name: "token" } });
  });

  it("returns a 400 response instead of throwing on invalid JSON", async () => {
    const result = await readJsonBody(
      makeRequest(async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({ error: "请求体不是有效 JSON" });
  });

  it("supports a custom invalid-body message", async () => {
    const result = await readJsonBody(
      makeRequest(async () => {
        throw new Error("boom");
      }),
      "自定义错误",
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(await result.response.json()).toEqual({ error: "自定义错误" });
  });
});
