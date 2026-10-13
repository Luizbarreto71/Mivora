import Link from "next/link";
import { SITE_URL } from "@/lib/env";
import { JsonLd } from "./json-ld";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  const all: Crumb[] = [{ label: "Início", href: "/" }, ...items];
  return (
    <>
      <nav aria-label="Trilha de navegação" className={className}>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {all.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-center gap-2">
              {i > 0 ? <span aria-hidden="true">/</span> : null}
              {c.href && i < all.length - 1 ? (
                <Link href={c.href} className="hover:text-ink hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={i === all.length - 1 ? "page" : undefined} className="text-ink">
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: all.map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: c.label,
            ...(c.href ? { item: `${SITE_URL}${c.href}` } : {}),
          })),
        }}
      />
    </>
  );
}
