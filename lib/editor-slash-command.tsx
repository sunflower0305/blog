"use client";

import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { Command } from "cmdk";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import tippy, { type Instance } from "tippy.js";

export interface SuggestionItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  searchTerms?: string[];
  command?: (props: { editor: Editor; range: Range }) => void;
}

export function createSuggestionItems(items: SuggestionItem[]) {
  return items;
}

export function matchesSuggestionItem(item: SuggestionItem, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  return [item.title, item.description, ...(item.searchTerms ?? [])]
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

export function isSlashNavigationKey(key: string) {
  return ["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(key);
}

export function getNextSuggestionTitle(
  items: SuggestionItem[],
  currentTitle: string,
  direction: "previous" | "next",
) {
  if (items.length === 0) return "";

  const currentIndex = items.findIndex((item) => item.title === currentTitle);
  if (currentIndex < 0) {
    return direction === "previous" ? (items.at(-1)?.title ?? "") : (items[0]?.title ?? "");
  }

  const offset = direction === "previous" ? -1 : 1;
  return items[(currentIndex + offset + items.length) % items.length]?.title ?? "";
}

interface SlashCommandListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

type SlashCommandListProps = SuggestionProps<SuggestionItem, SuggestionItem>;

const SlashCommandList = forwardRef<SlashCommandListHandle, SlashCommandListProps>(
  function SlashCommandList({ command, items, query }, ref) {
    const visibleItems = useMemo(
      () => items.filter((item) => matchesSuggestionItem(item, query)),
      [items, query],
    );
    const [selectedTitle, setSelectedTitle] = useState(visibleItems[0]?.title ?? "");
    const selectedTitleRef = useRef(selectedTitle);

    useEffect(() => {
      const nextTitle = visibleItems.some((item) => item.title === selectedTitleRef.current)
        ? selectedTitleRef.current
        : (visibleItems[0]?.title ?? "");
      selectedTitleRef.current = nextTitle;
      setSelectedTitle(nextTitle);
    }, [visibleItems]);

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const nextTitle = getNextSuggestionTitle(
              visibleItems,
              selectedTitleRef.current,
              event.key === "ArrowUp" ? "previous" : "next",
            );
            selectedTitleRef.current = nextTitle;
            setSelectedTitle(nextTitle);
            return true;
          }

          if (event.key === "Enter") {
            const selectedItem = visibleItems.find(
              (item) => item.title === selectedTitleRef.current,
            );
            if (!selectedItem) return false;
            event.preventDefault();
            command(selectedItem);
            return true;
          }

          return false;
        },
      }),
      [command, visibleItems],
    );

    return (
      <Command
        data-editor-slash-command
        loop
        shouldFilter={false}
        value={selectedTitle}
        onValueChange={(value) => {
          selectedTitleRef.current = value;
          setSelectedTitle(value);
        }}
        className="editor-floating-menu z-50 h-auto max-h-[340px] w-80 overflow-y-auto rounded-md border border-[var(--editor-line)] bg-white p-1 shadow-[0_20px_40px_rgba(37,32,24,0.14)]"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Command.Input value={query} readOnly className="sr-only" aria-label="筛选编辑器命令" />
        <Command.Empty className="px-3 py-2 text-sm text-[var(--editor-muted)]">
          没找到匹配项
        </Command.Empty>
        <Command.List>
          {visibleItems.map((item) => (
            <Command.Item
              key={item.title}
              value={item.title}
              keywords={[item.description, ...(item.searchTerms ?? [])]}
              onSelect={() => command(item)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition hover:bg-[var(--editor-soft)] aria-selected:bg-[var(--editor-soft)]"
            >
              {item.icon}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--editor-ink)]">
                  {item.title}
                </p>
                <p className="truncate text-xs text-[var(--editor-muted)]">{item.description}</p>
              </div>
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    );
  },
);

function createSlashRenderer() {
  let component: ReactRenderer<SlashCommandListHandle> | null = null;
  let popup: Instance | null = null;

  const destroy = () => {
    const currentPopup = popup;
    const currentComponent = component;
    popup = null;
    component = null;
    currentPopup?.destroy();
    currentComponent?.destroy();
  };

  return {
    onStart(props: SlashCommandListProps) {
      destroy();
      if (!props.clientRect || props.editor.isActive("codeBlock")) return;

      component = new ReactRenderer(SlashCommandList, {
        props,
        editor: props.editor,
      });
      popup = tippy(document.body, {
        getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: "manual",
        placement: "bottom-start",
        maxWidth: "none",
        hideOnClick: true,
        onHidden: destroy,
      });
    },
    onUpdate(props: SlashCommandListProps) {
      component?.updateProps(props);
      popup?.setProps({
        getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
      });
      popup?.popperInstance?.update();
    },
    onKeyDown(props: SuggestionKeyDownProps) {
      if (props.event.key === "Escape") {
        destroy();
        return true;
      }

      return component?.ref?.onKeyDown(props) ?? false;
    },
    onExit: destroy,
  };
}

export function createSlashCommand(items: SuggestionItem[]) {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion<SuggestionItem, SuggestionItem>({
          editor: this.editor,
          char: "/",
          items: () => items,
          allow: ({ editor }) => !editor.isActive("codeBlock"),
          command: ({ editor, range, props }) => {
            props.command?.({ editor, range });
          },
          render: createSlashRenderer,
        }),
      ];
    },
  });
}
