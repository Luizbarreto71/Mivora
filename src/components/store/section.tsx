import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  href,
  hrefLabel = "Ver todos",
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  href?: string;
  hrefLabel?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex gap-4 sm:mb-8", align === "center" ? "flex-col items-center text-center" : "items-end justify-between", className)}>
      <div className={cn("min-w-0 max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow ? <p className="eyebrow mb-2.5">{eyebrow}</p> : null}
        <h2 className="heading-display text-[1.375rem] sm:text-[1.625rem]">{title}</h2>
        {description ? <p className="mt-1.5 text-[0.875rem] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-1.5 pb-1 text-[0.8125rem] font-medium text-ink/80 hover:text-ink">
          {hrefLabel}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.75} />
        </Link>
      ) : null}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="border-b border-line bg-ivory">
      <div className="container-page py-12 sm:py-16">
        {children}
        {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
        <h1 className="heading-display text-[2rem] sm:text-[2.75rem]">{title}</h1>
        {description ? <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">{description}</p> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center border border-dashed border-line px-6 py-16 text-center">
      <p className="heading-display text-xl">{title}</p>
      {description ? <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-7">{action}</div> : null}
    </div>
  );
}
