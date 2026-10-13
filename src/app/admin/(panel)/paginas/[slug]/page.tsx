import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { AdminPage, Card } from "@/components/admin/ui";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { savePage } from "@/lib/admin/actions/content";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = { title: "Editar página" };

export default async function EditPagePage({ params }: PageProps<"/admin/paginas/[slug]">) {
  const { supabase } = await requireAdmin();
  const { slug } = await params;
  const { data: page } = await supabase.from("pages").select("*").eq("slug", slug).maybeSingle();
  if (!page) notFound();
  return (
    <AdminPage title={page.title} back={{ href: "/admin/paginas", label: "Páginas" }} description={<a href={`/${page.slug}`} target="_blank" className="underline">Ver página na loja</a>}>
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card>
          <ActionForm action={savePage} className="space-y-5">
            <input type="hidden" name="slug" value={page.slug} />
            <Field label="Título" htmlFor="title">
              <Input id="title" name="title" defaultValue={page.title} required />
            </Field>
            <Field label="Conteúdo" htmlFor="body">
              <Textarea id="body" name="body" rows={24} defaultValue={page.body} className="font-mono text-[0.8125rem]" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Título SEO" htmlFor="seo_title">
                <Input id="seo_title" name="seo_title" defaultValue={page.seo_title ?? ""} maxLength={70} />
              </Field>
              <Field label="Descrição SEO" htmlFor="seo_description">
                <Input id="seo_description" name="seo_description" defaultValue={page.seo_description ?? ""} maxLength={170} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <Checkbox name="is_published" label="Publicada" defaultChecked={page.is_published} />
              <Checkbox name="needs_review" label="Marcar como pendente de revisão" defaultChecked={page.needs_review} />
              <SubmitButton>Salvar página</SubmitButton>
            </div>
          </ActionForm>
        </Card>
        <Card title="Formatação">
          <ul className="space-y-2 text-xs text-muted">
            <li>
              <code>## Título</code> — subtítulo
            </li>
            <li>
              <code>### Título</code> — subtítulo menor
            </li>
            <li>
              <code>- item</code> — lista
            </li>
            <li>
              <code>**texto**</code> — negrito
            </li>
            <li>
              <code>[texto](/contato)</code> — link
            </li>
            <li>Linha em branco separa parágrafos.</li>
          </ul>
        </Card>
      </div>
    </AdminPage>
  );
}
