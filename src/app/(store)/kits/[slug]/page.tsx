import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { KitAddButton } from "@/components/store/kit-add-button";
import { Price } from "@/components/store/price";
import { ProductGrid } from "@/components/store/product-card";
import { getKitBySlug } from "@/lib/catalog/queries";
import { formatBRL } from "@/lib/money";

export async function generateMetadata({ params }: PageProps<"/kits/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const kit = await getKitBySlug(slug);
  if (!kit) return { title: "Kit não encontrado", robots: { index: false } };
  return {
    title: kit.seoTitle ?? `Kit ${kit.name}`,
    description: kit.seoDescription ?? kit.shortDescription ?? undefined,
    alternates: { canonical: `/kits/${kit.slug}` },
  };
}

async function KitContent({ params }: { params: PageProps<"/kits/[slug]">["params"] }) {
  const { slug } = await params;
  const kit = await getKitBySlug(slug);
  if (!kit) notFound();
  const separate = kit.items.every((i) => i.product.priceCents != null)
    ? kit.items.reduce((sum, i) => sum + (i.product.priceCents ?? 0) * i.quantity, 0)
    : null;
  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Kits", href: "/kits" }, { label: kit.name }]} />
      <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="relative aspect-square bg-ivory">
          {kit.imageUrl ? <Image src={kit.imageUrl} alt={kit.name} fill preload sizes="(min-width:1024px) 50vw, 100vw" className="product-photo object-contain p-[10%]" /> : null}
        </div>
        <div>
          <p className="eyebrow">Kit · {kit.items.length} produtos</p>
          <h1 className="heading-display mt-3 text-[2.5rem] sm:text-[3rem]">{kit.name}</h1>
          {kit.shortDescription ? <p className="mt-5 leading-relaxed text-ink-soft">{kit.shortDescription}</p> : null}
          <div className="mt-6">
            <Price priceCents={kit.priceCents} compareAtCents={kit.compareAtCents} size="lg" />
            {separate != null && kit.priceCents != null && separate > kit.priceCents ? (
              <p className="mt-1 text-xs text-muted">Valor dos itens comprados separadamente: {formatBRL(separate)}</p>
            ) : null}
          </div>
          <ul className="mt-8 divide-y divide-line border-y border-line text-sm">
            {kit.items.map((i) => (
              <li key={i.product.id} className="flex justify-between gap-4 py-3">
                <span>
                  {i.quantity > 1 ? `${i.quantity}× ` : ""}
                  {i.product.name}
                </span>
                {!i.product.isAvailable ? <span className="text-xs text-danger">Indisponível</span> : null}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <KitAddButton kit={kit} />
          </div>
          {kit.description ? <p className="mt-10 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-soft">{kit.description}</p> : null}
        </div>
      </div>
      <section className="pt-20">
        <h2 className="heading-display mb-10 text-[2.25rem]">Produtos do kit</h2>
        <ProductGrid products={kit.items.map((i) => i.product)} />
      </section>
    </div>
  );
}

export default function KitPage({ params }: PageProps<"/kits/[slug]">) {
  return (
    <Suspense fallback={<div className="container-page h-[60vh] animate-pulse bg-ivory" />}>
      <KitContent params={params} />
    </Suspense>
  );
}
