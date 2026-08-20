"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ListTree } from "lucide-react";
import type { ArticleTocHeading } from "@/lib/article-toc";

type ArticleTocProps = {
  headings: ArticleTocHeading[];
};

function TocLinks({
  headings,
  activeId,
  onNavigate,
}: {
  headings: ArticleTocHeading[];
  activeId: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <ol className="space-y-0.5">
      {headings.map((heading) => {
        const active = heading.id === activeId;
        return (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              aria-current={active ? "location" : undefined}
              onClick={() => onNavigate(heading.id)}
              className={`group/toc-link relative flex min-h-10 items-center py-2 pr-2 text-sm leading-5 transition-colors duration-150 active:scale-[0.98] ${
                heading.level === 3 ? "pl-7" : "pl-4"
              } ${
                active
                  ? "font-medium text-[var(--editor-accent)]"
                  : "text-[var(--editor-muted)] [@media(hover:hover)]:hover:text-[var(--editor-ink)]"
              }`}
            >
              <span
                aria-hidden
                className={`absolute left-0 h-1.5 w-1.5 rounded-full transition-[background-color,transform] duration-150 ${
                  active
                    ? "scale-100 bg-[var(--editor-accent)]"
                    : "scale-50 bg-transparent group-hover/toc-link:bg-[var(--editor-line)]"
                }`}
              />
              <span>{heading.text}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

export function ArticleToc({ headings }: ArticleTocProps) {
  const [activeId, setActiveId] = useState(headings[0]?.id ?? "");
  const mobileDetailsRef = useRef<HTMLDetailsElement>(null);
  const manualTargetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (headings.length < 2) return;

    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element instanceof HTMLElement);
    if (elements.length === 0) return;

    let hashId = window.location.hash.slice(1);
    try {
      hashId = decodeURIComponent(hashId);
    } catch {
      // Keep malformed hashes inert instead of breaking the scroll observer.
    }
    if (headings.some((heading) => heading.id === hashId)) {
      manualTargetIdRef.current = hashId;
      setActiveId(hashId);
    }

    const updateActiveHeading = () => {
      const manualTarget = manualTargetIdRef.current
        ? document.getElementById(manualTargetIdRef.current)
        : null;
      if (manualTarget) {
        const { top, bottom } = manualTarget.getBoundingClientRect();
        if (bottom > 0 && top < window.innerHeight) {
          setActiveId(manualTarget.id);
          return;
        }
        manualTargetIdRef.current = null;
      }

      const activationLine = 112;
      let current = elements[0];

      for (const element of elements) {
        if (element.getBoundingClientRect().top <= activationLine) current = element;
        else break;
      }

      setActiveId(current.id);
    };

    updateActiveHeading();
    const observer = new IntersectionObserver(updateActiveHeading, {
      rootMargin: "-96px 0px -70% 0px",
      threshold: [0, 1],
    });
    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  const handleNavigate = (id: string) => {
    manualTargetIdRef.current = id;
    setActiveId(id);
  };

  return (
    <>
      <details
        ref={mobileDetailsRef}
        className="article-toc-mobile group mb-8 border-y border-[var(--editor-line)] lg:hidden"
      >
        <summary className="flex min-h-12 cursor-pointer list-none touch-manipulation items-center gap-2 text-sm font-medium text-[var(--editor-ink)] active:scale-[0.98] [&::-webkit-details-marker]:hidden">
          <ListTree className="h-4 w-4 text-[var(--editor-accent)]" aria-hidden />
          <span>文章目录</span>
          <span className="ml-auto max-w-[55%] truncate text-xs font-normal text-[var(--stone-gray)]">
            {headings.length} 节
          </span>
          <ChevronDown
            className="h-4 w-4 text-[var(--stone-gray)] transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden
          />
        </summary>
        <nav aria-label="文章目录" className="border-t border-[var(--editor-line)] py-2">
          <TocLinks
            headings={headings}
            activeId={activeId}
            onNavigate={(id) => {
              handleNavigate(id);
              mobileDetailsRef.current?.removeAttribute("open");
            }}
          />
        </nav>
      </details>

      <aside
        className="article-toc-desktop hidden min-w-0 lg:col-start-2 lg:row-start-1 lg:block"
        aria-label="文章目录"
      >
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain py-1">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-[var(--stone-gray)]">
            <span className="h-px w-5 bg-[var(--editor-line)]" aria-hidden />
            文章目录
          </div>
          <nav>
            <TocLinks headings={headings} activeId={activeId} onNavigate={handleNavigate} />
          </nav>
        </div>
      </aside>
    </>
  );
}
