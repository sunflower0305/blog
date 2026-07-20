"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Sparkles, X } from "lucide-react";
import { Dropdown } from "@/components/Dropdown";
import { ImageGenerationResultPanel } from "@/components/ImageGenerationResultPanel";
import { useToast } from "@/components/Toast";
import { startBackgroundTask } from "@/lib/client-background-task";
import {
  AI_IMAGE_ASPECT_RATIO_OPTIONS,
  AI_IMAGE_RESOLUTION_OPTIONS,
  type AIImageAspectRatio,
  type AIImageResolution,
} from "@/lib/ai-image-options";
import {
  DEFAULT_IMAGE_HISTORY_SCOPE,
  useImageGenerationHistory,
} from "@/lib/image-generation-history";
import type { GeneratedImageResult } from "@/lib/image-generation-types";

interface ImageActionItem {
  id: number;
  action_key: string;
  label: string;
  description: string;
  aspect_ratio: AIImageAspectRatio;
  resolution: AIImageResolution;
  size: string;
  profile_id: number | null;
}

interface ImageProfileItem {
  id: number;
  name: string;
  model: string;
  is_default: number;
}

const TEMPLATE_COLLAPSED_HEIGHT = 84;

interface ImageGenerationModalProps {
  open: boolean;
  contextText?: string;
  historyScope?: string;
  referenceImageUrl?: string;
  allowReplace?: boolean;
  defaultPlacementMode?: "insert" | "replace";
  closeOnGenerate?: boolean;
  generationMode?: "background" | "foreground";
  onClose: () => void;
  onInsert: (imageUrl: string, alt: string, placementMode?: "insert" | "replace") => void;
}

export function ImageGenerationModal({
  open,
  contextText = "",
  historyScope = DEFAULT_IMAGE_HISTORY_SCOPE,
  referenceImageUrl,
  allowReplace = false,
  defaultPlacementMode = "insert",
  closeOnGenerate = true,
  generationMode = "background",
  onClose,
  onInsert,
}: ImageGenerationModalProps) {
  const toast = useToast();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);

  const [actions, setActions] = useState<ImageActionItem[]>([]);
  const [profiles, setProfiles] = useState<ImageProfileItem[]>([]);
  const [selectedAction, setSelectedAction] = useState("");
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AIImageAspectRatio>("auto");
  const [selectedResolution, setSelectedResolution] = useState<AIImageResolution>("2k");
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<GeneratedImageResult | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [placementMode, setPlacementMode] = useState<"insert" | "replace">(defaultPlacementMode);
  const [templatesExpanded, setTemplatesExpanded] = useState(false);
  const [templatesOverflowing, setTemplatesOverflowing] = useState(false);

  const selectedActionConfig = useMemo(
    () => actions.find((item) => item.action_key === selectedAction) || null,
    [actions, selectedAction],
  );

  const contextPreview = useMemo(() => {
    return contextText.trim().slice(0, 240);
  }, [contextText]);

  const contextCharCount = useMemo(() => {
    return Array.from(contextText.trim()).length;
  }, [contextText]);

  const modelOptions = useMemo(() => {
    return profiles.map((profile) => ({
      value: String(profile.id),
      label: profile.name,
      title: profile.model,
      searchText: `${profile.name} ${profile.model}`,
    }));
  }, [profiles]);

  const canGenerate = Boolean(prompt.trim() || contextText.trim());
  const { historyItems, storeHistoryItem } = useImageGenerationHistory({
    contextText,
    historyScope,
    open,
    prompt,
    selectedActionLabel: selectedActionConfig?.label,
  });

  useEffect(() => {
    if (!open) return;

    const loadActions = async () => {
      try {
        const [actionsRes, profilesRes] = await Promise.all([
          fetch("/api/editor/ai-image-actions"),
          fetch("/api/admin/ai-image-provider"),
        ]);

        const actionData = (await actionsRes.json().catch(() => ({ actions: [] }))) as {
          actions?: ImageActionItem[];
        };
        const profileData = (await profilesRes
          .json()
          .catch(() => ({ profiles: [], default_profile_id: null }))) as {
          profiles?: ImageProfileItem[];
          default_profile_id?: number | null;
        };

        const nextActions = Array.isArray(actionData.actions) ? actionData.actions : [];
        const nextProfiles = Array.isArray(profileData.profiles) ? profileData.profiles : [];
        const nextDefaultProfileId = Number.isFinite(profileData.default_profile_id)
          ? Number(profileData.default_profile_id)
          : (nextProfiles.find((profile) => profile.is_default === 1)?.id ?? null);
        const fallbackProfileId = nextDefaultProfileId ?? nextProfiles[0]?.id ?? null;

        setActions(nextActions);
        setProfiles(nextProfiles);
        setSelectedAction("");
        setSelectedAspectRatio("auto");
        setSelectedResolution("2k");
        setSelectedProfileId(fallbackProfileId);
      } catch {
        setActions([]);
        setProfiles([]);
        setSelectedAction("");
        setSelectedAspectRatio("auto");
        setSelectedResolution("2k");
        setSelectedProfileId(null);
      }
    };

    void loadActions();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      setError("");
      setResult(null);
      setShowContext(false);
      setHistoryOpen(false);
      setGenerating(false);
      setSelectedAction("");
      setSelectedAspectRatio("auto");
      setSelectedResolution("2k");
      setPlacementMode(defaultPlacementMode);
      setTemplatesExpanded(false);
    });
    const timer = window.setTimeout(() => promptRef.current?.focus(), 50);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [defaultPlacementMode, open, referenceImageUrl]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    const measureTemplates = () => {
      const node = templatesRef.current;
      if (!node) return;
      setTemplatesOverflowing(node.scrollHeight > TEMPLATE_COLLAPSED_HEIGHT + 2);
    };

    const frame = window.requestAnimationFrame(measureTemplates);
    window.addEventListener("resize", measureTemplates);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measureTemplates);
    };
  }, [actions, open]);

  const requestImage = useCallback(async () => {
    const res = await fetch("/api/editor/ai-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: selectedAction || "custom",
        prompt: prompt.trim(),
        contextText: contextText.trim(),
        aspectRatio: selectedAspectRatio,
        resolution: selectedResolution,
        profileId: selectedProfileId,
        referenceImageUrl,
        inputFidelity: referenceImageUrl ? "high" : undefined,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      image?: GeneratedImageResult;
    };

    if (!res.ok || !data.image) {
      throw new Error(data.error || "图片生成失败");
    }

    return data.image;
  }, [
    contextText,
    prompt,
    referenceImageUrl,
    selectedAction,
    selectedAspectRatio,
    selectedProfileId,
    selectedResolution,
  ]);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || generating) return;

    setError("");
    setResult(null);
    setHistoryOpen(false);

    if (closeOnGenerate) {
      onClose();
    }

    if (generationMode === "background") {
      setGenerating(true);

      startBackgroundTask({
        toast,
        errorPrefix: "图片生成失败",
        run: requestImage,
        onSuccess: (image) => {
          storeHistoryItem(image);
          if (!closeOnGenerate) {
            setResult(image);
          }
        },
        onError: (message) => {
          if (!closeOnGenerate) {
            setError(message);
          }
        },
        onSettled: () => {
          setGenerating(false);
        },
      });
      return;
    }

    try {
      setGenerating(true);
      const image = await requestImage();
      storeHistoryItem(image);
      setResult(image);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "图片生成失败");
    } finally {
      setGenerating(false);
    }
  }, [
    canGenerate,
    closeOnGenerate,
    generating,
    generationMode,
    onClose,
    requestImage,
    storeHistoryItem,
    toast,
  ]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/45 px-3 py-3 sm:px-4 sm:py-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-full items-center justify-center">
        <div className="flex w-full max-w-5xl max-h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-[28px] border border-[var(--editor-line)] bg-[var(--editor-panel)] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--editor-line)] px-5 py-4">
            <div className="min-w-0">
              <div className="text-base font-semibold text-[var(--editor-ink)]">生成图片</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--editor-muted)] transition hover:bg-[var(--editor-soft)] hover:text-[var(--editor-ink)]"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div className="min-h-0 border-b border-[var(--editor-line)] lg:border-b-0 lg:border-r">
              <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-[var(--editor-muted)]">画面描述</div>
                    <div className="relative">
                      <div className="pointer-events-none absolute left-3 top-3">
                        <Sparkles className="h-4 w-4 text-[var(--editor-accent)]" />
                      </div>
                      <textarea
                        ref={promptRef}
                        rows={3}
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder="例如：一个在暴雨里抬头看霓虹灯牌的孤独程序员，Mondo 风格，但不要在图里放文字"
                        className="w-full rounded-2xl border border-[var(--editor-line)] bg-[var(--background)] px-3 py-3 pl-10 text-sm leading-6 text-[var(--editor-ink)] outline-none focus:border-[var(--editor-accent)] focus:ring-1 focus:ring-[var(--editor-accent)]"
                      />
                    </div>
                  </div>

                  {referenceImageUrl ? (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-[var(--editor-muted)]">参考图片</div>
                      <div className="overflow-hidden rounded-2xl border border-[var(--editor-line)] bg-[var(--background)]">
                        <img
                          src={referenceImageUrl}
                          alt="参考图片"
                          className="aspect-[4/3] w-full object-cover"
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-[var(--editor-muted)]">快捷模板</div>
                    <div
                      ref={templatesRef}
                      className={`flex flex-wrap gap-2 overflow-hidden pb-1 ${templatesExpanded ? "" : "max-h-[84px]"}`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedAction("custom")}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${
                          selectedAction === "custom"
                            ? "border-[var(--editor-accent)] bg-[var(--editor-accent)]/10 text-[var(--editor-accent)]"
                            : "border-[var(--editor-line)] text-[var(--editor-ink)] hover:bg-[var(--editor-soft)]"
                        }`}
                      >
                        自定义
                      </button>
                      {actions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => {
                            setSelectedAction(action.action_key);
                            setSelectedAspectRatio(action.aspect_ratio || "auto");
                            setSelectedResolution(action.resolution || "2k");
                          }}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${
                            selectedAction === action.action_key
                              ? "border-[var(--editor-accent)] bg-[var(--editor-accent)]/10 text-[var(--editor-accent)]"
                              : "border-[var(--editor-line)] text-[var(--editor-ink)] hover:bg-[var(--editor-soft)]"
                          }`}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                    {templatesOverflowing ? (
                      <button
                        type="button"
                        onClick={() => setTemplatesExpanded((value) => !value)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--editor-muted)] transition hover:text-[var(--editor-ink)]"
                      >
                        {templatesExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        {templatesExpanded ? "收起模板" : "展开模板"}
                      </button>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-[var(--editor-line)] bg-[var(--editor-soft)]/60 p-4">
                    <div className="mb-3 text-xs font-medium text-[var(--editor-muted)]">
                      生成设置
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--editor-muted)]">
                          图片比例
                        </label>
                        <select
                          value={selectedAspectRatio}
                          onChange={(event) =>
                            setSelectedAspectRatio(event.target.value as AIImageAspectRatio)
                          }
                          className="w-full rounded-xl border border-[var(--editor-line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--editor-ink)] outline-none focus:border-[var(--editor-accent)]"
                        >
                          {AI_IMAGE_ASPECT_RATIO_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--editor-muted)]">
                          分辨率
                        </label>
                        <select
                          value={selectedResolution}
                          onChange={(event) =>
                            setSelectedResolution(event.target.value as AIImageResolution)
                          }
                          className="w-full rounded-xl border border-[var(--editor-line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--editor-ink)] outline-none focus:border-[var(--editor-accent)]"
                        >
                          {AI_IMAGE_RESOLUTION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--editor-muted)]">
                          模型
                        </label>
                        <Dropdown
                          options={modelOptions}
                          value={selectedProfileId ? String(selectedProfileId) : ""}
                          onChange={(value) => {
                            setSelectedProfileId(value ? Number(value) : null);
                          }}
                          placeholder="搜索并选择图片模型"
                          menuPlacement="top"
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>

                  {allowReplace ? (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-[var(--editor-muted)]">
                        生成后动作
                      </div>
                      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[var(--editor-soft)] p-1">
                        <button
                          type="button"
                          onClick={() => setPlacementMode("replace")}
                          className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                            placementMode === "replace"
                              ? "bg-[var(--editor-panel)] text-[var(--editor-ink)] shadow-sm"
                              : "text-[var(--editor-muted)] hover:text-[var(--editor-ink)]"
                          }`}
                        >
                          替换当前图
                        </button>
                        <button
                          type="button"
                          onClick={() => setPlacementMode("insert")}
                          className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                            placementMode === "insert"
                              ? "bg-[var(--editor-panel)] text-[var(--editor-ink)] shadow-sm"
                              : "text-[var(--editor-muted)] hover:text-[var(--editor-ink)]"
                          }`}
                        >
                          插入新图
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {contextPreview ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowContext((value) => !value)}
                        className="flex w-full items-start justify-between gap-3 rounded-2xl border border-[var(--editor-line)] bg-[var(--background)] px-4 py-3 text-left transition hover:bg-[var(--editor-soft)]/50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-medium text-[var(--editor-muted)]">
                              选中文本
                            </div>
                            <div className="shrink-0 text-[11px] text-[var(--editor-muted)]">
                              {contextCharCount} 字
                            </div>
                          </div>
                          <div className="mt-1 text-sm text-[var(--editor-ink)] line-clamp-2">
                            {contextPreview}
                          </div>
                        </div>
                        {showContext ? (
                          <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-[var(--editor-muted)]" />
                        ) : (
                          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-[var(--editor-muted)]" />
                        )}
                      </button>
                      {showContext ? (
                        <pre className="whitespace-pre-wrap rounded-2xl border border-[var(--editor-line)] bg-[var(--editor-soft)] px-4 py-3 text-xs leading-6 text-[var(--editor-ink)]">
                          {contextPreview}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-[var(--editor-line)] px-5 py-4">
                  {error ? (
                    <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {error}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => void handleGenerate()}
                      disabled={!canGenerate || generating}
                      className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[var(--editor-accent)] px-4 py-2 text-sm font-semibold text-[var(--editor-accent-ink)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {generating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {result ? "重新生成" : "开始生成"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <ImageGenerationResultPanel
              generating={generating}
              historyItems={historyItems}
              historyOpen={historyOpen}
              onClose={onClose}
              onHistoryOpenChange={setHistoryOpen}
              onInsert={onInsert}
              onResultChange={setResult}
              placementMode={placementMode}
              result={result}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
