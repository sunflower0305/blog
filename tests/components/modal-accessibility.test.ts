// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Modal } from "@/components/Modal";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("Modal accessibility and behavior", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function renderModal(
    props: Partial<Parameters<typeof Modal>[0]> = {},
  ): Parameters<typeof Modal>[0] {
    const modalProps: Parameters<typeof Modal>[0] = {
      isOpen: true,
      onClose: vi.fn(),
      title: "确认操作",
      description: "请确认是否继续。",
      ...props,
    };

    act(() => root.render(createElement(Modal, modalProps)));
    return modalProps;
  }

  function getButton(name: string): HTMLButtonElement {
    const button = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
      (candidate) =>
        candidate.textContent === name || candidate.getAttribute("aria-label") === name,
    );
    if (!button) throw new Error(`Button not found: ${name}`);
    return button;
  }

  it("exposes modal semantics and connects its title and optional description", () => {
    const props = renderModal();
    let dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");

    const titleId = dialog?.getAttribute("aria-labelledby");
    const descriptionId = dialog?.getAttribute("aria-describedby");
    expect(titleId).toBeTruthy();
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(titleId ?? "")?.textContent).toBe("确认操作");
    expect(document.getElementById(descriptionId ?? "")?.textContent).toBe("请确认是否继续。");

    act(() => root.render(createElement(Modal, { ...props, description: undefined })));
    dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.hasAttribute("aria-describedby")).toBe(false);
  });

  it("routes Escape, overlay, close, and cancel actions through onClose", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));

    const overlay = document.body.querySelector<HTMLElement>("[data-modal-overlay]");
    act(() => {
      overlay?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      overlay?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    act(() => getButton("关闭").click());
    act(() => getButton("取消").click());
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it("blocks every dismissal path and duplicate confirmation while submitting", async () => {
    const deferred = createDeferred<boolean>();
    const onClose = vi.fn();
    const onConfirm = vi.fn(() => deferred.promise);
    renderModal({ onClose, onConfirm });

    await act(async () => getButton("确认").click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(getButton("处理中…").disabled).toBe(true);
    expect(getButton("关闭").disabled).toBe(true);
    expect(getButton("取消").disabled).toBe(true);

    await act(async () => getButton("处理中…").click());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      document.body
        .querySelector<HTMLElement>("[data-modal-overlay]")
        ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      document.body
        .querySelector<HTMLElement>("[data-modal-overlay]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => deferred.resolve(true));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(getButton("确认").disabled).toBe(false);
    expect(getButton("关闭").disabled).toBe(false);
    expect(getButton("取消").disabled).toBe(false);
  });

  it("stays open when confirmation returns false", async () => {
    const onClose = vi.fn();
    renderModal({ onClose, onConfirm: () => false });

    await act(async () => getButton("确认").click());
    expect(onClose).not.toHaveBeenCalled();
    expect(getButton("确认").disabled).toBe(false);
  });

  it("honors closeOnConfirm=false after successful confirmation", async () => {
    const onClose = vi.fn();
    renderModal({ onClose, onConfirm: () => true, closeOnConfirm: false });

    await act(async () => getButton("确认").click());
    expect(onClose).not.toHaveBeenCalled();
    expect(getButton("确认").disabled).toBe(false);
  });
});
