import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { RitualBuilder } from "@/components/store/ritual-builder";
import { PageHeader } from "@/components/store/section";
import { getCategories, getHomeContent, getRitualCatalog } from "@/lib/catalog/queries";

export const metadata: Metadata = {
  title: "Monte seu ritual",
  description: "Escolha o seu objetivo de cuidado e receba sugestões de produtos para cada etapa da rotina de skincare.",
  alternates: { canonical: "/ritual" },
};

export default async function RitualPage() {
  const [concerns, content, products] = await Promise.all([getCategories("concern"), getHomeContent(), getRitualCatalog()]);
  return (
    <>
      <PageHeader
        eyebrow="Experiência MIVORA"
        title="Monte seu ritual"
        description="Escolha o seu principal objetivo e veja sugestões do nosso catálogo para cada etapa da rotina. É uma orientação cosmética: não substitui a avaliação de um dermatologista."
      >
        <Breadcrumbs items={[{ label: "Monte seu ritual" }]} className="mb-8" />
      </PageHeader>
      <div className="container-page py-12 sm:py-16">
        <RitualBuilder
          concerns={concerns.filter((c) => c.productCount > 0).map((c) => ({ slug: c.slug, name: c.name, description: c.description }))}
          steps={content.ritual}
          products={products}
        />
      </div>
    </>
  );
}
