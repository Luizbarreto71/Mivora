import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Real price only. No price → "Consultar preço"; "de/por" only with a real higher previous price. */
export function Price({
  priceCents,
  compareAtCents,
  className,
  size = "md",
}: {
  priceCents: number | null;
  compareAtCents?: number | null;
  className?: string;
  size?: "md" | "lg";
}) {
  if (priceCents == null) {
    return <span className={cn("text-[0.8125rem] font-medium text-muted", className)}>Consultar preço</span>;
  }
  const showCompare = compareAtCents != null && compareAtCents > priceCents;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      {showCompare ? (
        <span className={cn("text-muted line-through", size === "lg" ? "text-base" : "text-xs")}>
          <span className="sr-only">De </span>
          {formatBRL(compareAtCents)}
        </span>
      ) : null}
      <span className={cn("font-semibold tabular-nums text-ink", size === "lg" ? "text-2xl" : "text-[0.9375rem]")}>
        {showCompare ? <span className="sr-only">Por </span> : null}
        {formatBRL(priceCents)}
      </span>
    </span>
  );
}
