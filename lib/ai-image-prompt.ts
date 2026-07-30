import {
  buildAspectRatioPromptHint,
  buildResolutionPromptHint,
  deriveLegacyQualityFromResolution,
  deriveLegacySizeFromAspectRatio,
} from "@/lib/ai-image-options";

export interface FinalImagePromptOptions {
  actionPrompt?: string;
  userPrompt?: string;
  articleTitle?: string;
  contextText?: string;
  aspectRatio?: string;
  resolution?: string;
}

function buildContextText(articleTitle?: string, contextText?: string) {
  const sections: string[] = [];
  const normalizedTitle = (articleTitle || "").trim();
  const normalizedContext = (contextText || "").trim();

  if (normalizedTitle) sections.push(`文章标题：${normalizedTitle}`);
  if (normalizedContext) sections.push(`当前位置上下文：${normalizedContext.slice(0, 500)}`);

  return sections.join("\n");
}

function buildUserFacingPrompt(userPrompt?: string, articleTitle?: string, contextText?: string) {
  const normalizedPrompt = (userPrompt || "").trim();
  if (normalizedPrompt) return normalizedPrompt;
  return buildContextText(articleTitle, contextText);
}

export function buildFinalImagePrompt(options: FinalImagePromptOptions) {
  const { actionPrompt, userPrompt, articleTitle, contextText, aspectRatio, resolution } = options;
  const contentPrompt = buildUserFacingPrompt(userPrompt, articleTitle, contextText);
  if (!contentPrompt) {
    throw new Error("请输入图片主题，或在正文中提供足够的上下文");
  }

  const sections = [];
  if (actionPrompt?.trim()) sections.push(actionPrompt.trim());
  sections.push(`主题与内容：\n${contentPrompt}`);

  const context = buildContextText(articleTitle, contextText);
  if (context && context !== contentPrompt) {
    sections.push(
      `补充上下文（仅用于理解主题，不要把这些文字直接渲染进图片，除非用户明确要求）：\n${context}`,
    );
  }

  const aspectRatioHint = buildAspectRatioPromptHint(aspectRatio);
  if (aspectRatioHint) sections.push(`构图比例要求：\n${aspectRatioHint}`);

  const resolutionHint = buildResolutionPromptHint(resolution);
  if (resolutionHint) sections.push(`输出精度偏好：\n${resolutionHint}`);

  sections.push(
    "输出要求：构图完整、主题清晰、适合中文文章配图。除非用户明确要求，不要在图片中加入可读文字、logo、签名或水印；如果当前模型不支持精确比例或分辨率，请优先遵守构图比例意图与细节等级。",
  );
  return sections.join("\n\n");
}

export function buildAltText(
  revisedPrompt: string,
  userPrompt?: string,
  articleTitle?: string,
  fallbackLabel?: string,
) {
  const candidate =
    revisedPrompt.trim() ||
    (userPrompt || "").trim() ||
    (articleTitle || "").trim() ||
    fallbackLabel ||
    "AI 生成配图";
  return candidate.slice(0, 120);
}

export function resolveRequestedSize(aspectRatio?: string, legacySize?: string) {
  return deriveLegacySizeFromAspectRatio(aspectRatio, legacySize);
}

export function resolveRequestedQuality(resolution?: string, legacyQuality?: string) {
  return deriveLegacyQualityFromResolution(resolution, legacyQuality);
}
