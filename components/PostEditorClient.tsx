"use client";

import dynamic from "next/dynamic";

const PostEditor = dynamic(
  () => import("@/components/PostEditor").then((m) => ({ default: m.PostEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-gray-500">加载编辑器...</div>
      </div>
    ),
  },
);

export function PostEditorClient(props: {
  initialData?: {
    slug: string;
    title: string;
    html: string;
    category?: string;
    status?: "draft" | "published" | "deleted";
    password?: string | null;
    is_hidden?: number;
    tags?: string[];
    description?: string | null;
    cover_image?: string | null;
  };
  skipDraftRestore?: boolean;
}) {
  return <PostEditor {...props} />;
}
