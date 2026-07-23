"use client";

import type { Editor } from "@tiptap/core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { buildAutoDescription, normalizePostSlug } from "@/lib/post-utils";

export type SaveState = "saved" | "dirty" | "saving" | "error";

export interface DraftMetaState {
  editSlug: string | null;
  slug: string;
  category: string;
  tags: string[];
  description: string;
  coverImage: string;
}

interface AutosaveOptions extends DraftMetaState {
  draftReady: boolean;
  editorRef: RefObject<Editor | null>;
  latestTitleRef: RefObject<string>;
  setEditSlug: Dispatch<SetStateAction<string | null>>;
  setSlug: Dispatch<SetStateAction<string>>;
  slugInputFocusedRef: RefObject<boolean>;
}

interface DraftSnapshotPayload {
  currentSlug: string | null;
  nextSlug: string;
  title: string;
  html: string;
  description: string;
  category: string;
  tags: string[];
  coverImage: string;
}

interface DraftRequestPayload {
  title: string;
  html: string;
  content: string;
  description: string;
  category: string;
  tags: string[];
  cover_image: string;
}

const AUTOSAVE_DEBOUNCE_MS = 1500;
const AUTOSAVE_MAX_RETRY_DELAY_MS = 10000;

export function buildAutosaveSnapshot(payload: DraftSnapshotPayload) {
  return JSON.stringify(payload);
}

async function persistDraftRequest(
  currentSlug: string | null,
  nextSlug: string,
  payload: DraftRequestPayload,
  signal: AbortSignal,
) {
  const editing = Boolean(currentSlug);
  const response = await fetch("/api/posts", {
    method: editing ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      editing
        ? {
            current_slug: currentSlug,
            new_slug: nextSlug && nextSlug !== currentSlug ? nextSlug : undefined,
            ...payload,
          }
        : { ...payload, status: "draft" },
    ),
    signal,
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string; slug?: string };
  if (!response.ok) throw new Error(data.error || "自动保存失败");
  return data;
}

function readEditorDraft(editor: Editor, title: string, meta: DraftMetaState) {
  const normalizedTitle = title.trim() || "无标题";
  const html = editor.getHTML();
  const plainText = editor.getText({ blockSeparator: "\n\n" }).trim();
  const hasMedia = /<(img|video|audio|iframe)\b/i.test(html);
  const description = (meta.description || buildAutoDescription(plainText) || "").trim();
  return {
    hasMeaningfulContent: Boolean(title.trim() || plainText || hasMedia),
    nextSlug: normalizePostSlug(meta.slug),
    snapshot: buildAutosaveSnapshot({
      currentSlug: meta.editSlug,
      nextSlug: normalizePostSlug(meta.slug),
      title: normalizedTitle,
      html,
      description,
      category: meta.category,
      tags: meta.tags,
      coverImage: meta.coverImage,
    }),
    request: {
      title: normalizedTitle,
      html,
      content: plainText || JSON.stringify(editor.getJSON()),
      description,
      category: meta.category,
      tags: meta.tags,
      cover_image: meta.coverImage,
    },
  };
}

function canPersistDraft(draftReady: boolean, editor: Editor | null): editor is Editor {
  return typeof window !== "undefined" && draftReady && Boolean(editor);
}

export function usePostEditorAutosave(options: AutosaveOptions) {
  const {
    category,
    coverImage,
    description,
    draftReady,
    editSlug,
    editorRef,
    latestTitleRef,
    setEditSlug,
    setSlug,
    slug,
    slugInputFocusedRef,
    tags,
  } = options;
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState(Date.now());
  const draftSaveTimerRef = useRef<number | null>(null);
  const retrySaveTimerRef = useRef<number | null>(null);
  const autosaveAbortRef = useRef<AbortController | null>(null);
  const autosaveSeqRef = useRef(0);
  const lastAutosaveSnapshotRef = useRef<string | null>(null);
  const latestMetaRef = useRef<DraftMetaState>({
    editSlug,
    slug,
    category,
    tags,
    description,
    coverImage,
  });

  useEffect(() => {
    latestMetaRef.current = { editSlug, slug, category, tags, description, coverImage };
  }, [editSlug, slug, category, tags, description, coverImage]);

  const clearAutosaveTimers = useCallback(() => {
    if (draftSaveTimerRef.current !== null) window.clearTimeout(draftSaveTimerRef.current);
    if (retrySaveTimerRef.current !== null) window.clearTimeout(retrySaveTimerRef.current);
    draftSaveTimerRef.current = null;
    retrySaveTimerRef.current = null;
  }, []);

  const abortAutosaveRequest = useCallback(() => {
    autosaveAbortRef.current?.abort();
    autosaveAbortRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearAutosaveTimers();
      abortAutosaveRequest();
    };
  }, [abortAutosaveRequest, clearAutosaveTimers]);

  const syncPersistedSlug = useCallback(
    (persistedSlug: string, previousSlug: string | null, forceVisibleSync = false) => {
      const shouldSyncVisibleSlug =
        forceVisibleSync ||
        !slugInputFocusedRef.current ||
        latestMetaRef.current.slug === persistedSlug;
      latestMetaRef.current = {
        ...latestMetaRef.current,
        editSlug: persistedSlug,
        slug: shouldSyncVisibleSlug ? persistedSlug : latestMetaRef.current.slug,
      };
      setEditSlug(persistedSlug);
      if (shouldSyncVisibleSlug) setSlug(persistedSlug);
      if (persistedSlug !== previousSlug) {
        window.history.replaceState({}, "", `/editor?edit=${encodeURIComponent(persistedSlug)}`);
      }
    },
    [setEditSlug, setSlug, slugInputFocusedRef],
  );

  const persistDraft = useCallback(
    async (nextTitle = latestTitleRef.current, editor = editorRef.current, retryAttempt = 0) => {
      if (!canPersistDraft(draftReady, editor)) return;
      const draft = readEditorDraft(editor, nextTitle, latestMetaRef.current);
      if (!draft.hasMeaningfulContent || draft.snapshot === lastAutosaveSnapshotRef.current) {
        setSaveState("saved");
        return;
      }

      const requestId = ++autosaveSeqRef.current;
      abortAutosaveRequest();
      const controller = new AbortController();
      autosaveAbortRef.current = controller;
      setSaveState("saving");

      try {
        const currentSlug = latestMetaRef.current.editSlug;
        const data = await persistDraftRequest(
          currentSlug,
          draft.nextSlug,
          draft.request,
          controller.signal,
        );
        if (requestId !== autosaveSeqRef.current) return;
        const persistedSlug = data.slug || currentSlug;
        if (persistedSlug) syncPersistedSlug(persistedSlug, currentSlug, !currentSlug);
        lastAutosaveSnapshotRef.current = draft.snapshot;
        setSaveState("saved");
        setLastSavedAt(Date.now());
      } catch (error) {
        if (controller.signal.aborted || requestId !== autosaveSeqRef.current) return;
        console.error("Auto-save failed:", error);
        setSaveState("error");
        const delay = Math.min(AUTOSAVE_MAX_RETRY_DELAY_MS, 2000 * 2 ** retryAttempt);
        retrySaveTimerRef.current = window.setTimeout(() => {
          if (editorRef.current)
            void persistDraft(latestTitleRef.current, editorRef.current, retryAttempt + 1);
        }, delay);
      } finally {
        if (autosaveAbortRef.current === controller) autosaveAbortRef.current = null;
      }
    },
    [abortAutosaveRequest, draftReady, editorRef, latestTitleRef, syncPersistedSlug],
  );

  const scheduleDraftSave = useCallback(
    (nextTitle = latestTitleRef.current, editor = editorRef.current) => {
      if (typeof window === "undefined" || !draftReady || !editor) return;
      latestTitleRef.current = nextTitle;
      clearAutosaveTimers();
      setSaveState((previous) => (previous === "saving" ? previous : "dirty"));
      draftSaveTimerRef.current = window.setTimeout(
        () => void persistDraft(nextTitle, editor),
        AUTOSAVE_DEBOUNCE_MS,
      );
    },
    [clearAutosaveTimers, draftReady, editorRef, latestTitleRef, persistDraft],
  );

  const markDirty = useCallback(
    (overrides?: Partial<DraftMetaState>) => {
      if (overrides && Object.keys(overrides).length > 0) {
        latestMetaRef.current = { ...latestMetaRef.current, ...overrides };
      }
      scheduleDraftSave();
    },
    [scheduleDraftSave],
  );

  return {
    abortAutosaveRequest,
    buildAutosaveSnapshot,
    clearAutosaveTimers,
    lastAutosaveSnapshotRef,
    lastSavedAt,
    markDirty,
    saveState,
    scheduleDraftSave,
    setLastSavedAt,
    setSaveState,
    syncPersistedSlug,
  };
}
