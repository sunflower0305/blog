"use client";

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

interface Options {
  draftReady: boolean;
  editSlug: string | null;
  handleSave: () => Promise<void>;
  publishPanelOpen: boolean;
  publishPanelRef: RefObject<HTMLDivElement | null>;
  setDraftReady: Dispatch<SetStateAction<boolean>>;
  setPublishPanelOpen: Dispatch<SetStateAction<boolean>>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setTick: Dispatch<SetStateAction<number>>;
  sidebarOpen: boolean;
  titleRef: RefObject<HTMLTextAreaElement | null>;
}

const SIDEBAR_KEY = "blog:sidebar-open";

export function usePostEditorLifecycle(options: Options) {
  useEffect(() => {
    options.setDraftReady(true);
    options.setSidebarOpen(window.localStorage.getItem(SIDEBAR_KEY) === "true");
  }, [options.setDraftReady, options.setSidebarOpen]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_KEY, String(options.sidebarOpen));
  }, [options.sidebarOpen]);

  useEffect(() => {
    const id = window.setInterval(() => options.setTick((tick) => tick + 1), 30000);
    return () => clearInterval(id);
  }, [options.setTick]);

  useEffect(() => {
    if (options.draftReady && !options.editSlug) options.titleRef.current?.focus();
  }, [options.draftReady, options.editSlug, options.titleRef]);

  useEffect(() => {
    if (!options.publishPanelOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (!options.publishPanelRef.current?.contains(event.target as Node)) {
        options.setPublishPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [options.publishPanelOpen, options.publishPanelRef, options.setPublishPanelOpen]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        void options.handleSave();
      }
      if (event.key === "Escape") options.setPublishPanelOpen(false);
    };
    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, [options.handleSave, options.setPublishPanelOpen]);
}
