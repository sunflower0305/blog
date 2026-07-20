"use client";

/* eslint-disable @next/next/no-img-element */

import { Check, ChevronDown, ChevronUp, History, Image as ImageIcon, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getAiImageAspectRatioLabel, getAiImageResolutionLabel } from "@/lib/ai-image-options";
import type { GeneratedImageResult, ImageHistoryItem } from "@/lib/image-generation-types";

function formatHistoryTime(timestamp: number) {
  try {
    return new Date(timestamp).toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

interface ImageGenerationResultPanelProps {
  generating: boolean;
  historyItems: ImageHistoryItem[];
  historyOpen: boolean;
  onClose: () => void;
  onHistoryOpenChange: (open: boolean) => void;
  onInsert: (imageUrl: string, alt: string, placementMode: "insert" | "replace") => void;
  onResultChange: (result: GeneratedImageResult) => void;
  placementMode: "insert" | "replace";
  result: GeneratedImageResult | null;
}

export function ImageGenerationResultPanel({
  generating,
  historyItems,
  historyOpen,
  onClose,
  onHistoryOpenChange,
  onInsert,
  onResultChange,
  placementMode,
  result,
}: ImageGenerationResultPanelProps) {
  const [showRevisedPrompt, setShowRevisedPrompt] = useState(false);

  useEffect(() => {
    setShowRevisedPrompt(false);
  }, [result?.url]);

  return (
    <div className="min-h-0">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--editor-line)] px-5 py-4">
          <div className="text-xs font-medium text-[var(--editor-muted)]">
            {historyOpen ? "最近生成" : "生成结果"}
          </div>
          {historyItems.length > 0 ? (
            <button
              type="button"
              onClick={() => onHistoryOpenChange(!historyOpen)}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--editor-line)] px-2.5 py-1 text-xs text-[var(--editor-ink)] transition hover:bg-[var(--editor-soft)]"
            >
              <History className="h-3.5 w-3.5" />
              {historyOpen ? "返回结果" : "最近生成"}
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {historyOpen && historyItems.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {historyItems.map((item) => (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-[var(--editor-line)] bg-[var(--background)]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onResultChange(item.image);
                      onHistoryOpenChange(false);
                      setShowRevisedPrompt(false);
                    }}
                    className="block w-full"
                  >
                    <img
                      src={item.image.variants?.content || item.image.url}
                      alt={item.image.alt}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  </button>
                  <div className="space-y-2 px-3 py-3">
                    <div className="line-clamp-2 text-sm font-medium text-[var(--editor-ink)]">
                      {item.promptLabel}
                    </div>
                    <div className="text-[11px] leading-5 text-[var(--editor-muted)]">
                      {item.contextPreview || "来自最近生成"}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[var(--editor-muted)]">
                        {formatHistoryTime(item.createdAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onInsert(item.image.url, item.image.alt, placementMode)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--editor-line)] px-2.5 py-1.5 text-xs font-medium text-[var(--editor-ink)] transition hover:bg-[var(--editor-soft)]"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {placementMode === "replace" ? "替换" : "插入"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : generating ? (
            <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-[var(--editor-line)] bg-[var(--editor-soft)] text-sm text-[var(--editor-muted)]">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 正在生成图片…
              </div>
            </div>
          ) : result ? (
            <div className="flex h-full min-h-0 flex-col gap-4">
              <div className="overflow-hidden rounded-2xl border border-[var(--editor-line)] bg-[var(--background)]">
                <img
                  src={result.variants?.content || result.url}
                  alt={result.alt}
                  className="h-auto w-full object-cover"
                />
              </div>
              <div className="rounded-2xl border border-[var(--editor-line)] bg-[var(--editor-soft)] px-4 py-4">
                <div className="text-xs font-medium text-[var(--editor-muted)]">ALT</div>
                <div className="mt-1 text-sm leading-6 text-[var(--editor-ink)]">{result.alt}</div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--editor-muted)]">
                  <span className="rounded-full bg-[var(--background)] px-2.5 py-1">
                    比例：{getAiImageAspectRatioLabel(result.aspectRatio)}
                  </span>
                  <span className="rounded-full bg-[var(--background)] px-2.5 py-1">
                    分辨率：{getAiImageResolutionLabel(result.resolution)}
                  </span>
                  <span className="rounded-full bg-[var(--background)] px-2.5 py-1">
                    模型：{`${result.profileName} · ${result.model}`}
                  </span>
                </div>
                {result.revisedPrompt ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setShowRevisedPrompt((value) => !value)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--editor-muted)] transition hover:text-[var(--editor-ink)]"
                    >
                      {showRevisedPrompt ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      查看模型润色后的提示词
                    </button>
                    {showRevisedPrompt ? (
                      <div className="mt-2 whitespace-pre-wrap rounded-xl border border-[var(--editor-line)] bg-[var(--background)] px-3 py-3 text-xs leading-6 text-[var(--editor-ink)]">
                        {result.revisedPrompt}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="mt-auto flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-[var(--editor-line)] px-4 py-2 text-sm text-[var(--editor-ink)] transition hover:bg-[var(--editor-soft)]"
                >
                  关闭
                </button>
                <button
                  type="button"
                  onClick={() => onInsert(result.url, result.alt, placementMode)}
                  className="rounded-xl bg-[var(--editor-accent)] px-4 py-2 text-sm font-semibold text-[var(--editor-accent-ink)] transition hover:brightness-105"
                >
                  {placementMode === "replace" ? "替换当前图" : "插入正文"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-[var(--editor-line)]/70 bg-[var(--editor-soft)]/35">
              <div className="flex flex-col items-center gap-3 text-[var(--editor-muted)] opacity-60">
                <ImageIcon className="h-11 w-11" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
