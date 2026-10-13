import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getPage } from "@/lib/catalog/queries";
import { formatDate } from "@/lib/utils";
import { Breadcrumbs } from "./breadcrumbs";
import { Markdown } from "./markdown";
import { PageHeader } from "./section";

export async function institutionalMetadata(slug: string, fallbackTitle: string): Promise<Metadata> {
  const page = await getPage(slug);
  return {
    title: page?.seo_title ?? page?.title ?? fallbackTitle,
    description: page?.seo_description ?? undefined,
    alternates: { canonical: `/${slug}` },
  };
}

export async function InstitutionalPage({ slug, children }: { slug: string; children?: ReactNode }) {
  const page = await getPage(slug);
  if (!page) notFound();
  return (
    <>
      <PageHeader title={page.title}>
        <Breadcrumbs items={[{ label: page.title }]} className="mb-8" />
      </PageHeader>
      <div className="container-page grid gap-12 py-12 sm:py-16 lg:grid-cols-[1fr_18rem]">
        <article className="max-w-3xl">
          <Markdown source={page.body} />
          {children}
        </article>
        <aside className="text-xs text-muted lg:pt-2">Atualizado em {formatDate(page.updated_at)}</aside>
      </div>
    </>
  );
}
