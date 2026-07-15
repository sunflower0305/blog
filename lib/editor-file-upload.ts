import type { Editor } from "@tiptap/core";
import { optimizePostImageUrls } from "./post-utils";

export interface UploadedEditorFile {
  url: string;
  type: string;
  name: string;
  variants?: {
    raw?: string;
    content?: string;
    thumb?: string;
    cover?: string;
  };
}

function sanitizeFilenameSegment(value: string) {
  const illegalCharacters = '<>:"/\\|?*';
  const withoutIllegalCharacters = Array.from(value.trim(), (char) => {
    const code = char.charCodeAt(0);
    return code <= 31 || illegalCharacters.includes(char) ? "-" : char;
  }).join("");

  return withoutIllegalCharacters
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getFilenameExtension(value: string) {
  const match = value.match(/\.([a-z0-9]{2,8})$/i);
  return match?.[0]?.toLowerCase() ?? "";
}

export function buildEditorImageFilename(imageUrl: string, fallbackName = "image") {
  const urlSegment = imageUrl.split("/").pop()?.split("?")[0]?.split("#")[0] ?? "";
  const fallbackBase = fallbackName.replace(/\.[^.]+$/, "");
  const preferredBase =
    sanitizeFilenameSegment(fallbackBase) ||
    sanitizeFilenameSegment(urlSegment.replace(/\.[^.]+$/, ""));
  const extension = getFilenameExtension(urlSegment) || ".webp";
  return `${preferredBase || "image"}${extension}`;
}

export function downloadEditorImage(imageUrl: string, fallbackName?: string) {
  if (typeof document === "undefined") return;

  const anchor = document.createElement("a");
  anchor.href = imageUrl;
  anchor.download = buildEditorImageFilename(imageUrl, fallbackName);
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function copyEditorImage(imageUrl: string) {
  if (
    typeof navigator === "undefined" ||
    typeof window === "undefined" ||
    !navigator.clipboard?.write ||
    typeof window.ClipboardItem === "undefined"
  ) {
    throw new Error("当前浏览器不支持复制图片");
  }

  const response = await fetch(imageUrl, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`图片获取失败 (${response.status})`);
  }

  const blob = await response.blob();
  const mimeType = blob.type || "image/png";

  await navigator.clipboard.write([
    new window.ClipboardItem({
      [mimeType]: blob,
    }),
  ]);
}

export async function uploadEditorFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadedEditorFile> {
  const formData = new FormData();
  formData.append("file", file);

  return new Promise<UploadedEditorFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;
    xhr.timeout = 5 * 60 * 1000;

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText) as {
            success?: boolean;
            url?: string;
            type?: string;
            name?: string;
            variants?: UploadedEditorFile["variants"];
            error?: string;
          };

          if (result.success && typeof result.url === "string") {
            resolve({
              url: result.url,
              type: result.type || file.type,
              name: result.name || file.name,
              variants: result.variants,
            });
            return;
          }

          reject(new Error(result.error || "文件上传失败"));
        } catch {
          reject(new Error("解析响应失败"));
        }
        return;
      }

      if (xhr.status === 401) {
        reject(new Error("登录已过期，请刷新页面后重试"));
        return;
      }

      if (xhr.status === 413) {
        reject(new Error("文件太大，最大支持 100MB"));
        return;
      }

      reject(new Error(`上传失败 (${xhr.status})`));
    });

    xhr.addEventListener("error", () => {
      reject(new Error(`网络错误，文件可能太大（${(file.size / 1024 / 1024).toFixed(1)}MB）`));
    });
    xhr.addEventListener("timeout", () => reject(new Error("上传超时")));

    xhr.open("POST", "/api/uploads");
    xhr.send(formData);
  });
}

export function getEditorImageSourceUrl(uploaded: UploadedEditorFile) {
  return uploaded.url;
}

export function getEditorImagePreviewUrl(imageUrl: string, siteUrl: string) {
  return optimizePostImageUrls(imageUrl, siteUrl);
}

export function createUploadPlaceholderMarker() {
  return `⏳upload-${Date.now()}-${crypto.randomUUID()}`;
}

export function buildUploadPlaceholderText(file: File, marker: string) {
  if (file.type.startsWith("video/")) {
    return `📤 视频上传中... [${marker}]`;
  }

  if (file.type.startsWith("audio/")) {
    return `📤 音频上传中... [${marker}]`;
  }

  return `📤 ${file.name} 上传中... [${marker}]`;
}

export function insertUploadPlaceholder(
  editor: Editor,
  file: File,
  marker: string,
  insertPos?: number,
) {
  const content = {
    type: "paragraph",
    content: [{ type: "text", text: buildUploadPlaceholderText(file, marker) }],
  };
  const chain = editor.chain().focus();

  if (Number.isFinite(insertPos)) {
    chain.insertContentAt(Number(insertPos), content).run();
  } else {
    chain.insertContent(content).run();
  }
}

export function removeUploadPlaceholder(editor: Editor, marker: string) {
  const { state } = editor;
  const { doc } = state;
  let placeholderPos: number | null = null;
  let placeholderNodeSize = 0;

  doc.descendants((node, pos) => {
    if (node.isBlock && node.textContent.includes(marker)) {
      placeholderPos = pos;
      placeholderNodeSize = node.nodeSize;
      return false;
    }
  });

  if (placeholderPos === null) return null;

  editor.view.dispatch(state.tr.delete(placeholderPos, placeholderPos + placeholderNodeSize));
  return placeholderPos;
}

export function insertUploadedFileIntoEditor(
  editor: Editor,
  file: File,
  uploaded: UploadedEditorFile,
  insertPos?: number,
) {
  if (Number.isFinite(insertPos)) {
    const pos = Number(insertPos);
    const content = file.type.startsWith("video/")
      ? { type: "video", attrs: { src: uploaded.url } }
      : file.type.startsWith("audio/")
        ? { type: "audio", attrs: { src: uploaded.url } }
        : `<p><a href="${uploaded.url}" target="_blank" rel="noopener">📎 ${file.name}</a></p>`;

    editor.chain().focus().insertContentAt(pos, content).run();
    return pos + (editor.state.doc.nodeAt(pos)?.nodeSize ?? 0);
  }

  if (file.type.startsWith("video/")) {
    editor.chain().focus().setVideo({ src: uploaded.url }).run();
    return null;
  }

  if (file.type.startsWith("audio/")) {
    editor.chain().focus().setAudio({ src: uploaded.url }).run();
    return null;
  }

  editor
    .chain()
    .focus()
    .insertContent(
      `<p><a href="${uploaded.url}" target="_blank" rel="noopener">📎 ${file.name}</a></p>`,
    )
    .run();
  return null;
}

export function insertGeneratedImageAtPosition(
  editor: Editor,
  imageUrl: string,
  alt: string,
  insertPos: number | null,
) {
  const chain = editor.chain().focus();

  if (Number.isFinite(insertPos)) {
    chain.setTextSelection(Number(insertPos));
  }

  chain
    .insertContent([{ type: "image", attrs: { src: imageUrl, alt } }, { type: "paragraph" }])
    .run();
}

export function insertGeneratedImageAfterNode(
  editor: Editor,
  imageUrl: string,
  alt: string,
  nodePos: number | null,
) {
  if (!Number.isFinite(nodePos)) {
    insertGeneratedImageAtPosition(editor, imageUrl, alt, nodePos);
    return;
  }

  const imageNode = editor.state.doc.nodeAt(Number(nodePos));
  const insertPos = imageNode ? Number(nodePos) + imageNode.nodeSize : Number(nodePos);
  insertGeneratedImageAtPosition(editor, imageUrl, alt, insertPos);
}

export function replaceImageNodeAtPosition(
  editor: Editor,
  imageUrl: string,
  alt: string,
  nodePos: number | null,
) {
  if (!Number.isFinite(nodePos)) return false;

  const pos = Number(nodePos);
  const node = editor.state.doc.nodeAt(pos);
  const imageType = editor.state.schema.nodes.image;

  if (!node || node.type.name !== "image" || !imageType) return false;

  const nextNode = imageType.create({
    ...node.attrs,
    src: imageUrl,
    alt,
  });

  const transaction = editor.state.tr
    .replaceWith(pos, pos + node.nodeSize, nextNode)
    .scrollIntoView();

  editor.view.dispatch(transaction);
  return true;
}
