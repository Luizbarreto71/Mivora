import type { Metadata } from "next";
import { ImportForm } from "@/components/admin/import-form";
import { AdminPage, Card } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { CATALOG_COLUMNS } from "@/lib/admin/catalog-csv";

export const metadata: Metadata = { title: "Importar catálogo" };

export default async function ImportPage() {
  await requireAdmin();
  return (
    <AdminPage
      title="Importar catálogo"
      description="Crie ou atualize produtos em lote a partir de uma planilha CSV. A importação pode ser repetida sem duplicar produtos."
      back={{ href: "/admin/produtos", label: "Produtos" }}
      actions={
        <a href="/api/admin/produtos/csv" className="inline-flex h-9 items-center rounded-md border border-line bg-paper px-3 text-sm hover:border-ink">
          Baixar catálogo atual (modelo)
        </a>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <ImportForm />
        </Card>
        <Card title="Como funciona">
          <ul className="space-y-2 text-xs leading-relaxed text-muted">
            <li>A coluna <strong>slug</strong> identifica o produto. Slug existente = atualização; novo = criação.</li>
            <li>Células vazias não alteram nada: preços, estoque e fotos atuais são preservados.</li>
            <li>Novos produtos entram como <strong>rascunho</strong> e <strong>em breve</strong>, sem preço nem estoque, a menos que a planilha diga o contrário.</li>
            <li>A venda de um produto novo continua bloqueada até a documentação ser marcada como verificada no cadastro.</li>
            <li>
              <strong>marca</strong>: nome ou slug (marcas novas são criadas). <strong>categorias</strong> e <strong>tags</strong>: separe com <code>|</code>.
            </li>
            <li>
              <strong>visibilidade</strong>: rascunho, publicado ou arquivado. <strong>disponibilidade</strong>: disponivel, em-breve ou esgotado.
            </li>
            <li>Preços no formato 129,90. Separador de colunas: ponto e vírgula ou vírgula.</li>
            <li>Colunas aceitas: {CATALOG_COLUMNS.join(", ")}.</li>
          </ul>
        </Card>
      </div>
    </AdminPage>
  );
}
