import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { MediaField } from "@/components/admin/media-field";
import { AdminPage, Card } from "@/components/admin/ui";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { deleteBanner, deleteRitualStep, saveBanner, saveRitualStep } from "@/lib/admin/actions/content";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Conteúdo da home" };

type BannerRow = {
  id: string;
  placement: string;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  cta_label: string | null;
  cta_href: string | null;
  cta2_label: string | null;
  cta2_href: string | null;
  image_desktop_url: string | null;
  image_mobile_url: string | null;
  image_alt: string | null;
  is_active: boolean;
  sort_order: number;
};

function BannerForm({ banner }: { banner?: BannerRow }) {
  return (
    <ActionForm action={saveBanner} resetOnSuccess={!banner} className="grid gap-4 sm:grid-cols-2">
      {banner ? <input type="hidden" name="id" value={banner.id} /> : null}
      <Field label="Posição" htmlFor={`placement-${banner?.id ?? "new"}`}>
        <Select id={`placement-${banner?.id ?? "new"}`} name="placement" defaultValue={banner?.placement ?? "hero"}>
          <option value="hero">Banner principal (hero)</option>
          <option value="editorial">Vitrine editorial</option>
        </Select>
      </Field>
      <Field label="Ordem" htmlFor={`sort-${banner?.id ?? "new"}`}>
        <Input id={`sort-${banner?.id ?? "new"}`} name="sort_order" inputMode="numeric" defaultValue={banner?.sort_order ?? 0} />
      </Field>
      <Field label="Chamada superior" htmlFor={`eyebrow-${banner?.id ?? "new"}`}>
        <Input id={`eyebrow-${banner?.id ?? "new"}`} name="eyebrow" defaultValue={banner?.eyebrow ?? ""} />
      </Field>
      <Field label="Título" htmlFor={`title-${banner?.id ?? "new"}`}>
        <Input id={`title-${banner?.id ?? "new"}`} name="title" defaultValue={banner?.title ?? ""} required />
      </Field>
      <Field label="Subtítulo" htmlFor={`subtitle-${banner?.id ?? "new"}`} className="sm:col-span-2">
        <Textarea id={`subtitle-${banner?.id ?? "new"}`} name="subtitle" rows={2} defaultValue={banner?.subtitle ?? ""} />
      </Field>
      <Field label="Botão principal — texto">
        <Input name="cta_label" defaultValue={banner?.cta_label ?? ""} />
      </Field>
      <Field label="Botão principal — link" hint="Ex.: /produtos">
        <Input name="cta_href" defaultValue={banner?.cta_href ?? ""} />
      </Field>
      <Field label="Botão secundário — texto">
        <Input name="cta2_label" defaultValue={banner?.cta2_label ?? ""} />
      </Field>
      <Field label="Botão secundário — link">
        <Input name="cta2_href" defaultValue={banner?.cta2_href ?? ""} />
      </Field>
      <MediaField name="image_desktop_url" label="Imagem (desktop)" defaultValue={banner?.image_desktop_url ?? null} folder="banners" hint="Foto vertical (retrato, ex.: 4:5) funciona melhor; o enquadramento é pelo centro. Sem imagem, a home compõe fotos reais dos produtos." />
      <MediaField name="image_mobile_url" label="Imagem (celular, opcional)" defaultValue={banner?.image_mobile_url ?? null} folder="banners" />
      <Field label="Descrição da imagem (acessibilidade)" className="sm:col-span-2">
        <Input name="image_alt" defaultValue={banner?.image_alt ?? ""} />
      </Field>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <Checkbox name="is_active" label="Ativo" defaultChecked={banner?.is_active ?? true} />
        <SubmitButton variant={banner ? "outline" : "primary"}>{banner ? "Salvar banner" : "Criar banner"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export default async function ContentPage() {
  const { supabase } = await requireAdmin();
  const [{ data: banners }, { data: steps }, { data: categories }, { data: featured }] = await Promise.all([
    supabase.from("banners").select("*").order("placement").order("sort_order"),
    supabase.from("ritual_steps").select("*").order("sort_order"),
    supabase.from("categories").select("id, name, kind").order("kind").order("sort_order"),
    supabase.from("products").select("id, name, featured_order").eq("is_featured", true).eq("status", "published").order("featured_order"),
  ]);

  return (
    <AdminPage title="Conteúdo da home" description="Textos, banners e seções da página inicial. As alterações aparecem na loja ao salvar.">
      <div className="space-y-6">
        <p className="text-sm text-muted">
          Os <strong className="text-ink">banners principais ativos</strong> formam o carrossel do topo da home, na ordem do campo “Ordem”: a frase fica ao lado da foto e os
          slides trocam sozinhos a cada 6,5 segundos (a troca pausa quando a cliente passa o mouse ou toca nos controles). Para tirar um slide sem apagar, desmarque “Ativo”.
        </p>
        {(banners as BannerRow[] | null)?.map((b) => (
          <Card
            key={b.id}
            title={`${b.placement === "hero" ? "Banner principal" : "Vitrine editorial"}: ${b.title}`}
            actions={<ActionButton action={deleteBanner.bind(null, b.id)} variant="danger" confirm="Remover este banner?">Remover</ActionButton>}
          >
            <BannerForm banner={b} />
          </Card>
        ))}
        <Card title="Novo banner">
          <BannerForm />
        </Card>

        <Card title="Destaques MIVORA" description="Produtos marcados como destaque, na ordem exibida na home.">
          {(featured ?? []).length ? (
            <ol className="space-y-1.5 text-sm">
              {(featured ?? []).map((p) => (
                <li key={p.id} className="flex justify-between">
                  <Link href={`/admin/produtos/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                  <span className="text-xs text-muted">ordem {p.featured_order}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">Nenhum produto em destaque.</p>
          )}
          <p className="mt-3 text-xs text-muted">Para incluir ou reordenar, edite o produto (campo “Destaque na home”). Categorias em destaque são definidas em Categorias.</p>
        </Card>

        <Card title="Ritual de skincare" description="Etapas exibidas na home e na página “Monte seu ritual”.">
          <div className="space-y-5">
            {(steps ?? []).map((s) => (
              <ActionForm key={s.id} action={saveRitualStep} className="grid gap-3 border-b border-line pb-5 sm:grid-cols-[5rem_1fr_1fr_auto]">
                <input type="hidden" name="id" value={s.id} />
                <Input name="step_number" inputMode="numeric" defaultValue={s.step_number} aria-label="Número da etapa" />
                <Input name="title" defaultValue={s.title} aria-label="Título" />
                <Select name="category_id" defaultValue={s.category_id ?? ""} aria-label="Categoria vinculada">
                  <option value="">Sem categoria</option>
                  {(categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <div className="flex gap-2">
                  <SubmitButton variant="outline">Salvar</SubmitButton>
                  <ActionButton action={deleteRitualStep.bind(null, s.id)} variant="danger" confirm="Remover esta etapa?">
                    Remover
                  </ActionButton>
                </div>
                <Textarea name="description" defaultValue={s.description ?? ""} rows={2} className="sm:col-span-4" aria-label="Descrição" />
              </ActionForm>
            ))}
            <ActionForm action={saveRitualStep} resetOnSuccess className="grid gap-3 sm:grid-cols-[5rem_1fr_1fr_auto]">
              <Input name="step_number" inputMode="numeric" placeholder="Nº" aria-label="Número da etapa" />
              <Input name="title" placeholder="Nova etapa" aria-label="Título" />
              <Select name="category_id" defaultValue="" aria-label="Categoria vinculada">
                <option value="">Sem categoria</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <SubmitButton>Adicionar</SubmitButton>
              <Textarea name="description" rows={2} placeholder="Descrição" className="sm:col-span-4" aria-label="Descrição" />
            </ActionForm>
          </div>
        </Card>

        <Card title="Textos institucionais da home">
          <p className="text-sm text-muted">
            “Conheça a MIVORA”, bloco de WhatsApp, avisos e redes sociais são editados em{" "}
            <Link href="/admin/configuracoes" className="underline">
              Configurações
            </Link>
            . Perguntas frequentes em{" "}
            <Link href="/admin/faq" className="underline">
              FAQ
            </Link>
            .
          </p>
        </Card>
      </div>
    </AdminPage>
  );
}
