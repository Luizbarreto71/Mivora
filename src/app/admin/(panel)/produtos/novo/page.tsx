import type { Metadata } from "next";
import { ProductForm } from "@/components/admin/product-form";
import { AdminPage } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { EMPTY_PRODUCT, loadFormOptions } from "@/lib/admin/product-loader";
import { slugify } from "@/lib/utils";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NewProductPage({ searchParams }: PageProps<"/admin/produtos/novo">) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const options = await loadFormOptions(supabase);
  // Pre-fill from a product suggestion ("Criar rascunho")
  const name = typeof sp.nome === "string" ? sp.nome.slice(0, 160) : "";
  const brandName = typeof sp.marca === "string" ? sp.marca.toLowerCase() : "";
  const brandId = options.brands.find((b) => b.name.toLowerCase() === brandName)?.id ?? "";
  return (
    <AdminPage title="Novo produto" description="Salve o cadastro para depois enviar as fotos." back={{ href: "/admin/produtos", label: "Produtos" }}>
      <ProductForm initial={{ ...EMPTY_PRODUCT, name, slug: slugify(name), brandId }} {...options} stock={null} />
    </AdminPage>
  );
}
