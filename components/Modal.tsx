"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void | boolean | Promise<void | boolean>;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
  closeOnConfirm?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  type = "info",
  closeOnConfirm = true,
}: ModalProps) {
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [isOpen]);

  const buttonColor = {
    danger: "bg-rose-500 hover:bg-rose-600 text-white",
    warning: "bg-amber-500 hover:bg-amber-600 text-white",
    info: "bg-[var(--editor-accent)] hover:brightness-105 text-white",
  }[type];

  const handleConfirm = async () => {
    if (!onConfirm || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await onConfirm();
      if (result !== false && closeOnConfirm) {
        onClose();
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !submittingRef.current) onClose();
      }}
    >
      <Dialog.Portal>
        {/* Keep confirmations above ImageGenerationModal (z-70) and ImageCropModal (z-75). */}
        <Dialog.Overlay data-modal-overlay="" className="fixed inset-0 z-[80] bg-black/50" />
        <Dialog.Content
          aria-modal="true"
          {...(description ? {} : { "aria-describedby": undefined })}
          onOpenAutoFocus={() => {
            const activeElement = document.activeElement;
            previouslyFocusedElementRef.current =
              activeElement instanceof HTMLElement && activeElement !== document.body
                ? activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const elementToRestore = previouslyFocusedElementRef.current;
            previouslyFocusedElementRef.current = null;
            if (elementToRestore?.isConnected) elementToRestore.focus();
          }}
          onInteractOutside={(event) => {
            if (submittingRef.current) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (submittingRef.current) event.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-[80] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-[var(--editor-panel)] shadow-xl outline-none"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 pb-4">
            <Dialog.Title asChild>
              <h3 className="text-lg font-semibold text-[var(--editor-ink)]">{title}</h3>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                disabled={submitting}
                className="text-[var(--stone-gray)] hover:text-[var(--editor-ink)] transition-colors"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          {description && (
            <div className="px-6 pb-6">
              <Dialog.Description className="text-sm text-[var(--editor-muted)]">
                {description}
              </Dialog.Description>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 rounded-b-lg bg-[var(--editor-panel)] px-6 py-4">
            <Dialog.Close asChild>
              <button
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-[var(--editor-muted)] hover:text-[var(--editor-ink)] transition-colors"
              >
                {cancelText}
              </button>
            </Dialog.Close>
            {onConfirm && (
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${buttonColor}`}
              >
                {submitting ? "处理中…" : confirmText}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
