import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "link" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold uppercase tracking-[0.14em] transition-colors duration-200 disabled:pointer-events-none disabled:opacity-45 select-none";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-soft",
  secondary: "bg-ivory text-ink hover:bg-sand",
  outline: "border border-ink text-ink hover:bg-ink hover:text-paper",
  ghost: "text-ink hover:bg-ivory",
  link: "text-ink underline-offset-4 hover:underline tracking-[0.12em] px-0",
  danger: "bg-danger text-paper hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[0.6875rem] rounded-[2px]",
  md: "h-11 px-6 text-xs rounded-[2px]",
  lg: "h-13 px-8 text-xs rounded-[2px] min-h-[3.25rem]",
  icon: "h-11 w-11 rounded-full",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function LinkButton({ variant = "primary", size = "md", className, ...props }: LinkButtonProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
