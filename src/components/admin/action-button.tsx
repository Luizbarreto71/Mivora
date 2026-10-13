"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Runs a Server Action on click, with optional confirmation and inline feedback. */
export function ActionButton({
  action,
  children,
  confirm,
  className,
  variant = "default",
}: {
  action: () => Promise<{ ok: boolean; message?: string } | void>;
  children: ReactNode;
  confirm?: string;
  className?: string;
  variant?: "default" | "danger" | "primary";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          start(async () => {
            const res = await action();
            if (res && !res.ok) setError(res.message ?? "Erro.");
            router.refresh();
          });
        }}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition disabled:opacity-50",
          variant === "danger" && "border-danger/30 text-danger hover:bg-danger/5",
          variant === "primary" && "border-ink bg-ink text-paper hover:bg-ink-soft",
          variant === "default" && "border-line hover:border-ink/40",
          className,
        )}
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {children}
      </button>
      {error ? <span className="mt-1 text-xs text-danger">{error}</span> : null}
    </span>
  );
}
