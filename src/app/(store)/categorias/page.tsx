import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { PageHeader } from "@/components/store/section";
import { getCategories, type CategoryWithCount } from "@/lib/catalog/queries";

export const metadata: Metadata = {
  title: "Categorias",
  description: "Navegue pelo catálogo MIVORA por tipo de produto ou por necessidade cosmética.",
  alternates: { canonical: "/categorias" },
};

function CategoryList({ title, items, all }: { title: string; items: CategoryWithCount[]; all: CategoryWithCount[] }) {
  if (!items.length) return null;
  return (
    <section className="mb-16">
      <h2 className="eyebrow mb-6 text-ink">{title}</h2>
      <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <Link key={c.id} href={`/categorias/${c.slug}`} className="group flex min-h-36 flex-col justify-between bg-paper p-6 hover:bg-ivory">
            <div>
              <p className="heading-display text-[1.75rem]">{c.name}</p>
              {c.description ? <p className="mt-2 text-sm leading-relaxed text-muted">{c.description}</p> : null}
              {all.some((s) => s.parent_id === c.id && s.productCount > 0) ? (
                <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                  {all.filter((s) => s.parent_id === c.id && s.productCount > 0).map((s) => s.name).join(" · ")}
                </p>
              ) : null}
            </div>
            <p className="mt-5 flex items-center justify-between text-[0.6875rem] font-semibold uppercase tracking-[0.18em]">
              {c.productCount > 0 ? `${c.productCount} ${c.productCount === 1 ? "produto" : "produtos"}` : "Em breve"}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function CategoriesPage() {
  const categories = await getCategories();
  return (
    <>
      <PageHeader eyebrow="Explore" title="Categorias">
        <Breadcrumbs items={[{ label: "Categorias" }]} className="mb-8" />
      </PageHeader>
      <div className="container-page py-12 sm:py-16">
        <CategoryList title="Tipo de produto" items={categories.filter((c) => c.kind === "product_type" && !c.parent_id && c.productCount > 0)} all={categories} />
        <CategoryList title="Necessidades" items={categories.filter((c) => c.kind === "concern")} all={categories} />
      </div>
    </>
  );
}
