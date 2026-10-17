import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "dark" | "blush" | "accent" | "outline" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-ivory text-ink",
  dark: "bg-ink text-paper",
  blush: "bg-rose text-rose-ink",
  accent: "bg-accent text-paper",
  outline: "border border-line bg-paper text-muted",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

/** Small status label (Novidade, Oferta, Sob consulta…): only for facts registered in the admin. */
export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[0.625rem] font-semibold uppercase leading-none tracking-[0.1em]", tones[tone], className)}>
      {children}
    </span>
  );
}
