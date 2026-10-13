import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { FavoritesList } from "@/components/store/favorites-list";
import { PageHeader } from "@/components/store/section";

export const metadata: Metadata = {
  title: "Favoritos",
  robots: { index: false, follow: true },
};

export default function FavoritesPage() {
  return (
    <>
      <PageHeader eyebrow="Salvos neste dispositivo" title="Favoritos" description="Seus produtos favoritos ficam guardados neste navegador, sem necessidade de cadastro.">
        <Breadcrumbs items={[{ label: "Favoritos" }]} className="mb-8" />
      </PageHeader>
      <div className="container-page py-12 sm:py-16">
        <FavoritesList />
      </div>
    </>
  );
}
