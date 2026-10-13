import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { CatalogSkeleton, CatalogView } from "@/components/store/catalog/catalog-view";
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
      <div className="border-b border-line bg-ivory">
        <div className="container-page py-12 sm:py-16">
          <Breadcrumbs items={[{ label: "Marcas", href: "/marcas" }, { label: brand.name }]} className="mb-8" />
          <p className="eyebrow mb-3">{brand.origin_country ? `Marca · ${brand.origin_country}` : "Marca"}</p>
          <h1 className="heading-display text-[2.25rem] sm:text-[3rem]">{brand.name}</h1>
          {brand.tagline ? <p className="mt-3 text-sm font-medium">{brand.tagline}</p> : null}
          {brand.description ? <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">{brand.description}</p> : null}
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
    <Suspense
      fallback={
        <div className="container-page py-16">
          <CatalogSkeleton />
        </div>
      }
    >
      <BrandContent {...props} />
    </Suspense>
  );
}
