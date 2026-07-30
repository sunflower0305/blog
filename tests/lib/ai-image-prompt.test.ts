import { describe, expect, it } from "vitest";

import {
  buildAltText,
  buildFinalImagePrompt,
  resolveRequestedQuality,
  resolveRequestedSize,
} from "@/lib/ai-image-prompt";

describe("buildFinalImagePrompt", () => {
  it("combines action, user content, context, aspect ratio, and resolution", () => {
    const prompt = buildFinalImagePrompt({
      actionPrompt: "  使用杂志插画风格  ",
      userPrompt: "一座未来城市",
      articleTitle: "未来生活",
      contextText: "机器人与人类在街头协作",
      aspectRatio: "16:9",
      resolution: "2k",
    });

    expect(prompt).toContain("使用杂志插画风格");
    expect(prompt).toContain("主题与内容：\n一座未来城市");
    expect(prompt).toContain("补充上下文");
    expect(prompt).toContain("文章标题：未来生活");
    expect(prompt).toContain("构图比例要求");
    expect(prompt).toContain("输出精度偏好");
    expect(prompt).toContain("不要在图片中加入可读文字");
  });

  it("uses article context when the user prompt is absent", () => {
    const prompt = buildFinalImagePrompt({
      articleTitle: "春日散步",
      contextText: "河边的柳树刚刚发芽",
    });
    expect(prompt).toContain("主题与内容：\n文章标题：春日散步");
    expect(prompt).not.toContain("补充上下文");
  });

  it("rejects an empty subject", () => {
    expect(() => buildFinalImagePrompt({})).toThrow("请输入图片主题");
  });
});

describe("image prompt metadata", () => {
  it("chooses alt text fallbacks in priority order and truncates long text", () => {
    expect(buildAltText("revised", "user", "title", "label")).toBe("revised");
    expect(buildAltText("", "user", "title", "label")).toBe("user");
    expect(buildAltText("", "", "title", "label")).toBe("title");
    expect(buildAltText("", "", "", "label")).toBe("label");
    expect(buildAltText("")).toBe("AI 生成配图");
    expect(buildAltText("x".repeat(140))).toHaveLength(120);
  });

  it("maps modern options to legacy provider parameters", () => {
    expect(resolveRequestedSize("16:9", "1024x1024")).toBe("1536x1024");
    expect(resolveRequestedQuality("4k", "low")).toBe("high");
  });
});
