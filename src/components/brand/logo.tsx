import { cn } from "@/lib/utils";
import { LOCKUP_PATH, LOCKUP_VIEWBOX, SYMBOL_PATH, SYMBOL_VIEWBOX, WORDMARK_PATH, WORDMARK_VIEWBOX } from "./wordmark-path";

const VARIANTS = {
  wordmark: { viewBox: WORDMARK_VIEWBOX, d: WORDMARK_PATH },
  lockup: { viewBox: LOCKUP_VIEWBOX, d: LOCKUP_PATH },
  symbol: { viewBox: SYMBOL_VIEWBOX, d: SYMBOL_PATH },
} as const;

/**
 * Official MIVORA logo, vectorised from the supplied artwork.
 * - wordmark: horizontal name (header, compact spaces)
 * - lockup: flame symbol over the name (intro, footer, login)
 * - symbol: flame only (icons, ornaments)
 * The ® is only rendered when the owner enables it in settings (registration confirmed).
 */
export function Logo({
  className,
  variant = "wordmark",
  registered = false,
  title = "MIVORA",
}: {
  className?: string;
  variant?: keyof typeof VARIANTS;
  registered?: boolean;
  title?: string;
}) {
  const v = VARIANTS[variant];
  return (
    <span className={cn("inline-flex items-start", className)}>
      <svg viewBox={v.viewBox} role="img" aria-label={title} className="h-full w-auto" fill="currentColor">
        <path fillRule="evenodd" d={v.d} />
      </svg>
      {registered && variant !== "symbol" ? (
        <span aria-hidden="true" className="ml-[0.15em] text-[0.4em] leading-none">
          ®
        </span>
      ) : null}
    </span>
  );
}
