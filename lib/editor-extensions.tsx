"use client";

export { FormattingBubble } from "@/components/FormattingBubble";
export {
  createEditorExtensions,
  getEditorCharacterCount,
  type EditorExtensionOptions,
} from "@/lib/editor-extension-kit";
export { buildEditorProps } from "@/lib/editor-props";
export type {
  InputModalDetail,
  TriggerAIModalDetail,
  TriggerImageGenerationDetail,
} from "@/lib/editor-events";
