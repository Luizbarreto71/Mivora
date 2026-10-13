import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AdminPage({ title, description, actions, back, children }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      {back ? (
        <Link href={back.href} className="mb-4 inline-block text-xs text-muted hover:text-ink">
          ← {back.label}
        </Link>
      ) : null}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1.5 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, description, actions, children, className }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-line bg-paper", className)}>
      {title ? (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, href, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "default" | "warning" | "success" }) {
  const body = (
    <>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", tone === "warning" && "text-warning", tone === "success" && "text-success")}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </>
  );
  const cls = "block rounded-lg border border-line bg-paper p-5 transition hover:border-ink/30";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-line bg-paper", className)}>
      <table className="w-full min-w-[40rem] text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return <th className={cn("border-b border-line bg-ivory/60 px-4 py-3 text-xs font-semibold text-muted", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-line px-4 py-3 align-middle last:border-b-0", className)} {...props} />;
}

export function StatusPill({ tone, children }: { tone: "green" | "gray" | "amber" | "red" | "blue" | "dark"; children: ReactNode }) {
  const tones = {
    green: "bg-success/10 text-success",
    gray: "bg-ivory text-muted",
    amber: "bg-warning/10 text-warning",
    red: "bg-danger/10 text-danger",
    blue: "bg-[#1d4ed8]/10 text-[#1d4ed8]",
    dark: "bg-ink text-paper",
  } as const;
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted">
        {children}
      </td>
    </tr>
  );
}
