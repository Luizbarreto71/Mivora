import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { MediaField } from "@/components/admin/media-field";
import { AdminPage, Card } from "@/components/admin/ui";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { deleteCategory, saveCategory } from "@/lib/admin/actions/content";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Categoria" };

export default async function CategoryEditPage({ params }: PageProps<"/admin/categorias/[id]">) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  const isNew = id === "nova";
  const { data: c } = isNew ? { data: null } : await supabase.from("categories").select("*").eq("id", id).maybeSingle();
  if (!isNew && !c) notFound();

  return (
    <AdminPage
      title={isNew ? "Nova categoria" : c!.name}
      back={{ href: "/admin/categorias", label: "Categorias" }}
      actions={
        !isNew ? (
          <ActionButton action={deleteCategory.bind(null, c!.id)} variant="danger" confirm="Excluir esta categoria? Os produtos continuarão cadastrados, apenas sem esta associação.">
            Excluir
          </ActionButton>
        ) : null
      }
    >
      <Card>
        <ActionForm action={saveCategory} className="grid gap-5 sm:grid-cols-2">
          {!isNew ? <input type="hidden" name="id" value={c!.id} /> : null}
          <Field label="Nome" htmlFor="name">
            <Input id="name" name="name" defaultValue={c?.name ?? ""} required />
          </Field>
          <Field label="URL amigável" htmlFor="slug" hint="Deixe em branco para gerar a partir do nome">
            <Input id="slug" name="slug" defaultValue={c?.slug ?? ""} />
          </Field>
          <Field label="Tipo" htmlFor="kind">
            <Select id="kind" name="kind" defaultValue={c?.kind ?? "product_type"}>
              <option value="product_type">Tipo de produto</option>
              <option value="concern">Necessidade cosmética</option>
            </Select>
          </Field>
          <Field label="Ordem de exibição" htmlFor="sort_order">
            <Input id="sort_order" name="sort_order" inputMode="numeric" defaultValue={c?.sort_order ?? 0} />
          </Field>
          <Field label="Descrição" htmlFor="description" className="sm:col-span-2">
            <Textarea id="description" name="description" defaultValue={c?.description ?? ""} rows={3} />
          </Field>
          <div className="sm:col-span-2">
            <MediaField name="image_url" label="Imagem (opcional)" defaultValue={c?.image_url ?? null} folder="categories" hint="Usada no quadro da home. Sem imagem, aparece a foto de um produto desta categoria." />
          </div>
          <div className="flex flex-wrap gap-6 sm:col-span-2">
            <Checkbox name="is_published" label="Publicada" defaultChecked={c?.is_published ?? true} />
            <Checkbox name="is_featured" label="Destaque na navegação" defaultChecked={c?.is_featured ?? false} />
            <Checkbox name="show_on_home" label="Mostrar na home em “Cuidados para cada necessidade” (só necessidades)" defaultChecked={c?.show_on_home ?? false} />
          </div>
          <Field label="Título SEO" htmlFor="seo_title">
            <Input id="seo_title" name="seo_title" defaultValue={c?.seo_title ?? ""} maxLength={70} />
          </Field>
          <Field label="Descrição SEO" htmlFor="seo_description">
            <Input id="seo_description" name="seo_description" defaultValue={c?.seo_description ?? ""} maxLength={170} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton>{isNew ? "Criar categoria" : "Salvar"}</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </AdminPage>
  );
}
