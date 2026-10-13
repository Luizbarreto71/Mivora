import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { FaqList } from "@/components/store/faq-list";
import { JsonLd } from "@/components/store/json-ld";
import { EmptyState, PageHeader } from "@/components/store/section";
import { getFaqs } from "@/lib/catalog/queries";

export const metadata: Metadata = {
  title: "Perguntas frequentes",
  description: "Tire suas dúvidas sobre pedidos, entrega, pagamento e atendimento da MIVORA.",
  alternates: { canonical: "/perguntas-frequentes" },
};

export default async function FaqPage() {
  const faqs = await getFaqs();
  return (
    <>
      <PageHeader eyebrow="Ajuda" title="Perguntas frequentes">
        <Breadcrumbs items={[{ label: "Perguntas frequentes" }]} className="mb-8" />
      </PageHeader>
      <div className="container-page max-w-4xl py-12 sm:py-16">
        {faqs.length ? <FaqList faqs={faqs} /> : <EmptyState title="Em breve" description="Estamos reunindo as dúvidas mais comuns." />}
      </div>
      {faqs.length ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
          }}
        />
      ) : null}
    </>
  );
}
