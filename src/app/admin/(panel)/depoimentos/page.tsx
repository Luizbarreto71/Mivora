import type { Metadata } from "next";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { AdminPage, Card, StatusPill } from "@/components/admin/ui";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { deleteTestimonial, saveTestimonial } from "@/lib/admin/actions/community";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Depoimentos" };

type Row = {
  id: string;
  author_name: string;
  author_detail: string | null;
  body: string;
  rating: number | null;
  product_id: string | null;
  consent_confirmed: boolean;
  is_published: boolean;
  sort_order: number;
};

function TestimonialForm({ row, products }: { row?: Row; products: { id: string; name: string }[] }) {
  const id = row?.id ?? "new";
  return (
    <ActionForm action={saveTestimonial} resetOnSuccess={!row} className="grid gap-4 sm:grid-cols-2">
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <Field label="Nome ou identificação autorizada" htmlFor={`name-${id}`} hint="Ex.: Juliana S. (como a cliente autorizou)">
        <Input id={`name-${id}`} name="author_name" defaultValue={row?.author_name ?? ""} maxLength={60} required />
      </Field>
      <Field label="Complemento (opcional)" htmlFor={`detail-${id}`} hint="Ex.: Vitória/ES ou o produto comprado">
        <Input id={`detail-${id}`} name="author_detail" defaultValue={row?.author_detail ?? ""} maxLength={60} />
      </Field>
      <Field label="Depoimento" htmlFor={`body-${id}`} hint="Use as palavras da cliente, sem mudar o sentido (10 a 400 caracteres)" className="sm:col-span-2">
        <Textarea id={`body-${id}`} name="body" rows={3} defaultValue={row?.body ?? ""} maxLength={400} required />
      </Field>
      <Field label="Nota (opcional)" htmlFor={`rating-${id}`} hint="Só preencha se a cliente deu a nota">
        <Select id={`rating-${id}`} name="rating" defaultValue={row?.rating?.toString() ?? ""}>
          <option value="">Sem nota (sem estrelas)</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "estrela" : "estrelas"}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Produto (opcional)" htmlFor={`product-${id}`}>
        <Select id={`product-${id}`} name="product_id" defaultValue={row?.product_id ?? ""}>
          <option value="">—</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ordem" htmlFor={`sort-${id}`}>
        <Input id={`sort-${id}`} name="sort_order" inputMode="numeric" defaultValue={row?.sort_order ?? 0} />
      </Field>
      <div className="space-y-3 sm:col-span-2">
        <Checkbox
          name="consent_confirmed"
          label="Confirmo que este depoimento é real e que a cliente autorizou a publicação do texto e da identificação acima."
          defaultChecked={row?.consent_confirmed ?? false}
        />
        <Checkbox name="is_published" label="Publicar na home (seção “O que nossos clientes dizem”)" defaultChecked={row?.is_published ?? false} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton variant={row ? "outline" : "primary"}>{row ? "Salvar depoimento" : "Cadastrar depoimento"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export default async function TestimonialsPage() {
  const { supabase } = await requireAdmin();
  const [{ data }, { data: products }] = await Promise.all([
    supabase.from("testimonials").select("*").order("sort_order").order("created_at", { ascending: false }),
    supabase.from("products").select("id, name").eq("status", "published").order("name"),
  ]);
  const rows = (data ?? []) as Row[];

  return (
    <AdminPage
      title="Depoimentos"
      description="Somente depoimentos reais, com autorização da cliente. A seção “O que nossos clientes dizem” só aparece na home quando houver ao menos um depoimento publicado."
    >
      <div className="space-y-4">
        {rows.map((r) => (
          <Card
            key={r.id}
            title={
              <span className="flex items-center gap-2">
                {r.author_name}
                {r.is_published ? <StatusPill tone="green">Publicado</StatusPill> : <StatusPill tone="gray">Não publicado</StatusPill>}
              </span>
            }
            actions={
              <ActionButton action={deleteTestimonial.bind(null, r.id)} variant="danger" confirm="Remover este depoimento?">
                Remover
              </ActionButton>
            }
          >
            <TestimonialForm row={r} products={products ?? []} />
          </Card>
        ))}
        <Card title="Novo depoimento">
          <TestimonialForm products={products ?? []} />
        </Card>
      </div>
    </AdminPage>
  );
}
