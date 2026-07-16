// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tabs } from "@/components/Tabs";
import { ToastProvider, useToast } from "@/components/Toast";

describe("shared UI accessibility", () => {
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

  it("connects tabs to the active panel and switches with arrow, Home, and End keys", () => {
    act(() => {
      root.render(
        createElement(Tabs, {
          tabs: [
            { id: "one", label: "第一项", content: "内容一" },
            { id: "two", label: "第二项", content: "内容二" },
            { id: "three", label: "第三项", content: "内容三" },
          ],
          defaultTab: "one",
        }),
      );
    });

    const tablist = container.querySelector<HTMLElement>("[role=tablist]");
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>("[role=tab]"));
    expect(tablist?.getAttribute("aria-label")).toBe("选项卡");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]?.tabIndex).toBe(0);
    expect(tabs[1]?.tabIndex).toBe(-1);

    act(() => {
      tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[2]);
    expect(container.querySelector("[role=tabpanel]")?.textContent).toBe("内容三");

    act(() => {
      tabs[2]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    });
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");

    act(() => {
      tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");

    act(() => {
      tabs[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    const panel = container.querySelector<HTMLElement>("[role=tabpanel]");
    expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[2]?.getAttribute("aria-controls")).toBe(panel?.id);
    expect(panel?.getAttribute("aria-labelledby")).toBe(tabs[2]?.id);
  });

  it("announces errors assertively and other toast types politely", () => {
    function ToastHarness() {
      const toast = useToast();
      return createElement(
        "div",
        null,
        createElement("button", { onClick: () => toast.error("保存失败", 0) }, "错误"),
        createElement("button", { onClick: () => toast.warning("请检查", 0) }, "警告"),
      );
    }

    act(() => {
      root.render(createElement(ToastProvider, null, createElement(ToastHarness)));
    });
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");

    act(() => buttons[0]?.click());
    const error = container.querySelector<HTMLElement>("[role=alert]");
    expect(error?.getAttribute("aria-live")).toBe("assertive");
    expect(error?.getAttribute("aria-atomic")).toBe("true");
    expect(error?.textContent).toContain("保存失败");

    act(() => buttons[1]?.click());
    const statuses = container.querySelectorAll<HTMLElement>("[role=status]");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.getAttribute("aria-live")).toBe("polite");
    expect(statuses[0]?.textContent).toContain("请检查");
  });
});
