"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  appendStoredHistoryItem,
  LOCAL_HISTORY_UPDATED_EVENT,
  readStoredHistory,
} from "@/lib/client-background-task";
import type { GeneratedImageResult, ImageHistoryItem } from "@/lib/image-generation-types";

const MAX_HISTORY_ITEMS = 12;
export const DEFAULT_IMAGE_HISTORY_SCOPE = "default";

export function createImageHistoryStorageKey(scope: string) {
  return `blog:ai-image-history:${scope || DEFAULT_IMAGE_HISTORY_SCOPE}`;
}

interface UseImageGenerationHistoryOptions {
  contextText: string;
  historyScope: string;
  open: boolean;
  prompt: string;
  selectedActionLabel?: string;
}

export function useImageGenerationHistory({
  contextText,
  historyScope,
  open,
  prompt,
  selectedActionLabel,
}: UseImageGenerationHistoryOptions) {
  const [historyItems, setHistoryItems] = useState<ImageHistoryItem[]>([]);
  const historyStorageKey = useMemo(
    () => createImageHistoryStorageKey(historyScope),
    [historyScope],
  );

  const syncHistoryItems = useCallback(() => {
    setHistoryItems(
      readStoredHistory<ImageHistoryItem>(historyStorageKey).slice(0, MAX_HISTORY_ITEMS),
    );
  }, [historyStorageKey]);

  const storeHistoryItem = useCallback(
    (image: GeneratedImageResult) => {
      const promptLabel = prompt.trim() || selectedActionLabel || image.actionLabel || "自定义生成";

      appendStoredHistoryItem<ImageHistoryItem>(
        historyStorageKey,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          image,
          promptLabel,
          contextPreview: contextText.trim().slice(0, 120),
          createdAt: Date.now(),
        },
        {
          maxItems: MAX_HISTORY_ITEMS,
          dedupe: (candidate, existing) => existing.image.url === candidate.image.url,
        },
      );
    },
    [contextText, historyStorageKey, prompt, selectedActionLabel],
  );

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(syncHistoryItems);
    return () => window.cancelAnimationFrame(frame);
  }, [open, syncHistoryItems]);

  useEffect(() => {
    const handleHistoryUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ storageKey?: string; items?: ImageHistoryItem[] }>)
        .detail;
      if (detail?.storageKey !== historyStorageKey || !Array.isArray(detail.items)) return;
      setHistoryItems(detail.items.slice(0, MAX_HISTORY_ITEMS));
    };

    window.addEventListener(LOCAL_HISTORY_UPDATED_EVENT, handleHistoryUpdated);
    return () => window.removeEventListener(LOCAL_HISTORY_UPDATED_EVENT, handleHistoryUpdated);
  }, [historyStorageKey]);

  return { historyItems, storeHistoryItem };
}
