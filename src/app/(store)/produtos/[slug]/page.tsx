import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { FaqList } from "@/components/store/faq-list";
import { JsonLd } from "@/components/store/json-ld";
import { ProductGrid } from "@/components/store/product-card";
import { BuyBox } from "@/components/store/product/buy-box";
import { ProductGallery } from "@/components/store/product/product-gallery";
import { ProductTabs } from "@/components/store/product/product-tabs";
import { SectionHeading } from "@/components/store/section";
import { Badge } from "@/components/ui/badge";
import { getCategories, getHomeContent, getProductBySlug, getRecommendations } from "@/lib/catalog/queries";
import { SITE_URL } from "@/lib/env";
import { SKIN_TYPE_LABEL, type ProductDetail } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/produtos/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Produto não encontrado", robots: { index: false } };
  const title = product.seoTitle ?? product.name;
  const description = product.seoDescription ?? product.shortDescription ?? `${product.name} — ${product.brand.name} na MIVORA.`;
  const image = product.images[0]?.url;
  return {
    title,
    description,
    alternates: { canonical: `/produtos/${product.slug}` },
    openGraph: {
      type: "website",
      title: `${title} | MIVORA`,
      description,
      url: `/produtos/${product.slug}`,
      ...(image ? { images: [{ url: image, width: 1200, height: 1200, alt: product.name }] } : {}),
    },
  };
}

function productJsonLd(p: ProductDetail) {
  const url = `${SITE_URL}/produtos/${p.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.shortDescription ?? undefined,
    brand: { "@type": "Brand", name: p.brand.name },
    image: p.images.map((i) => (i.url.startsWith("http") ? i.url : `${SITE_URL}${i.url}`)),
    url,
    sku: p.code,
    // An Offer is only published with a real price for a product that is on sale
    ...(p.priceCents != null && (p.availability === "in_stock" || p.availability === "out_of_stock")
      ? {
          offers: {
            "@type": "Offer",
            url,
            priceCurrency: "BRL",
            price: (p.priceCents / 100).toFixed(2),
            availability: p.isAvailable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            seller: { "@type": "Organization", name: "MIVORA" },
          },
        }
      : {}),
  };
}


async function Recommendations({ productId }: { productId: string }) {
  const rec = await getRecommendations(productId);
  return (
    <>
      {rec.similar.length > 0 ? (
        <section className="container-page pt-20">
          <SectionHeading eyebrow="Para necessidades semelhantes" title="Você também pode gostar" />
          <ProductGrid products={rec.similar} />
        </section>
      ) : null}
      {rec.routine.length > 0 ? (
        <section className="container-page pt-20">
          <SectionHeading eyebrow="Próximas etapas" title="Complete seu ritual" description="Sugestões que se combinam com este produto. Não indicamos combinações de ativos que podem sensibilizar a pele, como retinoides com esfoliantes." />
          <ProductGrid products={rec.routine} />
        </section>
      ) : null}
      {rec.sameBrand.length > 0 ? (
        <section className="container-page pt-20">
          <SectionHeading eyebrow="Mesma marca" title="Mais produtos desta marca" />
          <ProductGrid products={rec.sameBrand} />
        </section>
      ) : null}
      {rec.discover.length > 0 ? (
        <section className="container-page pt-20">
          <SectionHeading eyebrow="Curadoria MIVORA" title="Descubra outros cuidados" />
          <ProductGrid products={rec.discover} />
        </section>
      ) : null}
    </>
  );
}

async function ProductContent({ params }: { params: PageProps<"/produtos/[slug]">["params"] }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  // Deepest product type, with its parent group for the breadcrumb
  const types = product.categories.filter((c) => c.kind === "product_type");
  const productType = types.find((c) => !types.some((o) => o.parent_id === c.id)) ?? types[0];
  const typeGroup = productType?.parent_id ? await getCategories().then((all) => all.find((c) => c.id === productType.parent_id && c.productCount > 0)) : undefined;
  const concerns = product.categories.filter((c) => c.kind === "concern");
  const skinTypes = product.skinTypes.map((s) => SKIN_TYPE_LABEL[s] ?? s);
  // product questions first; otherwise the general questions the store highlights
  const faqs = product.faqs.length > 0 ? product.faqs : (await getHomeContent()).faqs;

  return (
    <>
      <JsonLd data={productJsonLd(product)} />
      <div className="container-page pt-6 sm:pt-8">
        <Breadcrumbs
          items={[
            { label: "Produtos", href: "/produtos" },
            ...(typeGroup ? [{ label: typeGroup.name, href: `/categorias/${typeGroup.slug}` }] : []),
            ...(productType ? [{ label: productType.name, href: `/categorias/${productType.slug}` }] : []),
            { label: product.name },
          ]}
        />
      </div>

      <div className="container-page grid grid-cols-1 gap-10 pt-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16 xl:gap-24">
        <div className="-mx-4 min-w-0 sm:mx-0 lg:sticky lg:top-36 lg:self-start">
          <ProductGallery images={product.images} videoUrl={product.videoUrl} name={product.name} brand={product.brand.name} />
        </div>

        <div className="min-w-0 lg:py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/marcas/${product.brand.slug}`} className="eyebrow text-ink hover:underline">
              {product.brand.name}
            </Link>
            {product.isNew ? <Badge tone="blush">Novidade</Badge> : null}
            {product.availability === "coming_soon" ? <Badge tone="dark">Em breve</Badge> : null}
          </div>
          <h1 className="heading-display mt-3 text-[1.75rem] leading-[1.15] sm:text-[2.125rem]">{product.name}</h1>
          <p className="mt-3 text-sm text-muted">
            {[product.productLine && `Linha ${product.productLine}`, product.volume, `Cód. ${product.code}`].filter(Boolean).join(" · ")}
          </p>
          {product.shortDescription ? <p className="mt-6 text-base leading-relaxed text-ink-soft">{product.shortDescription}</p> : null}

          {product.benefits.length > 0 ? (
            <ul className="mt-6 space-y-2">
              {product.benefits.map((b) => (
                <li key={b} className="flex gap-3 text-sm">
                  <span className="mt-2 h-1 w-3 shrink-0 bg-ink" aria-hidden="true" />
                  {b}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-8 border-t border-line pt-8">
            <BuyBox product={product} />
          </div>
        </div>
      </div>

      <div className="container-page mt-16 sm:mt-20">
        <h2 className="sr-only">Detalhes do produto</h2>
        <ProductTabs
          tabs={[
            ...(product.description || skinTypes.length > 0 || concerns.length > 0
              ? [
                  {
                    id: "descricao",
                    label: "Descrição",
                    content: (
                      <>
                        {product.description ? <p className="whitespace-pre-line">{product.description}</p> : null}
                        {skinTypes.length > 0 || concerns.length > 0 ? (
                          <div className={product.description ? "mt-7" : undefined}>
                            <h3 className="text-[0.8125rem] font-semibold text-ink">Indicação</h3>
                            {skinTypes.length ? <p className="mt-2">{skinTypes.join(" · ")}</p> : null}
                            {concerns.length ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {concerns.map((c) => (
                                  <Link key={c.id} href={`/categorias/${c.slug}`} className="rounded-full border border-line px-3.5 py-1.5 text-xs hover:border-ink">
                                    {c.name}
                                  </Link>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ),
                  },
                ]
              : []),
            ...(product.benefits.length > 0
              ? [
                  {
                    id: "beneficios",
                    label: "Benefícios",
                    content: (
                      <ul className="grid gap-3 sm:grid-cols-2">
                        {product.benefits.map((b) => (
                          <li key={b} className="border border-line p-4">
                            {b}
                          </li>
                        ))}
                      </ul>
                    ),
                  },
                ]
              : []),
            ...(product.keyIngredients.length > 0 || product.ingredientsFull
              ? [
                  {
                    id: "ingredientes",
                    label: "Ingredientes",
                    content: (
                      <>
                        {product.keyIngredients.length > 0 ? (
                          <>
                            <h3 className="text-[0.8125rem] font-semibold text-ink">Ativos em destaque</h3>
                            <ul className="mt-3 flex flex-wrap gap-2">
                              {product.keyIngredients.map((i) => (
                                <li key={i} className="rounded-full bg-ivory px-4 py-2 text-sm text-ink">
                                  {i}
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                        {product.ingredientsFull ? (
                          <div className={product.keyIngredients.length > 0 ? "mt-7" : undefined}>
                            <h3 className="text-[0.8125rem] font-semibold text-ink">Composição completa</h3>
                            <p className="mt-2 text-xs leading-relaxed text-muted">{product.ingredientsFull}</p>
                          </div>
                        ) : null}
                      </>
                    ),
                  },
                ]
              : []),
            ...(product.howToUse || product.warnings
              ? [
                  {
                    id: "como-usar",
                    label: "Como usar",
                    content: (
                      <>
                        {product.howToUse ? <p className="whitespace-pre-line">{product.howToUse}</p> : null}
                        {product.warnings ? (
                          <div className={product.howToUse ? "mt-7" : undefined}>
                            <h3 className="text-[0.8125rem] font-semibold text-ink">Cuidados e precauções</h3>
                            <p className="mt-2 whitespace-pre-line">{product.warnings}</p>
                          </div>
                        ) : null}
                      </>
                    ),
                  },
                ]
              : []),
            ...(faqs.length > 0 ? [{ id: "perguntas", label: "Perguntas frequentes", content: <FaqList faqs={faqs} /> }] : []),
          ]}
        />
        <p className="max-w-3xl border-t border-line pt-6 text-xs leading-relaxed text-muted">
          Informações de caráter cosmético, baseadas nos dados do fabricante. Não substituem orientação médica. Leia a embalagem antes de usar e, em caso de condição de pele específica, consulte um dermatologista.
        </p>
      </div>

      <Suspense fallback={null}>
        <Recommendations productId={product.id} />
      </Suspense>
    </>
  );
}

export default function ProductPage({ params }: PageProps<"/produtos/[slug]">) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

function ProductSkeleton() {
  return (
    <div className="container-page grid gap-10 pt-14 lg:grid-cols-[1.15fr_1fr] lg:gap-16" aria-busy="true">
      <div className="aspect-square animate-pulse bg-ivory" />
      <div className="space-y-4 pt-4">
        <div className="h-3 w-24 animate-pulse bg-ivory" />
        <div className="h-10 w-4/5 animate-pulse bg-ivory" />
        <div className="h-4 w-1/3 animate-pulse bg-ivory" />
        <div className="h-24 animate-pulse bg-ivory" />
        <div className="h-12 animate-pulse bg-ivory" />
      </div>
    </div>
  );
}
