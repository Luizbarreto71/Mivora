"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ProductTab = { id: string; label: string; content: ReactNode };

/**
 * Accessible tabs (arrow keys, Home/End). Inactive panels stay in the HTML (hidden), so every
 * piece of product information is still indexed and printable.
 */
export function ProductTabs({ tabs }: { tabs: ProductTab[] }) {
  const base = useId();
  const [active, setActive] = useState(tabs[0]?.id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  if (tabs.length === 0) return null;

  const onKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (next == null) return;
    e.preventDefault();
    const index = (next + tabs.length) % tabs.length;
    setActive(tabs[index].id);
    refs.current[index]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Informações do produto" className="-mx-4 flex overflow-x-auto border-b border-line px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {tabs.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "relative -mb-px shrink-0 whitespace-nowrap border-b-2 px-1 pb-3.5 pt-1 text-[0.875rem] transition-colors [&:not(:first-child)]:ml-7",
                selected ? "border-ink font-semibold text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={t.id !== active}
          tabIndex={0}
          className="max-w-3xl py-8 text-[0.9375rem] leading-relaxed text-ink-soft focus-visible:outline-offset-4"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
