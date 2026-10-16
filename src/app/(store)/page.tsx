import { Logo } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { BrandTiles } from "@/components/store/home/brand-tiles";
import { CampaignBanner } from "@/components/store/home/campaign-banner";
import { Hero } from "@/components/store/home/hero";
import { NeedTiles } from "@/components/store/home/need-tiles";
import { SkinHomeSection } from "@/components/store/skin/skin-home-section";
import { Testimonials } from "@/components/store/home/testimonials";
import { ProductRail } from "@/components/store/product-card";
import { SectionHeading } from "@/components/store/section";
import { getBrands, getHomeContent, getHomeNeeds, getStoreSettings, getSuggestedRitual, getTestimonials, listProducts } from "@/lib/catalog/queries";
import { SITE_URL, isSupabaseConfigured } from "@/lib/env";
import { skinAiConfigured } from "@/lib/skin/ai";
import type { ImageRef } from "@/lib/types";
import { buildWhatsAppUrl, normalizeWhatsAppNumber } from "@/lib/whatsapp";

const withImage = <T extends { name: string; image: ImageRef | null }>(list: T[]) =>
  list.filter((p): p is T & { image: ImageRef } => Boolean(p.image)).map((p) => ({ name: p.name, image: p.image }));

/** Home in the order of the owner's mockup. Every section uses real catalogue data and hides itself when empty. */
export default async function HomePage() {
  const [settings, content, brands, recent, featured, comingSoon, needs, testimonials] = await Promise.all([
    getStoreSettings(),
    getHomeContent(),
    getBrands(),
    listProducts({ ordem: "novidades" }, 12),
    listProducts({ colecao: "destaques" }, 8),
    listProducts({ disponibilidade: "em-breve", ordem: "novidades" }, 8),
    getHomeNeeds(),
    getTestimonials(),
  ]);
  const ritual = await getSuggestedRitual(content.ritual);

  const whatsapp = normalizeWhatsAppNumber(settings.whatsapp_number);
  const novidades = recent.items.filter((p) => p.availability !== "coming_soon").slice(0, 4);
  const brandRow = brands.filter((b) => b.productCount > 0).slice(0, 5);
  const needRow = needs.filter((n) => n.productCount > 0).slice(0, 5);
  const heroProduct = [...featured.items, ...recent.items].find((p) => p.image) ?? null;

  // "Em breve" lists the upcoming products; with none published yet, the button asks on WhatsApp
  const soonHref =
    comingSoon.items.length > 0
      ? (content.comingSoon?.cta_href ?? "/produtos?disponibilidade=em-breve")
      : whatsapp
        ? buildWhatsAppUrl(whatsapp, `${settings.whatsapp_greeting} Gostaria de saber dos próximos lançamentos da MIVORA.`)
        : null;

  return (
    <>
      <Hero banners={content.hero} fallbackProduct={heroProduct} />

      {settings.skin_analysis_enabled && skinAiConfigured() && content.skinHome ? <SkinHomeSection banner={content.skinHome} /> : null}

      {!isSupabaseConfigured ? (
        <div className="container-page mt-10">
          <p className="border border-dashed border-line p-6 text-sm text-muted">
            A loja ainda não está conectada ao banco de dados. Configure as variáveis do Supabase para exibir o catálogo.
          </p>
        </div>
      ) : null}

      {novidades.length > 0 ? (
        <section className="container-page pt-14 sm:pt-16" aria-labelledby="novidades">
          <SectionHeading title={<span id="novidades">Novidades MIVORA</span>} href="/novidades" />
          <ProductRail products={novidades} label="Novidades MIVORA" />
        </section>
      ) : null}

      {brandRow.length > 0 ? (
        <section className="container-page pt-14 sm:pt-16" aria-labelledby="marcas">
          <SectionHeading title={<span id="marcas">Descubra por marca</span>} href="/marcas" hrefLabel="Ver todas" />
          <BrandTiles brands={brandRow} />
        </section>
      ) : null}

      {content.routines ? (
        <CampaignBanner banner={content.routines} products={withImage(ritual.map((r) => r.product))} labelledBy="rotinas" />
      ) : null}

      {needRow.length > 0 ? (
        <section className="container-page pt-14 sm:pt-16" aria-labelledby="necessidades">
          <SectionHeading title={<span id="necessidades">Cuidados para cada necessidade</span>} description="Encontre o que sua pele precisa." href="/categorias" />
          <NeedTiles needs={needRow} />
        </section>
      ) : null}

      {content.comingSoon && soonHref ? (
        <CampaignBanner
          banner={content.comingSoon}
          products={withImage(comingSoon.items)}
          href={soonHref}
          labelledBy="em-breve"
          fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <div aria-hidden="true" className="absolute aspect-square h-[115%] rounded-full" style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.9), rgba(255,255,255,0) 100%)" }} />
              <Logo variant="symbol" className="relative h-24 text-[var(--color-rose-ink)] opacity-70 sm:h-28" />
            </div>
          }
        />
      ) : null}

      {content.editorial.map((e) => (
        <CampaignBanner key={e.id} banner={e} labelledBy={`editorial-${e.id}`} />
      ))}

      {testimonials.length > 0 ? (
        <section className="container-page pt-14 sm:pt-16" aria-labelledby="depoimentos">
          <SectionHeading title={<span id="depoimentos">O que nossos clientes dizem</span>} description="Experiências reais de quem comprou na MIVORA." />
          <Testimonials items={testimonials} />
        </section>
      ) : whatsapp ? (
        // no testimonials yet: an institutional block instead of invented social proof
        <section className="container-page pt-14 sm:pt-16" aria-labelledby="atendimento">
          <div className="flex flex-col items-start gap-6 border border-line px-6 py-10 sm:px-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 id="atendimento" className="heading-display text-[1.375rem] sm:text-[1.625rem]">
                {settings.whatsapp_section_title ?? "Atendimento de verdade, do pedido à entrega"}
              </h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
                {settings.whatsapp_section_text ?? "Tire dúvidas sobre produtos, rotina, frete e pagamento com a nossa equipe pelo WhatsApp."}
              </p>
              {settings.business_hours ? <p className="mt-2 text-sm text-muted">{settings.business_hours}</p> : null}
            </div>
            <a
              href={buildWhatsAppUrl(whatsapp, `${settings.whatsapp_greeting} Vim pelo site ${SITE_URL.replace(/^https?:\/\//, "")} e gostaria de atendimento.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 shrink-0 items-center gap-3 bg-ink px-7 text-xs font-semibold uppercase tracking-[0.14em] text-paper hover:bg-ink-soft"
            >
              <WhatsAppIcon className="h-4 w-4" /> Conversar no WhatsApp
            </a>
          </div>
        </section>
      ) : null}
    </>
  );
}
