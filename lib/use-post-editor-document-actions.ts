"use client";

import type { Editor } from "@tiptap/core";
import type { RefObject } from "react";
import { copyAsWechatArticleFormat, downloadArticleAsPdf } from "@/lib/wechat-copy";

interface ToastApi {
  error: (message: string) => void;
  success: (message: string) => void;
}

interface Options {
  editorRef: RefObject<Editor | null>;
  setWechatPublishOpen: (open: boolean) => void;
  title: string;
  toast: ToastApi;
}

function readExportableDocument(editor: Editor | null, title: string, toast: ToastApi) {
  if (!editor) {
    toast.error("编辑器还没准备好。");
    return null;
  }
  const content = editor.getText({ blockSeparator: "\n\n" }).trim();
  const html = editor.getHTML();
  if (!content && !/<(img|video|audio|iframe)\s/i.test(html)) {
    toast.error("正文还是空的。");
    return null;
  }
  return { html, title: title.trim() || "无标题" };
}

export function usePostEditorDocumentActions({
  editorRef,
  setWechatPublishOpen,
  title,
  toast,
}: Options) {
  const handleCopyWechat = async () => {
    const document = readExportableDocument(editorRef.current, title, toast);
    if (!document) return;
    try {
      await copyAsWechatArticleFormat(document.title, document.html);
      toast.success("已复制公众号格式");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制公众号格式失败");
    }
  };

  const handleDownloadPdf = async () => {
    const document = readExportableDocument(editorRef.current, title, toast);
    if (!document) return;
    try {
      await downloadArticleAsPdf(document.title, document.html);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出 PDF 失败");
    }
  };

  const handleOpenWechatPublish = () => {
    if (readExportableDocument(editorRef.current, title, toast)) setWechatPublishOpen(true);
  };

  return { handleCopyWechat, handleDownloadPdf, handleOpenWechatPublish };
}
