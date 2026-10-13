import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "dark" | "blush" | "outline" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-ivory text-ink",
  dark: "bg-ink text-paper",
  blush: "bg-blush text-ink",
  outline: "border border-line bg-paper text-muted",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[2px] px-2 py-1 text-[0.625rem] font-semibold uppercase leading-none tracking-[0.16em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
