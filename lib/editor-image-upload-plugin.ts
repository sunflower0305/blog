import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

const uploadImagePluginKey = new PluginKey<DecorationSet>("editor-image-upload");
export const MAX_EDITOR_IMAGE_SIZE = 100 * 1024 * 1024;

type UploadMarker = { id: object; pos: number; src: string };

export function UploadImagesPlugin({ imageClass }: { imageClass: string }) {
  return new Plugin<DecorationSet>({
    key: uploadImagePluginKey,
    state: {
      init: () => DecorationSet.empty,
      apply(transaction, decorations) {
        const mapped = decorations.map(transaction.mapping, transaction.doc);
        const meta = transaction.getMeta(uploadImagePluginKey) as
          | { add?: UploadMarker; remove?: { id: object } }
          | undefined;

        if (meta?.add) {
          const wrapper = document.createElement("span");
          wrapper.className = "img-placeholder";
          const image = document.createElement("img");
          image.className = imageClass;
          image.src = meta.add.src;
          image.alt = "图片上传中";
          wrapper.appendChild(image);

          return mapped.add(transaction.doc, [
            Decoration.widget(meta.add.pos, wrapper, { id: meta.add.id, side: -1 }),
          ]);
        }

        if (meta?.remove) {
          return mapped.remove(
            mapped.find(undefined, undefined, (spec) => spec.id === meta.remove?.id),
          );
        }

        return mapped;
      },
    },
    props: {
      decorations(state) {
        return uploadImagePluginKey.getState(state);
      },
    },
  });
}

function findUploadPosition(view: EditorView, id: object) {
  return uploadImagePluginKey
    .getState(view.state)
    ?.find(undefined, undefined, (spec) => spec.id === id)[0]?.from;
}

export interface ImageUploadOptions {
  validateFn?: (file: File) => boolean;
  onValidationError?: (file: File) => void;
  onUpload: (file: File) => Promise<string>;
}

export function getEditorImageValidationError(file: File) {
  if (!file.type.startsWith("image/")) return "仅支持图片文件";
  if (file.size > MAX_EDITOR_IMAGE_SIZE) return "图片太大，最大支持 100MB";
  return null;
}

export function isValidEditorImage(file: File) {
  return getEditorImageValidationError(file) === null;
}

export type UploadFn = (file: File, view: EditorView, pos: number) => Promise<number | null>;

export function createImageUpload({
  validateFn,
  onValidationError,
  onUpload,
}: ImageUploadOptions): UploadFn {
  return (file, view, requestedPos) => {
    if (validateFn && !validateFn(file)) {
      onValidationError?.(file);
      return Promise.resolve(null);
    }

    const id = {};
    const previewUrl = URL.createObjectURL(file);
    let transaction = view.state.tr;
    if (!transaction.selection.empty) transaction = transaction.deleteSelection();
    const pos = Math.max(0, Math.min(requestedPos, transaction.doc.content.size));
    transaction.setMeta(uploadImagePluginKey, { add: { id, pos, src: previewUrl } });
    view.dispatch(transaction);

    return onUpload(file)
      .then(
        (src) => {
          if (view.isDestroyed) return null;
          const currentPos = findUploadPosition(view, id);
          if (currentPos == null) return null;

          const image = view.state.schema.nodes.image?.create({ src });
          if (!image) {
            view.dispatch(view.state.tr.setMeta(uploadImagePluginKey, { remove: { id } }));
            return null;
          }
          view.dispatch(
            view.state.tr
              .replaceRangeWith(currentPos, currentPos, image)
              .setMeta(uploadImagePluginKey, { remove: { id } }),
          );
          return currentPos + image.nodeSize;
        },
        () => {
          if (view.isDestroyed) return null;
          view.dispatch(view.state.tr.setMeta(uploadImagePluginKey, { remove: { id } }));
          return null;
        },
      )
      .finally(() => URL.revokeObjectURL(previewUrl));
  };
}

export function handleImagePaste(view: EditorView, event: ClipboardEvent, upload: UploadFn) {
  const file = Array.from(event.clipboardData?.files ?? [])[0];
  if (!file) return false;

  event.preventDefault();
  void upload(file, view, view.state.selection.from);
  return true;
}

export function handleImageDrop(
  view: EditorView,
  event: DragEvent,
  moved: boolean,
  upload: UploadFn,
) {
  const file = Array.from(event.dataTransfer?.files ?? [])[0];
  if (moved || !file) return false;

  event.preventDefault();
  const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
  void upload(file, view, coordinates?.pos ?? view.state.selection.from);
  return true;
}
