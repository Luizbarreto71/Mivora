import type { Metadata } from "next";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { AdminPage, Card } from "@/components/admin/ui";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { deleteFaq, saveFaq } from "@/lib/admin/actions/content";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Perguntas frequentes" };

type FaqRow = { id: string; question: string; answer: string; product_id: string | null; show_on_home: boolean; is_published: boolean; sort_order: number };

function FaqForm({ faq, products }: { faq?: FaqRow; products: { id: string; name: string }[] }) {
  return (
    <ActionForm action={saveFaq} resetOnSuccess={!faq} className="grid gap-4 sm:grid-cols-[1fr_14rem]">
      {faq ? <input type="hidden" name="id" value={faq.id} /> : null}
      <Field label="Pergunta">
        <Input name="question" defaultValue={faq?.question ?? ""} required />
      </Field>
      <Field label="Exibir em">
        <Select name="product_id" defaultValue={faq?.product_id ?? ""}>
          <option value="">Geral (FAQ da loja)</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              Produto: {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Resposta" className="sm:col-span-2">
        <Textarea name="answer" rows={3} defaultValue={faq?.answer ?? ""} required />
      </Field>
      <div className="flex flex-wrap items-center gap-5 sm:col-span-2">
        <Field label="Ordem" className="w-24">
          <Input name="sort_order" inputMode="numeric" defaultValue={faq?.sort_order ?? 0} />
        </Field>
        <Checkbox name="show_on_home" label="Mostrar na home" defaultChecked={faq?.show_on_home ?? true} />
        <Checkbox name="is_published" label="Publicada" defaultChecked={faq?.is_published ?? true} />
        <SubmitButton variant={faq ? "outline" : "primary"}>{faq ? "Salvar" : "Adicionar pergunta"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export default async function AdminFaqPage() {
  const { supabase } = await requireAdmin();
  const [{ data: faqs }, { data: products }] = await Promise.all([
    supabase.from("faqs").select("*").order("product_id", { nullsFirst: true }).order("sort_order"),
    supabase.from("products").select("id, name").neq("status", "archived").order("name"),
  ]);
  return (
    <AdminPage title="Perguntas frequentes" description="Perguntas gerais aparecem na home e na página de FAQ; perguntas de produto aparecem na página do produto.">
      <div className="space-y-4">
        <Card title="Nova pergunta">
          <FaqForm products={products ?? []} />
        </Card>
        {(faqs as FaqRow[] | null)?.map((f) => (
          <Card key={f.id} actions={<ActionButton action={deleteFaq.bind(null, f.id)} variant="danger" confirm="Remover esta pergunta?">Remover</ActionButton>} title={f.question}>
            <FaqForm faq={f} products={products ?? []} />
          </Card>
        ))}
      </div>
    </AdminPage>
  );
}
