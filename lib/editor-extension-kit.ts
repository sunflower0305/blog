import type { Editor } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TextStyle } from "@tiptap/extension-text-style";
import Youtube from "@tiptap/extension-youtube";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import AutoJoiner from "tiptap-extension-auto-joiner";
import GlobalDragHandle from "tiptap-extension-global-drag-handle";
import { AudioNode } from "@/lib/audio-extension";
import { codeLowlight, DEFAULT_CODE_LANGUAGE } from "@/lib/code-highlighting";
import { MathNode } from "@/lib/math-extension";
import { ResizableImage, type ResizableImageActionHandlers } from "@/lib/resizable-image";
import { editorSlashCommand } from "@/lib/editor-slash-items";
import { TwitterNode } from "@/lib/twitter-extension";
import { VideoNode } from "@/lib/video-extension";

export interface EditorExtensionOptions {
  imageActions?: ResizableImageActionHandlers;
}

export function createEditorExtensions(options: EditorExtensionOptions = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      link: { openOnClick: false, autolink: true, linkOnPaste: true },
    }),
    CodeBlockLowlight.configure({
      lowlight: codeLowlight,
      defaultLanguage: DEFAULT_CODE_LANGUAGE,
    }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    CharacterCount,
    ResizableImage.configure({ imageActions: options.imageActions ?? {} } as never),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false, HTMLAttributes: { class: "tiptap-table" } }),
    TableRow,
    TableCell,
    TableHeader,
    Youtube.configure({
      inline: false,
      ccLanguage: "zh",
      interfaceLanguage: "zh",
    }),
    TwitterNode,
    MathNode,
    AudioNode,
    VideoNode,
    Markdown.configure({ html: true, transformPastedText: true, transformCopiedText: true }),
    GlobalDragHandle.configure({
      dragHandleWidth: 24,
      scrollTreshold: 100,
    }),
    AutoJoiner.configure({
      elementsToJoin: ["bulletList", "orderedList"],
    }),
    editorSlashCommand,
  ];
}

export function getEditorCharacterCount(editor: Editor) {
  return editor.storage.characterCount.characters();
}
