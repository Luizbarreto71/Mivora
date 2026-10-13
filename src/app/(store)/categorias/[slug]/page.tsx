import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { CatalogSkeleton, CatalogView } from "@/components/store/catalog/catalog-view";
import Link from "next/link";
import { getCategories, getCategoryBySlug } from "@/lib/catalog/queries";

export async function generateMetadata({ params }: PageProps<"/categorias/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Categoria não encontrada", robots: { index: false } };
  return {
    title: category.seo_title ?? category.name,
    description: category.seo_description ?? category.description ?? `${category.name} na MIVORA.`,
    alternates: { canonical: `/categorias/${category.slug}` },
    openGraph: { title: `${category.name} | MIVORA`, url: `/categorias/${category.slug}` },
  };
}

async function CategoryContent({ params, searchParams }: PageProps<"/categorias/[slug]">) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();
  const all = await getCategories();
  const parent = all.find((c) => c.id === category.parent_id);
  const children = all.filter((c) => c.parent_id === category.id && c.productCount > 0);
  const fixed = category.kind === "concern" ? { necessidade: [category.slug] } : { categoria: [category.slug] };
  return (
    <>
      <div className="border-b border-line bg-ivory">
        <div className="container-page py-12 sm:py-16">
          <Breadcrumbs
            items={[{ label: "Categorias", href: "/categorias" }, ...(parent ? [{ label: parent.name, href: `/categorias/${parent.slug}` }] : []), { label: category.name }]}
            className="mb-8"
          />
          <p className="eyebrow mb-3">{category.kind === "concern" ? "Necessidade" : "Tipo de produto"}</p>
          <h1 className="heading-display text-[2.125rem] sm:text-[2.75rem]">{category.name}</h1>
          {category.description ? <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">{category.description}</p> : null}
          {children.length > 0 ? (
            <nav aria-label="Subcategorias" className="mt-8 flex flex-wrap gap-2">
              {children.map((c) => (
                <Link key={c.id} href={`/categorias/${c.slug}`} className="rounded-full border border-line bg-paper px-4 py-2 text-sm hover:border-ink">
                  {c.name} <span className="text-xs text-muted">{c.productCount}</span>
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </div>
      <div className="container-page py-10 sm:py-14">
        <CatalogView
          basePath={`/categorias/${category.slug}`}
          searchParams={searchParams}
          fixed={fixed}
          emptyTitle="Em breve nesta categoria"
          emptyDescription="Estamos selecionando produtos para esta categoria. Enquanto isso, explore o catálogo completo ou fale com a gente pelo WhatsApp."
        />
      </div>
    </>
  );
}

export default function CategoryPage(props: PageProps<"/categorias/[slug]">) {
  return (
    <Suspense
      fallback={
        <div className="container-page py-16">
          <CatalogSkeleton />
        </div>
      }
    >
      <CategoryContent {...props} />
    </Suspense>
  );
}
