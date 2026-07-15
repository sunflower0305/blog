import { describe, expect, it, vi } from "vitest";
import {
  createSlashCommand,
  getNextSuggestionTitle,
  isSlashNavigationKey,
  matchesSuggestionItem,
  type SuggestionItem,
} from "@/lib/editor-slash-command";

const item: SuggestionItem = {
  title: "生成图片",
  description: "调用 AI 生图并插入当前位置。",
  searchTerms: ["image", "illustration", "插图"],
  icon: null,
};

describe("editor slash command", () => {
  it("matches titles, descriptions, English aliases, and Chinese aliases", () => {
    expect(matchesSuggestionItem(item, "生成")).toBe(true);
    expect(matchesSuggestionItem(item, "AI 生图")).toBe(true);
    expect(matchesSuggestionItem(item, "IMAGE")).toBe(true);
    expect(matchesSuggestionItem(item, "插图")).toBe(true);
    expect(matchesSuggestionItem(item, "表格")).toBe(false);
  });

  it("recognizes looping navigation, execution, and close keys", () => {
    expect(isSlashNavigationKey("ArrowUp")).toBe(true);
    expect(isSlashNavigationKey("ArrowDown")).toBe(true);
    expect(isSlashNavigationKey("Enter")).toBe(true);
    expect(isSlashNavigationKey("Escape")).toBe(true);
    expect(isSlashNavigationKey("Tab")).toBe(false);
  });

  it("loops controlled cmdk selection at both list boundaries", () => {
    const items = [item, { ...item, title: "表格" }, { ...item, title: "代码块" }];

    expect(getNextSuggestionTitle(items, "生成图片", "previous")).toBe("代码块");
    expect(getNextSuggestionTitle(items, "代码块", "next")).toBe("生成图片");
    expect(getNextSuggestionTitle(items, "", "next")).toBe("生成图片");
    expect(getNextSuggestionTitle([], "", "next")).toBe("");
  });

  it("executes the selected item with the current editor and suggestion range", () => {
    const command = vi.fn();
    const commandItem = { ...item, command };
    const editor = { isActive: vi.fn(() => false) } as never;
    const range = { from: 4, to: 9 };

    commandItem.command({ editor, range });
    const extension = createSlashCommand([commandItem]);
    expect(command).toHaveBeenCalledWith({ editor, range });
    expect(extension.name).toBe("slashCommand");
  });
});
