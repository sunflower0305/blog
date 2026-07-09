"use client";

import { useState, useRef, useEffect } from "react";

const WECHAT_QR_CODE_URL =
  "https://blog.zhangleyang.com/api/images/image/2026/06/2ebcb555e639bada-qrcode.jpg";
const PERSONAL_SITE_URL = "https://zhangleyang.com";

export function SiteFooter() {
  const [wechatOpen, setWechatOpen] = useState(false);
  const wechatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!wechatOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        wechatRef.current &&
        !wechatRef.current.contains(event.target as Node)
      ) {
        setWechatOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [wechatOpen]);

  return (
    <footer className="border-t border-[var(--editor-line)] mt-auto">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-2 px-4 py-5 text-center text-xs text-[var(--stone-gray)] sm:px-6">
        <span>© 2026</span>
        <span>·</span>
        <a
          href={PERSONAL_SITE_URL}
          className="hover:text-[var(--editor-ink)] transition-colors duration-150 underline-offset-2 hover:underline"
        >
          乐扬
        </a>
        <span>·</span>
        <div
          ref={wechatRef}
          className="relative"
          onMouseEnter={() => setWechatOpen(true)}
          onMouseLeave={() => setWechatOpen(false)}
          onFocus={() => setWechatOpen(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setWechatOpen(false);
            }
          }}
        >
          <button
            type="button"
            aria-expanded={wechatOpen}
            aria-controls="wechat-qrcode-popover"
            onClick={() => setWechatOpen((value) => !value)}
            className="cursor-pointer hover:text-[var(--editor-ink)] transition-colors duration-150 underline-offset-2 hover:underline"
          >
            微信公众号
          </button>

          {wechatOpen && (
            <div
              id="wechat-qrcode-popover"
              className="absolute bottom-full left-1/2 z-20 mb-3 w-[168px] -translate-x-1/2 rounded-lg border border-[var(--editor-line)] bg-[var(--background)] p-3 text-center shadow-lg"
            >
              {/* Keep this as a plain image so the R2 URL works without Next remote image config. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={WECHAT_QR_CODE_URL}
                width={120}
                height={120}
                alt="微信公众号二维码"
                loading="lazy"
                decoding="async"
                className="mx-auto h-[120px] w-[120px] rounded-md border border-[var(--editor-line)] bg-white object-contain"
              />
              <p className="mt-2 text-[var(--editor-muted)]">扫码关注</p>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
