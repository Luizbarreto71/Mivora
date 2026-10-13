import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { AdminPage, Card } from "@/components/admin/ui";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { deleteSuggestion, saveSuggestion } from "@/lib/admin/actions/content";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Sugestões de produtos" };

const STATUS = { idea: "Ideia", evaluating: "Em avaliação", approved: "Aprovado", rejected: "Descartado" } as const;

type Suggestion = { id: string; name: string; brand_name: string | null; notes: string | null; reference_url: string | null; status: keyof typeof STATUS; product_id: string | null };

function SuggestionForm({ s }: { s?: Suggestion }) {
  return (
    <ActionForm action={saveSuggestion} resetOnSuccess={!s} className="grid gap-3 sm:grid-cols-4">
      {s ? <input type="hidden" name="id" value={s.id} /> : null}
      <Field label="Produto" className="sm:col-span-2">
        <Input name="name" defaultValue={s?.name ?? ""} required />
      </Field>
      <Field label="Marca">
        <Input name="brand_name" defaultValue={s?.brand_name ?? ""} />
      </Field>
      <Field label="Status">
        <Select name="status" defaultValue={s?.status ?? "idea"}>
          {Object.entries(STATUS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Link de referência" className="sm:col-span-2">
        <Input name="reference_url" defaultValue={s?.reference_url ?? ""} placeholder="https://" />
      </Field>
      <Field label="Notas" className="sm:col-span-2">
        <Textarea name="notes" rows={1} defaultValue={s?.notes ?? ""} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-4">
        <SubmitButton variant={s ? "outline" : "primary"}>{s ? "Salvar" : "Adicionar sugestão"}</SubmitButton>
        {s?.product_id ? (
          <Link href={`/admin/produtos/${s.product_id}`} className="text-sm underline underline-offset-2">
            Ver cadastro do produto
          </Link>
        ) : s ? (
          <Link href={`/admin/produtos/novo?nome=${encodeURIComponent(s.name)}&marca=${encodeURIComponent(s.brand_name ?? "")}`} className="text-sm underline underline-offset-2">
            Criar rascunho de produto
          </Link>
        ) : null}
      </div>
    </ActionForm>
  );
}

export default async function SuggestionsPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("product_suggestions").select("*").order("status").order("created_at");
  return (
    <AdminPage
      title="Sugestões de produtos"
      description="Ideias para expandir o catálogo. Nada aqui aparece na loja. Ao decidir vender, crie um rascunho de produto e defina preço e estoque reais antes de publicar."
    >
      <div className="space-y-4">
        <Card title="Nova sugestão">
          <SuggestionForm />
        </Card>
        {(data as Suggestion[] | null)?.map((s) => (
          <Card key={s.id} title={`${s.name}${s.brand_name ? ` · ${s.brand_name}` : ""}`} description={STATUS[s.status]} actions={<ActionButton action={deleteSuggestion.bind(null, s.id)} variant="danger" confirm="Remover esta sugestão?">Remover</ActionButton>}>
            <SuggestionForm s={s} />
          </Card>
        ))}
      </div>
    </AdminPage>
  );
}
