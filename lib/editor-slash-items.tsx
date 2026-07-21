"use client";

import {
  type InputModalDetail,
  type TriggerImageGenerationDetail,
  TRIGGER_FILE_UPLOAD_EVENT,
  TRIGGER_IMAGE_GENERATION_EVENT,
  TRIGGER_IMAGE_UPLOAD_EVENT,
  TRIGGER_INPUT_MODAL_EVENT,
} from "@/lib/editor-events";
import {
  createSlashCommand,
  createSuggestionItems,
  type SuggestionItem,
} from "@/lib/editor-slash-command";
import { createDefaultTableContent } from "@/lib/editor-utils";

function CommandIcon({ label }: { label: string }) {
  return (
    <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-[var(--editor-line)] bg-[var(--editor-panel)] px-2 text-[11px] font-semibold tracking-wide text-[var(--editor-ink)]">
      {label}
    </span>
  );
}

const suggestionItems = createSuggestionItems([
  {
    title: "正文",
    description: "切回普通段落继续写作。",
    searchTerms: ["text", "paragraph", "p"],
    icon: <CommandIcon label="T" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    title: "二级标题",
    description: "插入中等层级的小节标题。",
    searchTerms: ["heading", "h2", "subtitle"],
    icon: <CommandIcon label="H2" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: "三级标题",
    description: "插入更细一级的小标题。",
    searchTerms: ["heading", "h3", "small"],
    icon: <CommandIcon label="H3" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    title: "项目列表",
    description: "创建无序列表。",
    searchTerms: ["bullet", "list", "unordered"],
    icon: <CommandIcon label="•" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "编号列表",
    description: "创建带顺序的编号列表。",
    searchTerms: ["ordered", "list", "number"],
    icon: <CommandIcon label="1." />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "待办列表",
    description: "插入可以勾选的任务清单。",
    searchTerms: ["todo", "task", "checkbox"],
    icon: <CommandIcon label="[]" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "引用",
    description: "高亮一段需要单独强调的话。",
    searchTerms: ["quote", "blockquote"],
    icon: <CommandIcon label='"' />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().toggleBlockquote().run();
    },
  },
  {
    title: "代码块",
    description: "插入一段多行代码。",
    searchTerms: ["code", "snippet", "codeblock"],
    icon: <CommandIcon label="</>" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "表格",
    description: "插入一个 3×3 的表格。",
    searchTerms: ["table", "grid"],
    icon: <CommandIcon label="▦" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent(createDefaultTableContent()).run();
    },
  },
  {
    title: "分隔线",
    description: "用一条线把内容切成两个段落。",
    searchTerms: ["divider", "hr", "line"],
    icon: <CommandIcon label="—" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: "生成图片",
    description: "调用 AI 生图并插入当前位置。",
    searchTerms: ["generate", "image", "ai", "illustration", "生图", "生成图片", "插图", "mondo"],
    icon: <CommandIcon label="AI" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(
        new CustomEvent<TriggerImageGenerationDetail>(TRIGGER_IMAGE_GENERATION_EVENT, {
          detail: { insertPos: range.from, selectedText: "" },
        }),
      );
    },
  },
  {
    title: "图片",
    description: "从本地上传图片。",
    searchTerms: ["image", "photo", "picture", "upload", "图片"],
    icon: <CommandIcon label="🖼" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(new CustomEvent(TRIGGER_IMAGE_UPLOAD_EVENT));
    },
  },
  {
    title: "YouTube",
    description: "嵌入 YouTube 视频。",
    searchTerms: ["youtube", "video", "视频"],
    icon: <CommandIcon label="▶" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(
        new CustomEvent<InputModalDetail>(TRIGGER_INPUT_MODAL_EVENT, {
          detail: {
            title: "嵌入 YouTube 视频",
            placeholder: "请粘贴 YouTube 视频链接",
            callback: (url) => editor.commands.setYoutubeVideo({ src: url }),
          },
        }),
      );
    },
  },
  {
    title: "Twitter",
    description: "嵌入 Twitter/X 推文。",
    searchTerms: ["twitter", "tweet", "x", "推文"],
    icon: <CommandIcon label="𝕏" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(
        new CustomEvent<InputModalDetail>(TRIGGER_INPUT_MODAL_EVENT, {
          detail: {
            title: "嵌入 Twitter/X 推文",
            placeholder: "请粘贴推文链接",
            callback: (url) =>
              editor.commands.insertContent({ type: "twitter", attrs: { src: url } }),
          },
        }),
      );
    },
  },
  {
    title: "上传文件",
    description: "上传视频、音频、PDF、电子书等文件。",
    searchTerms: [
      "file",
      "upload",
      "video",
      "audio",
      "pdf",
      "epub",
      "文件",
      "视频",
      "音频",
      "上传",
    ],
    icon: <CommandIcon label="📎" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(new CustomEvent(TRIGGER_FILE_UPLOAD_EVENT));
    },
  },
  {
    title: "数学公式",
    description: "插入 LaTeX 数学公式。",
    searchTerms: ["math", "formula", "latex", "katex", "公式", "数学"],
    icon: <CommandIcon label="∑" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      editor.commands.insertContent({
        type: "mathBlock",
        attrs: { latex: "", displayMode: true },
      });
    },
  },
] satisfies SuggestionItem[]);

export const editorSlashCommand = createSlashCommand(suggestionItems);
