// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleToc } from "@/components/ArticleToc";
import type { ArticleTocHeading } from "@/lib/article-toc";

describe("ArticleToc", () => {
  let container: HTMLDivElement;
  let root: Root;
  let observerCallback: IntersectionObserverCallback | undefined;
  const disconnect = vi.fn();

  const renderToc = (headings: ArticleTocHeading[]) => {
    act(() => root.render(createElement(ArticleToc, { headings })));
  };

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    observerCallback = undefined;
    disconnect.mockClear();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          observerCallback = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {
          disconnect();
        }
        takeRecords() {
          return [];
        }
        root = null;
        rootMargin = "0px";
        thresholds = [0];
      },
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("does not render for a short article with one heading", () => {
    renderToc([{ id: "one", level: 2, text: "一节" }]);
    expect(container.innerHTML).toBe("");
  });

  it("renders accessible mobile and desktop navigation", () => {
    const first = document.createElement("h2");
    first.id = "first";
    const second = document.createElement("h3");
    second.id = "second";
    document.body.appendChild(first);
    document.body.appendChild(second);

    renderToc([
      { id: "first", level: 2, text: "第一节" },
      { id: "second", level: 3, text: "第二节" },
    ]);

    expect(container.querySelector("summary")?.textContent).toContain("2 节");
    expect(container.querySelectorAll('nav[aria-label="文章目录"]')).toHaveLength(1);
    expect(container.querySelector('aside[aria-label="文章目录"] nav')).not.toBeNull();
    expect(container.querySelectorAll('a[href="#second"]')).toHaveLength(2);
    expect(observerCallback).toBeTypeOf("function");
  });

  it("marks the latest heading above the activation line as current", () => {
    const first = document.createElement("h2");
    first.id = "first";
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue({ top: -100 } as DOMRect);
    const second = document.createElement("h2");
    second.id = "second";
    vi.spyOn(second, "getBoundingClientRect").mockReturnValue({ top: 80 } as DOMRect);
    document.body.appendChild(first);
    document.body.appendChild(second);

    renderToc([
      { id: "first", level: 2, text: "第一节" },
      { id: "second", level: 2, text: "第二节" },
    ]);

    act(() => observerCallback?.([], {} as IntersectionObserver));
    const currentLinks = container.querySelectorAll('[aria-current="location"]');
    expect(currentLinks).toHaveLength(2);
    expect(currentLinks[0]?.getAttribute("href")).toBe("#second");
  });

  it("closes the mobile disclosure after navigation", () => {
    const first = document.createElement("h2");
    first.id = "first";
    const second = document.createElement("h2");
    second.id = "second";
    document.body.appendChild(first);
    document.body.appendChild(second);

    renderToc([
      { id: "first", level: 2, text: "第一节" },
      { id: "second", level: 2, text: "第二节" },
    ]);

    const details = container.querySelector("details");
    details?.setAttribute("open", "");
    act(() => container.querySelector<HTMLAnchorElement>('details a[href="#second"]')?.click());
    expect(details?.hasAttribute("open")).toBe(false);
    expect(
      container
        .querySelector<HTMLAnchorElement>('details a[href="#second"]')
        ?.getAttribute("aria-current"),
    ).toBe("location");
  });
});
