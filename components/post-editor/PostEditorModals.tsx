import { AIModal } from "@/lib/ai-modal";
import { ImageCropModal } from "@/components/ImageCropModal";
import { ImageGenerationModal } from "@/components/ImageGenerationModal";
import { InputModal } from "@/components/InputModal";
import { WeChatPublishModal } from "@/components/WeChatPublishModal";
import { resolvePostCoverImage } from "@/lib/default-cover-images";
import { normalizePostSlug } from "@/lib/post-utils";
import type { PostEditorController } from "@/lib/use-post-editor-controller";

export function PostEditorModals({ controller }: { controller: PostEditorController }) {
  const {
    aiModal,
    applyImageActionResult,
    closeAiModal,
    closeImageModal,
    coverImage,
    cropImageTarget,
    description,
    editSlug,
    editorRef,
    handleInputModalCancel,
    handleInputModalConfirm,
    imageModal,
    inputModal,
    insertGeneratedImage,
    latestTitleRef,
    markDirty,
    referenceImageTarget,
    setCropImageTarget,
    setReferenceImageTarget,
    setTitle,
    setWechatPublishOpen,
    slug,
    title,
    uploadImageAndGetUrl,
    wechatPublishOpen,
    wechatSourceUrl,
  } = controller;

  return (
    <>
      <WeChatPublishModal
        isOpen={wechatPublishOpen}
        onClose={() => setWechatPublishOpen(false)}
        title={title.trim() || "无标题"}
        html={editorRef.current?.getHTML() || ""}
        defaultDigest={description}
        defaultSourceUrl={wechatSourceUrl}
        defaultCoverImageUrl={resolvePostCoverImage({
          cover_image: coverImage,
          slug: normalizePostSlug(slug) || editSlug || title,
          title,
        })}
      />
      <InputModal
        open={inputModal.open}
        title={inputModal.title}
        placeholder={inputModal.placeholder}
        onConfirm={handleInputModalConfirm}
        onCancel={handleInputModalCancel}
      />
      <ImageGenerationModal
        open={imageModal.open}
        contextText={imageModal.contextText}
        historyScope="admin-editor"
        closeOnGenerate={false}
        onClose={closeImageModal}
        onInsert={insertGeneratedImage}
      />
      <ImageGenerationModal
        open={Boolean(referenceImageTarget)}
        contextText=""
        historyScope="admin-editor"
        referenceImageUrl={referenceImageTarget?.src}
        allowReplace
        defaultPlacementMode="replace"
        closeOnGenerate={false}
        generationMode="foreground"
        onClose={() => setReferenceImageTarget(null)}
        onInsert={(imageUrl, alt, placementMode) => {
          if (!referenceImageTarget) return;
          applyImageActionResult(referenceImageTarget, imageUrl, alt, placementMode ?? "replace");
          setReferenceImageTarget(null);
        }}
      />
      <ImageCropModal
        open={Boolean(cropImageTarget)}
        imageUrl={cropImageTarget?.src || ""}
        imageAlt={cropImageTarget?.alt}
        defaultPlacementMode="replace"
        onClose={() => setCropImageTarget(null)}
        onApply={async (file, placementMode) => {
          if (!cropImageTarget) return;
          const uploaded = await uploadImageAndGetUrl(file);
          applyImageActionResult(
            cropImageTarget,
            uploaded,
            cropImageTarget.alt || file.name,
            placementMode,
          );
          setCropImageTarget(null);
        }}
      />
      {editorRef.current && (
        <AIModal
          editor={editorRef.current}
          isOpen={aiModal.open}
          onClose={closeAiModal}
          selectedText={aiModal.selectedText}
          position={aiModal.position}
          selectionRange={aiModal.selectionRange}
          initialContext={aiModal.initialContext}
          documentTitle={aiModal.documentTitle}
          documentText={aiModal.documentText}
          historyScope="admin-editor"
          onApplyTitle={(nextTitle) => {
            latestTitleRef.current = nextTitle;
            setTitle(nextTitle);
            markDirty();
          }}
        />
      )}
    </>
  );
}
