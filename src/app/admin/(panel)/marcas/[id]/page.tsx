import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { MediaField } from "@/components/admin/media-field";
import { AdminPage, Card } from "@/components/admin/ui";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { deleteBrand, saveBrand } from "@/lib/admin/actions/content";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Marca" };

export default async function BrandEditPage({ params }: PageProps<"/admin/marcas/[id]">) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  const isNew = id === "nova";
  const { data: b } = isNew ? { data: null } : await supabase.from("brands").select("*").eq("id", id).maybeSingle();
  if (!isNew && !b) notFound();

  return (
    <AdminPage
      title={isNew ? "Nova marca" : b!.name}
      back={{ href: "/admin/marcas", label: "Marcas" }}
      actions={!isNew ? <ActionButton action={deleteBrand.bind(null, b!.id)} variant="danger" confirm="Excluir esta marca?">Excluir</ActionButton> : null}
    >
      <Card>
        <ActionForm action={saveBrand} className="grid gap-5 sm:grid-cols-2">
          {!isNew ? <input type="hidden" name="id" value={b!.id} /> : null}
          <Field label="Nome" htmlFor="name">
            <Input id="name" name="name" defaultValue={b?.name ?? ""} required />
          </Field>
          <Field label="URL amigável" htmlFor="slug" hint="Deixe em branco para gerar a partir do nome">
            <Input id="slug" name="slug" defaultValue={b?.slug ?? ""} />
          </Field>
          <Field label="Frase de apresentação" htmlFor="tagline" className="sm:col-span-2">
            <Input id="tagline" name="tagline" defaultValue={b?.tagline ?? ""} />
          </Field>
          <Field label="Descrição" htmlFor="description" className="sm:col-span-2">
            <Textarea id="description" name="description" defaultValue={b?.description ?? ""} />
          </Field>
          <Field label="País de origem" htmlFor="origin_country">
            <Input id="origin_country" name="origin_country" defaultValue={b?.origin_country ?? ""} />
          </Field>
          <Field label="Site oficial" htmlFor="website_url">
            <Input id="website_url" name="website_url" defaultValue={b?.website_url ?? ""} placeholder="https://" />
          </Field>
          <div className="sm:col-span-2">
            <MediaField name="image_url" label="Imagem da marca (opcional)" defaultValue={b?.image_url ?? null} folder="brands" hint="Sem imagem, usamos a foto de um produto da marca." />
          </div>
          <Field label="Ordem de exibição" htmlFor="sort_order">
            <Input id="sort_order" name="sort_order" inputMode="numeric" defaultValue={b?.sort_order ?? 0} />
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox name="is_published" label="Publicada" defaultChecked={b?.is_published ?? true} />
          </div>
          <Field label="Título SEO" htmlFor="seo_title">
            <Input id="seo_title" name="seo_title" defaultValue={b?.seo_title ?? ""} maxLength={70} />
          </Field>
          <Field label="Descrição SEO" htmlFor="seo_description">
            <Input id="seo_description" name="seo_description" defaultValue={b?.seo_description ?? ""} maxLength={170} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton>{isNew ? "Criar marca" : "Salvar"}</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </AdminPage>
  );
}
