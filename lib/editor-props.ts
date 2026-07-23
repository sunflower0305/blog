import { DOMParser as PMDOMParser } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import markdownit from "markdown-it";
import {
  createImageUpload,
  getEditorImageValidationError,
  handleImageDrop,
  handleImagePaste,
  isValidEditorImage,
  type UploadFn,
} from "@/lib/editor-image-upload-plugin";
import { unwrapStandaloneImages } from "@/lib/editor-content";
import { hasMarkdownTable } from "@/lib/editor-utils";

const md = markdownit({ html: true });

export function buildEditorProps(
  onImageUpload?: (file: File) => Promise<string>,
  onNonImageFile?: (
    file: File,
    pos: number,
  ) => Promise<number | null | void> | number | null | void,
  contentClassName = "",
  onImageValidationError?: (file: File, message: string) => void,
) {
  const collectFiles = (listLike: FileList | File[] | null | undefined) => {
    if (!listLike) return [] as File[];

    const files = Array.from(listLike);
    const seen = new Set<string>();

    return files.filter((file) => {
      const key = `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const getClipboardFiles = (event: ClipboardEvent) => {
    const files: File[] = [];
    const items = event.clipboardData?.items;

    if (items) {
      for (const item of Array.from(items)) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }

    return collectFiles(files.length > 0 ? files : event.clipboardData?.files);
  };

  const getDroppedFiles = (event: DragEvent) => collectFiles(event.dataTransfer?.files);

  const uploadFn = onImageUpload
    ? createImageUpload({
        validateFn: isValidEditorImage,
        onValidationError: (file) => {
          const message = getEditorImageValidationError(file);
          if (message) onImageValidationError?.(file, message);
        },
        onUpload: async (file) => {
          const url = await onImageUpload(file);
          return url;
        },
      })
    : undefined;

  const processFilesInOrder = async (
    files: File[],
    view: EditorView,
    initialPos: number,
    imageUpload: UploadFn | undefined,
  ) => {
    let nextPos = initialPos;

    for (const file of files) {
      if (file.type.startsWith("image/") && imageUpload) {
        const insertedEnd = await imageUpload(file, view, nextPos);
        if (insertedEnd != null) nextPos = insertedEnd;
        continue;
      }

      if (onNonImageFile) {
        const insertedEnd = await onNonImageFile(file, nextPos);
        if (typeof insertedEnd === "number") nextPos = insertedEnd;
      }
    }
  };

  return {
    handlePaste: (view: EditorView, event: ClipboardEvent) => {
      const files = getClipboardFiles(event);
      if (files.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        if (files.length === 1 && files[0]?.type.startsWith("image/") && uploadFn) {
          return handleImagePaste(view, event, uploadFn);
        }

        void processFilesInOrder(files, view, view.state.selection.from, uploadFn);
        return true;
      }

      const plainText = event.clipboardData?.getData("text/plain") ?? "";
      if (hasMarkdownTable(plainText)) {
        event.preventDefault();
        const html = md.render(plainText);
        const { state, dispatch } = view;
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html;
        unwrapStandaloneImages(wrapper);
        const slice = PMDOMParser.fromSchema(state.schema).parseSlice(wrapper);
        const tr = state.tr.replaceSelection(slice);
        dispatch(tr);
        return true;
      }

      const htmlContent = event.clipboardData?.getData("text/html") ?? "";
      if (
        htmlContent &&
        (htmlContent.includes("<style") ||
          htmlContent.includes("class=") ||
          htmlContent.includes("mso-") ||
          htmlContent.includes("data-") ||
          /style\s*=\s*["'][^"']*["']/.test(htmlContent))
      ) {
        event.preventDefault();
        const wrapper = document.createElement("div");
        wrapper.innerHTML = htmlContent;
        const allElements = wrapper.querySelectorAll("*");
        allElements.forEach((el) => {
          el.removeAttribute("style");
          el.removeAttribute("class");
          el.removeAttribute("id");
          Array.from(el.attributes).forEach((attr) => {
            if (attr.name.startsWith("data-")) {
              el.removeAttribute(attr.name);
            }
          });
        });

        wrapper.querySelectorAll("style").forEach((el) => el.remove());
        unwrapStandaloneImages(wrapper);

        const { state, dispatch } = view;
        const slice = PMDOMParser.fromSchema(state.schema).parseSlice(wrapper);
        const tr = state.tr.replaceSelection(slice);
        dispatch(tr);
        return true;
      }

      return false;
    },
    handleDrop: (view: EditorView, event: DragEvent, _slice: unknown, moved: boolean) => {
      const files = getDroppedFiles(event);
      if (files.length === 0) return false;
      if (moved) return false;
      event.preventDefault();
      event.stopPropagation();
      if (files.length === 1 && files[0]?.type.startsWith("image/") && uploadFn) {
        return handleImageDrop(view, event, moved, uploadFn);
      }

      const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
      void processFilesInOrder(files, view, dropPos ?? view.state.selection.from, uploadFn);
      return true;
    },
    handleDOMEvents: {
      click: (_view: unknown, event: MouseEvent) => {
        if (event.metaKey || event.ctrlKey) {
          const target = event.target as HTMLElement;
          const anchor = target.closest("a[href]");
          if (anchor) {
            event.preventDefault();
            window.open((anchor as HTMLAnchorElement).href, "_blank", "noopener");
          }
        }
      },
    },
    attributes: { class: ["editor-prose", contentClassName].filter(Boolean).join(" ") },
  };
}
