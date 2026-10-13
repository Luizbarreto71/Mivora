import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { ProductGrid } from "@/components/store/product-card";
import { PageHeader } from "@/components/store/section";
import { listProducts } from "@/lib/catalog/queries";

export const metadata: Metadata = {
  title: "Novidades",
  description: "Os lançamentos e as chegadas mais recentes da MIVORA.",
  alternates: { canonical: "/novidades" },
};

export default async function NewArrivalsPage() {
  const flagged = await listProducts({ novidades: true, ordem: "novidades" }, 48);
  // Until products are flagged as "novidade", show the latest arrivals in the catalogue.
  const products = flagged.items.length ? flagged.items : (await listProducts({ ordem: "novidades" }, 12)).items;
  return (
    <>
      <PageHeader
        eyebrow="Acabou de chegar"
        title="Novidades"
        description={flagged.items.length ? "Os lançamentos selecionados pela MIVORA." : "As chegadas mais recentes ao nosso catálogo."}
      >
        <Breadcrumbs items={[{ label: "Novidades" }]} className="mb-8" />
      </PageHeader>
      <div className="container-page py-12 sm:py-16">
        <ProductGrid products={products} priorityCount={4} />
      </div>
    </>
  );
}
