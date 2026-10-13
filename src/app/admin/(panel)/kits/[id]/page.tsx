import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { KitItemsEditor } from "@/components/admin/kit-items-editor";
import { MediaField } from "@/components/admin/media-field";
import { AdminPage, Card } from "@/components/admin/ui";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { deleteKit, saveKit } from "@/lib/admin/actions/content";
import { requireAdmin } from "@/lib/admin/auth";
import { centsToInput } from "@/lib/money";

export const metadata: Metadata = { title: "Kit" };

export default async function KitEditPage({ params, searchParams }: PageProps<"/admin/kits/[id]">) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "novo";
  const [{ data: kit }, { data: products }] = await Promise.all([
    isNew ? Promise.resolve({ data: null }) : supabase.from("kits").select("*, items:kit_items(product_id, quantity, sort_order)").eq("id", id).maybeSingle(),
    supabase.from("products").select("id, name, status").neq("status", "archived").order("name"),
  ]);
  if (!isNew && !kit) notFound();
  const items = ((kit?.items ?? []) as { product_id: string; quantity: number; sort_order: number }[]).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <AdminPage
      title={isNew ? "Novo kit" : kit!.name}
      back={{ href: "/admin/kits", label: "Kits" }}
      actions={!isNew ? <ActionButton action={deleteKit.bind(null, kit!.id)} variant="danger" confirm="Excluir este kit?">Excluir</ActionButton> : null}
    >
      {sp.criado ? <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">Kit criado.</p> : null}
      <ActionForm action={saveKit} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {!isNew ? <input type="hidden" name="id" value={kit!.id} /> : null}
        <div className="space-y-6">
          <Card title="Informações">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nome do kit" htmlFor="name">
                <Input id="name" name="name" defaultValue={kit?.name ?? ""} required />
              </Field>
              <Field label="URL amigável" htmlFor="slug" hint="Deixe em branco para gerar a partir do nome">
                <Input id="slug" name="slug" defaultValue={kit?.slug ?? ""} />
              </Field>
              <Field label="Descrição curta" htmlFor="short_description" className="sm:col-span-2">
                <Textarea id="short_description" name="short_description" rows={2} defaultValue={kit?.short_description ?? ""} />
              </Field>
              <Field label="Descrição" htmlFor="description" className="sm:col-span-2">
                <Textarea id="description" name="description" rows={4} defaultValue={kit?.description ?? ""} />
              </Field>
              <div className="sm:col-span-2">
                <MediaField name="image_url" label="Imagem do kit" defaultValue={kit?.image_url ?? null} folder="kits" hint="Sem imagem, usamos a foto do primeiro produto." />
              </div>
            </div>
          </Card>
          <Card title="Produtos do kit">
            <KitItemsEditor products={products ?? []} initial={items} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Publicação e preço">
            <div className="space-y-4">
              <Field label="Status" htmlFor="status">
                <Select id="status" name="status" defaultValue={kit?.status ?? "draft"}>
                  <option value="draft">Rascunho</option>
                  <option value="published">Publicado</option>
                  <option value="archived">Arquivado</option>
                </Select>
              </Field>
              <Field label="Preço do kit (R$)" htmlFor="price" hint="Vazio = preço sob consulta">
                <Input id="price" name="price" inputMode="decimal" defaultValue={centsToInput(kit?.price_cents)} />
              </Field>
              <Field label="Preço anterior (R$)" htmlFor="compare_at_price">
                <Input id="compare_at_price" name="compare_at_price" inputMode="decimal" defaultValue={centsToInput(kit?.compare_at_price_cents)} />
              </Field>
              <Field label="Ordem" htmlFor="sort_order">
                <Input id="sort_order" name="sort_order" inputMode="numeric" defaultValue={kit?.sort_order ?? 0} />
              </Field>
              <Checkbox name="is_featured" label="Destaque" defaultChecked={kit?.is_featured ?? false} />
              <Field label="Título SEO" htmlFor="seo_title">
                <Input id="seo_title" name="seo_title" defaultValue={kit?.seo_title ?? ""} maxLength={70} />
              </Field>
              <Field label="Descrição SEO" htmlFor="seo_description">
                <Input id="seo_description" name="seo_description" defaultValue={kit?.seo_description ?? ""} maxLength={170} />
              </Field>
              <SubmitButton className="w-full">{isNew ? "Criar kit" : "Salvar kit"}</SubmitButton>
            </div>
          </Card>
        </div>
      </ActionForm>
    </AdminPage>
  );
}
