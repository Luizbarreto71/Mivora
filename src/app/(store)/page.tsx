import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { FaqList } from "@/components/store/faq-list";
import { BrandSpotlight } from "@/components/store/home/brand-spotlight";
import { Hero } from "@/components/store/home/hero";
import { ProductCard, ProductGrid } from "@/components/store/product-card";
import { SectionHeading } from "@/components/store/section";
import { buttonClasses } from "@/components/ui/button";
import { getBrands, getHomeContent, getStoreSettings, getSuggestedRitual, listProducts } from "@/lib/catalog/queries";
import { SITE_URL, isSupabaseConfigured } from "@/lib/env";
import type { ProductSummary } from "@/lib/types";
import { buildWhatsAppUrl, normalizeWhatsAppNumber } from "@/lib/whatsapp";

/** Picks up to `limit` products, preferring ones not shown in an earlier home section. */
function fresh(list: ProductSummary[], shown: Set<string>, limit = 4) {
  const unseen = list.filter((p) => !shown.has(p.id));
  // With a small catalogue, repeating products beats hiding a whole section
  const picked = (unseen.length >= 2 ? unseen : list).slice(0, limit);
  picked.forEach((p) => shown.add(p.id));
  return picked;
}

export default async function HomePage() {
  const [settings, content, brands, recent, featured, medicube, skin1004, glow, pores, comingSoon, all] = await Promise.all([
    getStoreSettings(),
    getHomeContent(),
    getBrands(),
    listProducts({ ordem: "novidades" }, 12),
    listProducts({ colecao: "destaques" }, 12),
    listProducts({ marca: ["medicube"] }, 6),
    listProducts({ marca: ["skin1004"] }, 6),
    listProducts({ necessidade: ["hidratacao", "luminosidade"] }, 12),
    listProducts({ necessidade: ["poros-e-oleosidade"] }, 12),
    listProducts({ disponibilidade: "em-breve", ordem: "novidades" }, 4),
    listProducts({}, 12),
  ]);
  const ritual = await getSuggestedRitual(content.ritual);

  // Collections avoid repeating products; "Em breve" items are kept for their own section.
  const shown = new Set<string>();
  const onSale = (r: { items: ProductSummary[] }) => r.items.filter((p) => p.availability !== "coming_soon");
  const novidades = fresh(onSale(recent), shown);
  const favoritos = fresh(onSale(featured), shown);
  const hidratacao = fresh(onSale(glow), shown);
  const poros = fresh(onSale(pores), shown);

  const medicubeBrand = brands.find((b) => b.slug === "medicube" && b.productCount > 0);
  const skinBrand = brands.find((b) => b.slug === "skin1004" && b.productCount > 0);
  const stage = [...featured.items, ...all.items].filter((p, i, arr) => p.image && arr.findIndex((x) => x.id === p.id) === i);
  const preferred = ["skin1004-madagascar-centella-ampoule", "dr-althea-345-relief-cream", "skin1004-madagascar-centella-tone-brightening-capsule-ampoule"];
  stage.sort((a, b) => (preferred.indexOf(a.slug) + 1 || 99) - (preferred.indexOf(b.slug) + 1 || 99));

  const whatsapp = normalizeWhatsAppNumber(settings.whatsapp_number);
  const visibleBrands = brands.filter((b) => b.productCount > 0);

  return (
    <>
      <Hero banners={content.hero} products={stage} />

      {!isSupabaseConfigured ? (
        <div className="container-page mt-10">
          <p className="border border-dashed border-line p-6 text-sm text-muted">
            A loja ainda não está conectada ao banco de dados. Configure as variáveis do Supabase para exibir o catálogo.
          </p>
        </div>
      ) : null}

      {visibleBrands.length > 0 ? (
        <nav aria-label="Marcas" className="border-b border-line">
          <ul className="container-page flex flex-wrap items-center justify-center gap-x-10 gap-y-3 py-7">
            {visibleBrands.map((b) => (
              <li key={b.id}>
                <Link href={`/marcas/${b.slug}`} className="heading-display text-lg text-ink/70 transition-colors hover:text-ink sm:text-xl">
                  {b.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {novidades.length >= 2 ? (
        <section className="container-page pt-20 sm:pt-28" aria-labelledby="novidades">
          <SectionHeading eyebrow="Acabou de chegar" title={<span id="novidades">Novidades MIVORA</span>} href="/novidades" />
          <ProductGrid products={novidades} />
        </section>
      ) : null}

      {favoritos.length >= 2 ? (
        <section className="container-page pt-24 sm:pt-32" aria-labelledby="favoritos">
          <SectionHeading eyebrow="Seleção da casa" title={<span id="favoritos">Favoritos de skincare</span>} href="/produtos" />
          <ProductGrid products={favoritos} />
        </section>
      ) : null}

      {medicubeBrand && medicube.items.length ? (
        <BrandSpotlight brand={medicubeBrand} products={onSale(medicube).length ? onSale(medicube) : medicube.items} eyebrow="Marca em destaque" title="Descubra a Medicube" />
      ) : null}

      {hidratacao.length >= 2 ? (
        <section className="container-page pt-24 sm:pt-32" aria-labelledby="hidratacao">
          <SectionHeading
            eyebrow="Por necessidade"
            title={<span id="hidratacao">Hidratação e luminosidade</span>}
            href="/produtos?necessidade=hidratacao,luminosidade"
          />
          <ProductGrid products={hidratacao} />
        </section>
      ) : null}

      {skinBrand && skin1004.items.length ? (
        <BrandSpotlight brand={skinBrand} products={onSale(skin1004).length ? onSale(skin1004) : skin1004.items} eyebrow="Centella asiatica de Madagascar" title="O universo SKIN1004" reverse />
      ) : null}

      {poros.length >= 2 ? (
        <section className="container-page pt-24 sm:pt-32" aria-labelledby="poros">
          <SectionHeading eyebrow="Por necessidade" title={<span id="poros">Cuidados com poros e textura</span>} href="/categorias/poros-e-oleosidade" />
          <ProductGrid products={poros} />
        </section>
      ) : null}

      {ritual.length >= 2 ? (
        <section className="mt-24 border-y border-line bg-ivory sm:mt-32" aria-labelledby="ritual">
          <div className="container-page py-20 sm:py-24">
            <div className="mb-12 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xl">
                <p className="eyebrow mb-3">Passo a passo</p>
                <h2 id="ritual" className="heading-display text-[2rem] sm:text-[2.5rem]">
                  Seu ritual de skincare
                </h2>
                <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted">
                  Uma combinação de etapas com produtos disponíveis, que se complementam sem sobrepor ativos que podem sensibilizar a pele. Pela manhã, finalize sempre com protetor solar.
                </p>
              </div>
              <Link href="/ritual" className={buttonClasses("outline", "md", "self-start sm:self-auto")}>
                Monte o seu ritual
              </Link>
            </div>
            <ol className="grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 lg:grid-cols-4">
              {ritual.slice(0, 4).map(({ step, product }, i) => (
                <li key={step.id} className="flex flex-col">
                  <p className="mb-3 flex items-baseline gap-2">
                    <span className="heading-display text-xl text-muted">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em]">{step.title}</span>
                  </p>
                  <ProductCard product={product} />
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {comingSoon.items.length > 0 ? (
        <section className="container-page pt-24 sm:pt-32" aria-labelledby="em-breve">
          <SectionHeading
            eyebrow="Próximos lançamentos"
            title={<span id="em-breve">Em breve na MIVORA</span>}
            description="Produtos que estão chegando à nossa curadoria. Ainda não estão disponíveis para compra."
            href="/produtos?disponibilidade=em-breve"
          />
          <ProductGrid products={comingSoon.items} />
        </section>
      ) : null}

      {content.editorial.map((e) => (
        <section key={e.id} className="container-page pt-24 sm:pt-32">
          <div className="grid overflow-hidden bg-ivory lg:grid-cols-2">
            {e.image_desktop_url ? (
              <div className="relative aspect-[4/3] lg:aspect-auto lg:min-h-[28rem]">
                <Image src={e.image_desktop_url} alt={e.image_alt ?? ""} fill sizes="(min-width:1024px) 50vw, 100vw" className="object-cover" />
              </div>
            ) : null}
            <div className="flex flex-col justify-center p-8 sm:p-14">
              {e.eyebrow ? <p className="eyebrow mb-4">{e.eyebrow}</p> : null}
              <h2 className="heading-display text-[1.75rem] sm:text-[2.25rem]">{e.title}</h2>
              {e.subtitle ? <p className="mt-4 max-w-md leading-relaxed text-muted">{e.subtitle}</p> : null}
              {e.cta_label && e.cta_href ? (
                <Link href={e.cta_href} className={buttonClasses("outline", "md", "mt-8 self-start")}>
                  {e.cta_label}
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      ))}

      <section className="container-page pt-24 sm:pt-32" aria-labelledby="sobre">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div className="relative aspect-[5/4] overflow-hidden bg-blush/50">
            <div className="absolute inset-[12%] flex flex-col items-center justify-center border border-ink/10 bg-paper/70 text-center">
              <p className="eyebrow">Boutique digital</p>
              <p className="heading-display mt-4 px-6 text-[1.5rem] sm:text-[1.875rem]">Beleza escolhida com cuidado.</p>
            </div>
          </div>
          <div>
            <p className="eyebrow mb-3">Conheça a MIVORA</p>
            <h2 id="sobre" className="heading-display text-[2rem] sm:text-[2.5rem]">
              {settings.about_headline ?? "Curadoria com propósito"}
            </h2>
            {settings.about_text ? <p className="mt-6 max-w-xl text-base leading-relaxed text-muted">{settings.about_text}</p> : null}
            <Link href="/sobre" className={buttonClasses("outline", "md", "mt-9")}>
              Nossa história
            </Link>
          </div>
        </div>
      </section>

      {whatsapp ? (
        <section className="container-page pt-24 sm:pt-32" aria-labelledby="atendimento">
          <div className="flex flex-col items-start gap-8 bg-ink px-6 py-14 text-paper sm:px-14 sm:py-16 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-paper/60">Atendimento personalizado</p>
              <h2 id="atendimento" className="heading-display text-[1.75rem] sm:text-[2.25rem]">
                {settings.whatsapp_section_title ?? "Fale com a MIVORA"}
              </h2>
              {settings.whatsapp_section_text ? <p className="mt-4 leading-relaxed text-paper/70">{settings.whatsapp_section_text}</p> : null}
              {settings.business_hours ? <p className="mt-3 text-sm text-paper/60">{settings.business_hours}</p> : null}
            </div>
            <a
              href={buildWhatsAppUrl(whatsapp, `${settings.whatsapp_greeting} Vim pelo site ${SITE_URL.replace(/^https?:\/\//, "")} e gostaria de atendimento.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-13 min-h-[3.25rem] items-center gap-3 rounded-[2px] bg-paper px-8 text-xs font-semibold uppercase tracking-[0.16em] text-ink hover:bg-ivory"
            >
              <WhatsAppIcon className="h-4 w-4" /> Conversar no WhatsApp
            </a>
          </div>
        </section>
      ) : null}

      {content.faqs.length > 0 ? (
        <section className="container-page pt-24 sm:pt-32" aria-labelledby="faq">
          <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-20">
            <div>
              <p className="eyebrow mb-3">Dúvidas</p>
              <h2 id="faq" className="heading-display text-[2rem] sm:text-[2.5rem]">
                Perguntas frequentes
              </h2>
              <Link href="/perguntas-frequentes" className="mt-6 inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.2em] underline underline-offset-4">
                Ver todas <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <FaqList faqs={content.faqs} />
          </div>
        </section>
      ) : null}
    </>
  );
}
