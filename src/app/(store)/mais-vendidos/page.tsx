import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { ProductGrid } from "@/components/store/product-card";
import { PageHeader } from "@/components/store/section";
import { getBestSellers } from "@/lib/catalog/queries";

export const metadata: Metadata = {
  title: "Mais vendidos",
  description: "Os produtos mais procurados na MIVORA.",
  alternates: { canonical: "/mais-vendidos" },
};

export default async function BestSellersPage() {
  const { products, basedOnSales } = await getBestSellers(24);
  return (
    <>
      <PageHeader
        eyebrow={basedOnSales ? "Escolha de quem compra" : "Favoritos da curadoria"}
        title="Mais vendidos"
        description={
          basedOnSales
            ? "Ranking baseado nos pedidos confirmados na MIVORA."
            : "Enquanto reunimos dados de vendas confirmadas, apresentamos os destaques escolhidos pela nossa curadoria."
        }
      >
        <Breadcrumbs items={[{ label: "Mais vendidos" }]} className="mb-8" />
      </PageHeader>
      <div className="container-page py-12 sm:py-16">
        <ProductGrid products={products} priorityCount={4} />
      </div>
    </>
  );
}
