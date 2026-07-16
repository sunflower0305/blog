"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
}

export function Tabs({ tabs, defaultTab }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const requestedActiveIndex = tabs.findIndex((tab) => tab.id === activeTab);
  const activeIndex = requestedActiveIndex >= 0 ? requestedActiveIndex : tabs.length > 0 ? 0 : -1;
  const activeContent = activeIndex >= 0 ? tabs[activeIndex]?.content : undefined;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined;

    switch (event.key) {
      case "ArrowLeft":
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case "ArrowRight":
        nextIndex = (index + 1) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;

    setActiveTab(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div>
      {/* Tab 导航 */}
      <div className="border-b border-[var(--editor-line)] mb-6">
        <div className="flex gap-1" role="tablist" aria-label="选项卡">
          {tabs.map((tab, index) => {
            const isActive = activeIndex === index;
            const tabId = `${baseId}-tab-${index}`;
            const panelId = `${baseId}-panel-${index}`;

            return (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={tabId}
                aria-controls={isActive ? panelId : undefined}
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  "relative px-4 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "text-[var(--editor-accent)]"
                    : "text-[var(--editor-muted)] hover:text-[var(--editor-ink)]",
                )}
              >
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--editor-accent)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 内容 */}
      {activeIndex >= 0 && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${activeIndex}`}
          aria-labelledby={`${baseId}-tab-${activeIndex}`}
          tabIndex={0}
        >
          {activeContent}
        </div>
      )}
    </div>
  );
}
