import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { CatalogPageSkeleton, CatalogView } from "@/components/store/catalog/catalog-view";
import { getBrandBySlug } from "@/lib/catalog/queries";

export async function generateMetadata({ params }: PageProps<"/marcas/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) return { title: "Marca não encontrada", robots: { index: false } };
  return {
    title: brand.seo_title ?? brand.name,
    description: brand.seo_description ?? brand.description ?? `Produtos ${brand.name} na MIVORA.`,
    alternates: { canonical: `/marcas/${brand.slug}` },
    openGraph: { title: `${brand.name} | MIVORA`, url: `/marcas/${brand.slug}` },
  };
}

async function BrandContent({ params, searchParams }: PageProps<"/marcas/[slug]">) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();
  return (
    <>
      <div className="bg-ivory">
        <div className="container-page py-10 sm:py-14">
          <Breadcrumbs items={[{ label: "Marcas", href: "/marcas" }, { label: brand.name }]} className="mb-8" />
          <p className="t-label mb-3 text-rose-ink">{brand.origin_country ? `Marca · ${brand.origin_country}` : "Marca"}</p>
          <h1 className="t-h1">{brand.name}</h1>
          {brand.tagline ? <p className="mt-3 text-sm font-medium">{brand.tagline}</p> : null}
          {brand.description ? <p className="t-lead mt-4 max-w-2xl text-muted">{brand.description}</p> : null}
        </div>
      </div>
      <div className="container-page py-10 sm:py-14">
        <CatalogView basePath={`/marcas/${brand.slug}`} searchParams={searchParams} fixed={{ marca: [brand.slug] }} emptyTitle={`Novidades ${brand.name} em breve`} />
      </div>
    </>
  );
}

export default function BrandPage(props: PageProps<"/marcas/[slug]">) {
  return (
    <Suspense fallback={<CatalogPageSkeleton />}>
      <BrandContent {...props} />
    </Suspense>
  );
}
