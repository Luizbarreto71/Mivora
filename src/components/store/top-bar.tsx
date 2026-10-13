"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";

/**
 * Thin black bar above the header. Desktop: every message in one line, separated by dots.
 * Mobile: one message at a time, rotating every few seconds (paused for reduced motion).
 */
export function TopBar({ messages, href }: { messages: string[]; href?: string | null }) {
  const [index, setIndex] = useState(0);
  const count = messages.length;

  useEffect(() => {
    if (count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % count), 4500);
    return () => window.clearInterval(t);
  }, [count]);

  if (count === 0) return null;
  const content = (
    <>
      <p className="hidden items-center justify-center gap-x-3 sm:flex">
        {messages.map((m, i) => (
          <Fragment key={m}>
            {i > 0 ? <span aria-hidden="true" className="text-paper/40">•</span> : null}
            <span>{m}</span>
          </Fragment>
        ))}
      </p>
      <p className="relative h-4 sm:hidden" aria-live="off">
        {messages.map((m, i) => (
          <span
            key={m}
            className="absolute inset-0 flex items-center justify-center truncate transition-opacity duration-500 motion-reduce:transition-none"
            style={{ opacity: i === index ? 1 : 0 }}
            aria-hidden={i === index ? undefined : true}
          >
            {m}
          </span>
        ))}
      </p>
    </>
  );
  return (
    <div className="bg-ink text-paper">
      <div className="container-page flex min-h-8 items-center justify-center py-1.5 text-center text-[0.6875rem] tracking-[0.02em] text-paper/90">
        {href ? (
          <Link href={href} className="w-full hover:text-paper">
            {content}
          </Link>
        ) : (
          <div className="w-full">{content}</div>
        )}
      </div>
    </div>
  );
}
