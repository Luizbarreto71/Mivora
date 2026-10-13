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
  background_color: string | null;
  product_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  sort_order: number;
};

type ProductOption = { id: string; name: string };

const PLACEMENTS = [
  {
    value: "hero",
    label: "Banner principal (carrossel do topo)",
    description:
      "Os banners principais ativos formam o carrossel do topo da home, na ordem do campo “Ordem”. A frase fica à esquerda e a foto à direita; os slides trocam sozinhos a cada 6,5 segundos e a troca pausa quando a cliente passa o mouse ou usa os controles.",
    color: "#F6E4E1",
  },
  { value: "routines", label: "Rotinas de Skincare", description: "Faixa entre as seções de produtos. Sem foto, mostra os produtos do ritual sugerido.", color: "#F3ECE4" },
  {
    value: "coming_soon",
    label: "Em breve na MIVORA",
    description:
      "Aparece quando há produtos “Em breve” publicados (o botão abre a lista) ou, sem eles, quando o WhatsApp está configurado (o botão pergunta dos próximos lançamentos). Desmarque “Ativo” para ocultar.",
    color: "#F7E1E1",
  },
  { value: "editorial", label: "Vitrine editorial (opcional)", description: "Faixas extras no fim da home, no mesmo estilo.", color: "#F3ECE4" },
] as const;

/** timestamptz → value for <input type="datetime-local"> in Brasília time */
function toLocalInput(ts: string | null) {
  if (!ts) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ts))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function BannerForm({ banner, placement, products }: { banner?: BannerRow; placement: (typeof PLACEMENTS)[number]; products: ProductOption[] }) {
  const id = banner?.id ?? `new-${placement.value}`;
  return (
    <ActionForm action={saveBanner} resetOnSuccess={!banner} className="grid gap-4 sm:grid-cols-2">
      {banner ? <input type="hidden" name="id" value={banner.id} /> : null}
      <Field label="Posição" htmlFor={`placement-${id}`}>
        <Select id={`placement-${id}`} name="placement" defaultValue={banner?.placement ?? placement.value}>
          {PLACEMENTS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ordem" htmlFor={`sort-${id}`}>
        <Input id={`sort-${id}`} name="sort_order" inputMode="numeric" defaultValue={banner?.sort_order ?? 0} />
      </Field>
      <Field label="Chamada superior" htmlFor={`eyebrow-${id}`} hint="Texto pequeno acima do título (opcional)">
        <Input id={`eyebrow-${id}`} name="eyebrow" defaultValue={banner?.eyebrow ?? ""} />
      </Field>
      <Field label="Título" htmlFor={`title-${id}`}>
        <Input id={`title-${id}`} name="title" defaultValue={banner?.title ?? ""} required />
      </Field>
      <Field label="Subtítulo" htmlFor={`subtitle-${id}`} className="sm:col-span-2">
        <Textarea id={`subtitle-${id}`} name="subtitle" rows={2} defaultValue={banner?.subtitle ?? ""} />
      </Field>
      <Field label="Botão principal — texto" htmlFor={`cta-${id}`}>
        <Input id={`cta-${id}`} name="cta_label" defaultValue={banner?.cta_label ?? ""} />
      </Field>
      <Field label="Botão principal — link" htmlFor={`cta-href-${id}`} hint="Ex.: /produtos">
        <Input id={`cta-href-${id}`} name="cta_href" defaultValue={banner?.cta_href ?? ""} />
      </Field>
      <Field label="Botão secundário — texto" htmlFor={`cta2-${id}`}>
        <Input id={`cta2-${id}`} name="cta2_label" defaultValue={banner?.cta2_label ?? ""} />
      </Field>
      <Field label="Botão secundário — link" htmlFor={`cta2-href-${id}`}>
        <Input id={`cta2-href-${id}`} name="cta2_href" defaultValue={banner?.cta2_href ?? ""} />
      </Field>
      <MediaField
        name="image_desktop_url"
        label="Imagem (desktop)"
        defaultValue={banner?.image_desktop_url ?? null}
        folder="banners"
        hint="Foto vertical ou quadrada, com o produto ou a modelo no centro. Ela se dissolve na cor de fundo pelo lado esquerdo."
      />
      <MediaField name="image_mobile_url" label="Imagem (celular, opcional)" defaultValue={banner?.image_mobile_url ?? null} folder="banners" />
      <Field label="Descrição da imagem (acessibilidade)" htmlFor={`alt-${id}`}>
        <Input id={`alt-${id}`} name="image_alt" defaultValue={banner?.image_alt ?? ""} />
      </Field>
      <Field label="Produto em destaque (sem foto)" htmlFor={`product-${id}`} hint="Usado quando o banner não tem foto: a foto do produto aparece sob uma luz suave.">
        <Select id={`product-${id}`} name="product_id" defaultValue={banner?.product_id ?? ""}>
          <option value="">Nenhum</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Cor de fundo" htmlFor={`color-${id}`} hint="Use um tom claro, próximo da borda da foto">
        <Input id={`color-${id}`} name="background_color" type="color" defaultValue={(banner?.background_color ?? placement.color).toLowerCase()} className="h-10 w-24 p-1" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Início da campanha" htmlFor={`starts-${id}`} hint="Opcional (horário de Brasília)">
          <Input id={`starts-${id}`} name="starts_at" type="datetime-local" defaultValue={toLocalInput(banner?.starts_at ?? null)} />
        </Field>
        <Field label="Fim da campanha" htmlFor={`ends-${id}`} hint="Opcional">
          <Input id={`ends-${id}`} name="ends_at" type="datetime-local" defaultValue={toLocalInput(banner?.ends_at ?? null)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <Checkbox name="is_active" label="Ativo" defaultChecked={banner?.is_active ?? true} />
        <SubmitButton variant={banner ? "outline" : "primary"}>{banner ? "Salvar banner" : "Criar banner"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export default async function ContentPage() {
  const { supabase } = await requireAdmin();
  const [{ data: banners }, { data: steps }, { data: categories }, { data: featured }, { data: products }] = await Promise.all([
    supabase.from("banners").select("*").order("placement").order("sort_order"),
    supabase.from("ritual_steps").select("*").order("sort_order"),
    supabase.from("categories").select("id, name, kind").order("kind").order("sort_order"),
    supabase.from("products").select("id, name, featured_order").eq("is_featured", true).eq("status", "published").order("featured_order"),
    supabase.from("products").select("id, name").eq("status", "published").order("name"),
  ]);
  const rows = (banners ?? []) as BannerRow[];
  const productOptions = (products ?? []) as ProductOption[];

  return (
    <AdminPage title="Conteúdo da home" description="Banners, campanhas e seções da página inicial. As alterações aparecem na loja ao salvar.">
      <div className="space-y-10">
        {PLACEMENTS.map((placement) => {
          const list = rows.filter((b) => b.placement === placement.value);
          return (
            <section key={placement.value} className="space-y-4">
              <div>
                <h2 className="text-base font-semibold">{placement.label}</h2>
                <p className="mt-1 max-w-3xl text-sm text-muted">{placement.description}</p>
              </div>
              {list.map((b) => (
                <Card
                  key={b.id}
                  title={
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full border border-line" style={{ backgroundColor: b.background_color ?? placement.color }} />
                      {b.title}
                      {!b.is_active ? <span className="text-xs font-normal text-muted">(inativo)</span> : null}
                    </span>
                  }
                  actions={
                    <ActionButton action={deleteBanner.bind(null, b.id)} variant="danger" confirm="Remover este banner?">
                      Remover
                    </ActionButton>
                  }
                >
                  <BannerForm banner={b} placement={placement} products={productOptions} />
                </Card>
              ))}
              {placement.value === "hero" || placement.value === "editorial" || list.length === 0 ? (
                <details className="rounded-lg border border-dashed border-line bg-paper">
                  <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">+ Novo banner: {placement.label}</summary>
                  <div className="border-t border-line p-5">
                    <BannerForm placement={placement} products={productOptions} />
                  </div>
                </details>
              ) : null}
            </section>
          );
        })}

        <Card title="Destaques MIVORA" description="Produtos marcados como destaque: aparecem primeiro no catálogo e um deles ilustra o banner principal quando ele não tem foto nem produto.">
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

        <Card title="Ritual de skincare" description="Etapas da página “Monte seu ritual”. Um produto disponível de cada etapa ilustra o banner “Rotinas de Skincare” da home.">
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
            Barra superior, faixa de benefícios, bloco de atendimento, newsletter, avisos e redes sociais são editados em{" "}
            <Link href="/admin/configuracoes" className="underline">
              Configurações
            </Link>
            . Necessidades da seção “Cuidados para cada necessidade” em{" "}
            <Link href="/admin/categorias" className="underline">
              Categorias
            </Link>{" "}
            (opção “Mostrar na home”), imagens das marcas em{" "}
            <Link href="/admin/marcas" className="underline">
              Marcas
            </Link>{" "}
            e depoimentos em{" "}
            <Link href="/admin/depoimentos" className="underline">
              Depoimentos
            </Link>
            .
          </p>
        </Card>
      </div>
    </AdminPage>
  );
}
