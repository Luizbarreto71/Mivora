import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { ProductGrid } from "@/components/store/product-card";
import { EmptyState, PageHeader } from "@/components/store/section";
import { buttonClasses } from "@/components/ui/button";
import { listProducts } from "@/lib/catalog/queries";

export const metadata: Metadata = {
  title: "Ofertas",
  description: "Ofertas vigentes na MIVORA.",
  alternates: { canonical: "/ofertas" },
};

export default async function OffersPage() {
  // Only products with a real previous price configured by the admin appear here.
  const { items } = await listProducts({ colecao: "ofertas", ordem: "preco-asc" }, 48);
  return (
    <>
      <PageHeader eyebrow="Condições especiais" title="Ofertas">
        <Breadcrumbs items={[{ label: "Ofertas" }]} className="mb-8" />
      </PageHeader>
      <div className="container-page py-12 sm:py-16">
        {items.length ? (
          <ProductGrid products={items} priorityCount={4} />
        ) : (
          <EmptyState
            title="Nenhuma oferta no momento"
            description="Quando houver condições especiais, elas aparecerão aqui."
            action={
              <Link href="/produtos" className={buttonClasses("outline")}>
                Ver todos os produtos
              </Link>
            }
          />
        )}
      </div>
    </>
  );
}
