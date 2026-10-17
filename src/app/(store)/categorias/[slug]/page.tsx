import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { CatalogSkeleton, CatalogView } from "@/components/store/catalog/catalog-view";
import Image from "next/image";
import Link from "next/link";
import { getCategories, getCategoryBySlug } from "@/lib/catalog/queries";
import { cn } from "@/lib/utils";

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
      <div className="bg-ivory">
        <div className={cn("container-page grid gap-8 py-10 sm:py-14", category.image_url && "lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center lg:gap-14")}>
          <div className="min-w-0">
            <Breadcrumbs
              items={[{ label: "Categorias", href: "/categorias" }, ...(parent ? [{ label: parent.name, href: `/categorias/${parent.slug}` }] : []), { label: category.name }]}
              className="mb-8"
            />
            <p className="t-label mb-3 text-rose-ink">{category.kind === "concern" ? "Necessidade" : "Tipo de produto"}</p>
            <h1 className="t-h1">{category.name}</h1>
            <p className="mt-3 text-sm text-muted">
              {category.productCount} {category.productCount === 1 ? "produto" : "produtos"}
            </p>
            {category.description ? <p className="t-lead mt-4 max-w-2xl text-muted">{category.description}</p> : null}
            {children.length > 0 ? (
              <nav aria-label="Subcategorias" className="mt-8 flex flex-wrap gap-2">
                {children.map((c) => (
                  <Link key={c.id} href={`/categorias/${c.slug}`} className="rounded-full border border-line bg-paper px-4 py-2 text-sm transition-colors hover:border-ink">
                    {c.name} <span className="text-xs text-muted">{c.productCount}</span>
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
          {category.image_url ? (
            <div className="relative hidden aspect-[4/3] overflow-hidden rounded-panel lg:block">
              <Image src={category.image_url} alt="" fill sizes="24rem" className="object-cover" />
            </div>
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
