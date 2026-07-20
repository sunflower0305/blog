"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useRef, useState, type RefObject } from "react";
import {
  COVER_IMAGE_OPTIMIZE_OPTIONS,
  EDITOR_IMAGE_OPTIMIZE_OPTIONS,
  optimizeImageForUpload,
} from "@/lib/client-image";
import {
  createUploadPlaceholderMarker,
  getEditorImageSourceUrl,
  insertUploadPlaceholder,
  insertUploadedFileIntoEditor,
  removeUploadPlaceholder,
  uploadEditorFile,
} from "@/lib/editor-file-upload";
import { getEditorImageValidationError } from "@/lib/editor-image-upload-plugin";

interface UsePostEditorUploadsOptions {
  editorRef: RefObject<Editor | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  fileUploadRef: RefObject<HTMLInputElement | null>;
  latestTitleRef: RefObject<string>;
  onClearFeedback: () => void;
  onCoverUploaded: (url: string) => void;
  onError: (message: string) => void;
  scheduleDraftSave: (title?: string, editor?: Editor | null) => void;
}

export function usePostEditorUploads({
  editorRef,
  fileInputRef,
  fileUploadRef,
  latestTitleRef,
  onClearFeedback,
  onCoverUploaded,
  onError,
  scheduleDraftSave,
}: UsePostEditorUploadsOptions) {
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const resetUploadState = useCallback(() => {
    setUploadingImage(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (fileUploadRef.current) fileUploadRef.current.value = "";
  }, [fileInputRef, fileUploadRef]);

  const uploadImageAndGetUrl = useCallback(
    async (file: File): Promise<string> => {
      setUploadingImage(true);
      setUploadProgress(0);
      onClearFeedback();
      try {
        const validationError = getEditorImageValidationError(file);
        if (validationError) throw new Error(validationError);
        const optimizedFile = await optimizeImageForUpload(file, EDITOR_IMAGE_OPTIMIZE_OPTIONS);
        const result = await uploadEditorFile(optimizedFile, setUploadProgress);
        if (editorRef.current) scheduleDraftSave(latestTitleRef.current, editorRef.current);
        return getEditorImageSourceUrl(result);
      } catch (error) {
        onError(error instanceof Error ? error.message : "图片上传失败");
        throw error;
      } finally {
        resetUploadState();
      }
    },
    [editorRef, latestTitleRef, onClearFeedback, onError, resetUploadState, scheduleDraftSave],
  );

  const handleImageValidationError = useCallback(
    (_file: File, message: string) => onError(message),
    [onError],
  );

  const insertNonImageFile = useCallback(
    async (file: File, requestedPos?: number): Promise<number | null> => {
      if (file.type.startsWith("image/")) {
        try {
          const url = await uploadImageAndGetUrl(file);
          editorRef.current?.chain().focus().setImage({ src: url, alt: file.name }).run();
        } catch {}
        return null;
      }

      const editor = editorRef.current;
      if (!editor) {
        onError("编辑器还没准备好");
        return null;
      }

      setUploadingImage(true);
      setUploadProgress(0);
      onClearFeedback();
      const marker = createUploadPlaceholderMarker();
      insertUploadPlaceholder(editor, file, marker, requestedPos);
      try {
        const result = await uploadEditorFile(file, setUploadProgress);
        const placeholderPos = removeUploadPlaceholder(editor, marker);
        if (placeholderPos == null) return null;
        const insertedEnd = insertUploadedFileIntoEditor(editor, file, result, placeholderPos);
        scheduleDraftSave(latestTitleRef.current, editor);
        return insertedEnd;
      } catch (error) {
        try {
          removeUploadPlaceholder(editor, marker);
        } catch {}
        onError(error instanceof Error ? error.message : "文件上传失败");
        return null;
      } finally {
        resetUploadState();
      }
    },
    [
      editorRef,
      latestTitleRef,
      onClearFeedback,
      onError,
      resetUploadState,
      scheduleDraftSave,
      uploadImageAndGetUrl,
    ],
  );

  const handleSelectedFiles = useCallback(
    async (files: FileList | File[] | null | undefined) => {
      const queue = files ? Array.from(files) : [];
      for (const file of queue) {
        await insertNonImageFile(file);
      }
    },
    [insertNonImageFile],
  );

  const handleCoverUpload = useCallback(
    async (file: File) => {
      setUploadingImage(true);
      setUploadProgress(0);
      try {
        const optimizedFile = await optimizeImageForUpload(file, COVER_IMAGE_OPTIMIZE_OPTIONS);
        const result = await uploadEditorFile(optimizedFile, setUploadProgress);
        onCoverUploaded(result.url);
      } catch (error) {
        onError(error instanceof Error ? error.message : "封面上传失败");
      } finally {
        setUploadingImage(false);
        setUploadProgress(0);
        if (coverInputRef.current) coverInputRef.current.value = "";
      }
    },
    [onCoverUploaded, onError],
  );

  return {
    coverInputRef,
    handleCoverUpload,
    handleImageValidationError,
    handleSelectedFiles,
    insertNonImageFile,
    uploadImageAndGetUrl,
    uploadProgress,
    uploadingImage,
  };
}
