import type { AIImageAspectRatio, AIImageResolution } from "@/lib/ai-image-options";

export interface GeneratedImageResult {
  url: string;
  alt: string;
  revisedPrompt: string;
  actionLabel: string;
  aspectRatio: AIImageAspectRatio;
  resolution: AIImageResolution;
  size: string;
  profileName: string;
  model: string;
  variants?: {
    content?: string;
  };
}

export interface ImageHistoryItem {
  id: string;
  image: GeneratedImageResult;
  promptLabel: string;
  contextPreview: string;
  createdAt: number;
}
