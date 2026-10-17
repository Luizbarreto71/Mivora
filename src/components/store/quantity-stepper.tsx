"use client";

import { Minus, Plus } from "lucide-react";
import { MAX_LINE_QUANTITY } from "@/lib/cart/math";
import { cn } from "@/lib/utils";

export function QuantityStepper({
  value,
  onChange,
  max,
  size = "md",
  label = "Quantidade",
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  max: number | null;
  size?: "sm" | "md";
  label?: string;
  className?: string;
}) {
  const upper = Math.min(max ?? MAX_LINE_QUANTITY, MAX_LINE_QUANTITY);
  const h = size === "sm" ? "h-9" : "h-12";
  const w = size === "sm" ? "w-9" : "w-11";
  return (
    <div className={cn("inline-flex items-center overflow-hidden rounded-control border border-line", h, className)} role="group" aria-label={label}>
      <button
        type="button"
        className={cn("flex h-full items-center justify-center hover:bg-ivory disabled:opacity-30", w)}
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label="Diminuir quantidade"
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
      <span className={cn("min-w-8 text-center text-sm tabular-nums", size === "md" && "min-w-10")} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={cn("flex h-full items-center justify-center hover:bg-ivory disabled:opacity-30", w)}
        onClick={() => onChange(Math.min(upper, value + 1))}
        disabled={value >= upper}
        aria-label="Aumentar quantidade"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
    </div>
  );
}
