import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { CatalogSkeleton, CatalogView } from "@/components/store/catalog/catalog-view";
import { PageHeader } from "@/components/store/section";

export const metadata: Metadata = {
  title: "Todos os produtos",
  description: "Catálogo MIVORA de skincare coreano e beleza internacional: séruns, ampolas, cremes, discos faciais e cuidados para os olhos.",
  alternates: { canonical: "/produtos" },
};

export default function ProductsPage({ searchParams }: PageProps<"/produtos">) {
  return (
    <>
      <PageHeader eyebrow="Catálogo" title="Todos os produtos" description="Skincare selecionado com cuidado. Filtre por marca, tipo de produto, necessidade ou tipo de pele.">
        <Breadcrumbs items={[{ label: "Produtos" }]} className="mb-8" />
      </PageHeader>
      <div className="container-page py-10 sm:py-14">
        <Suspense fallback={<CatalogSkeleton />}>
          <CatalogView basePath="/produtos" searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}
