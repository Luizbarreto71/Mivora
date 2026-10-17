"use client";

import { ChevronDown, Heart, Menu, Search, ShoppingBag, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { AccountMenu } from "./auth/account-menu";
import { useCart } from "./cart-context";
import { HeaderSearch } from "./header-search";
import { SearchDialog } from "./search-dialog";
import { useStoreConfig } from "./store-config";

export type NavData = {
  productTypes: { slug: string; name: string }[];
  concerns: { slug: string; name: string }[];
  brands: { slug: string; name: string }[];
  hasKits: boolean;
  /** "Análise de Pele com IA" is on and the AI is configured */
  skinAnalysis: boolean;
};

function AiBadge() {
  return <span className="rounded-full bg-rose px-1.5 py-px text-[0.625rem] font-semibold tracking-[0.08em] text-rose-ink">IA</span>;
}

const ICON_BUTTON = "relative flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-ivory";
const NAV_LINK = "flex h-11 items-center gap-1 text-ink/85 transition-colors hover:text-ink";
const PANEL =
  "invisible absolute top-full z-50 translate-y-1 border border-line bg-paper opacity-0 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.18)] transition-all duration-200 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100";

function collections(hasKits: boolean) {
  return [
    { href: "/novidades", label: "Novidades" },
    { href: "/mais-vendidos", label: "Mais vendidos" },
    { href: "/ofertas", label: "Ofertas" },
    ...(hasKits ? [{ href: "/kits", label: "Kits" }] : []),
    { href: "/ritual", label: "Monte seu ritual" },
  ];
}

export function Header({ nav, registered }: { nav: NavData; registered: boolean }) {
  const { totals, hydrated, open: openCart, favorites } = useCart();
  const { whatsappNumber, whatsappGreeting } = useStoreConfig();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const count = hydrated ? totals.itemCount : 0;
  const favoriteCount = hydrated ? favorites.length : 0;
  const whatsappHref = whatsappNumber ? buildWhatsAppUrl(whatsappNumber, `${whatsappGreeting} Gostaria de atendimento.`) : null;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur-md supports-[backdrop-filter]:bg-paper/90">
        <div className="container-page grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 lg:h-[4.5rem] lg:grid-cols-[minmax(9rem,1fr)_minmax(0,34rem)_minmax(9rem,1fr)] lg:gap-10">
          <div className="-ml-2.5 flex items-center lg:hidden">
            <button type="button" className={ICON_BUTTON} onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
              <Menu className="h-5 w-5" strokeWidth={1.5} />
            </button>
            <button type="button" className={ICON_BUTTON} onClick={() => setSearchOpen(true)} aria-label="Buscar produtos">
              <Search className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </div>

          <Link href="/" aria-label="MIVORA — página inicial" className="flex h-[1.125rem] items-center justify-self-center sm:h-5 lg:h-[1.375rem] lg:justify-self-start">
            <Logo registered={registered} className="h-full" />
          </Link>

          <HeaderSearch className="hidden w-full lg:block" />

          <div className="-mr-2.5 flex items-center justify-end">
            <Suspense
              fallback={
                <Link href="/minha-conta" className={ICON_BUTTON} aria-label="Minha conta">
                  <User className="h-5 w-5" strokeWidth={1.5} />
                </Link>
              }
            >
              <AccountMenu buttonClassName={ICON_BUTTON} />
            </Suspense>
            <Link href="/favoritos" className={cn(ICON_BUTTON, "hidden sm:flex")} aria-label={`Favoritos${favoriteCount ? ` (${favoriteCount})` : ""}`}>
              <Heart className="h-5 w-5" strokeWidth={1.5} />
              {favoriteCount > 0 ? <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-ink" /> : null}
            </Link>
            <button type="button" onClick={openCart} className={ICON_BUTTON} aria-label={`Abrir sacola, ${count} ${count === 1 ? "item" : "itens"}`}>
              <ShoppingBag className="h-5 w-5" strokeWidth={1.5} />
              {count > 0 ? (
                <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink px-1 text-[0.625rem] font-semibold text-paper">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <nav aria-label="Principal" className="relative hidden border-t border-line/70 lg:block">
          <ul className="container-page flex h-11 items-center justify-center gap-10 text-[0.8125rem] font-medium">
            <li>
              <Link href="/" className={NAV_LINK}>
                Início
              </Link>
            </li>
            <li className="group">
              <Link href="/produtos" className={NAV_LINK}>
                Todos os produtos <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:rotate-180" strokeWidth={1.75} />
              </Link>
              <div className={cn(PANEL, "left-0 right-0 border-x-0")}>
                <div className="container-page grid grid-cols-4 gap-10 py-9 font-normal">
                  <MenuColumn title="Tipo de produto" items={nav.productTypes.map((t) => ({ href: `/categorias/${t.slug}`, label: t.name }))} more={{ href: "/produtos", label: "Ver todos os produtos" }} />
                  <MenuColumn title="Coleções" items={collections(nav.hasKits)} />
                  <MenuColumn title="Marcas" items={nav.brands.slice(0, 10).map((b) => ({ href: `/marcas/${b.slug}`, label: b.name }))} more={{ href: "/marcas", label: "Todas as marcas" }} />
                  <Link href="/ritual" className="group/promo relative flex min-h-56 flex-col justify-end overflow-hidden rounded-card p-6 text-paper">
                    <Image src="/editorial/editorial-rotina.webp" alt="" fill sizes="22rem" className="object-cover transition-transform duration-700 group-hover/promo:scale-105" />
                    <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/20 to-transparent" />
                    <span className="relative t-label text-paper/80">Ritual MIVORA</span>
                    <span className="relative mt-2 text-[1.125rem] font-semibold leading-snug">Descubra a rotina ideal para o seu objetivo.</span>
                    <span className="relative mt-3 text-xs font-semibold underline underline-offset-4">Monte seu ritual</span>
                  </Link>
                </div>
              </div>
            </li>
            <li className="group relative">
              <Link href="/marcas" className={NAV_LINK}>
                Marcas <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:rotate-180" strokeWidth={1.75} />
              </Link>
              <div className={cn(PANEL, "left-1/2 w-[30rem] -translate-x-1/2 p-6 group-hover:-translate-x-1/2 group-focus-within:-translate-x-1/2")}>
                <ul className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-[0.8125rem] font-normal">
                  {nav.brands.map((b) => (
                    <li key={b.slug}>
                      <Link href={`/marcas/${b.slug}`} className="text-ink-soft hover:text-ink hover:underline hover:underline-offset-4">
                        {b.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/marcas" className="mt-5 inline-block text-xs font-semibold underline underline-offset-4">
                  Todas as marcas
                </Link>
              </div>
            </li>
            <li className="group relative">
              <Link href="/categorias" className={NAV_LINK}>
                Cuidados com a pele <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:rotate-180" strokeWidth={1.75} />
              </Link>
              <div className={cn(PANEL, "left-1/2 w-[26rem] -translate-x-1/2 p-6 group-hover:-translate-x-1/2 group-focus-within:-translate-x-1/2")}>
                <p className="eyebrow mb-3">Encontre seu cuidado</p>
                <ul className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-[0.8125rem] font-normal">
                  {nav.concerns.map((c) => (
                    <li key={c.slug}>
                      <Link href={`/categorias/${c.slug}`} className="text-ink-soft hover:text-ink hover:underline hover:underline-offset-4">
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/ritual" className="mt-5 inline-block text-xs font-semibold underline underline-offset-4">
                  Monte seu ritual
                </Link>
              </div>
            </li>
            {nav.skinAnalysis ? (
              <li>
                <Link href="/analise-de-pele" className={cn(NAV_LINK, "gap-1.5")}>
                  Análise de pele <AiBadge />
                </Link>
              </li>
            ) : null}
            <li>
              <Link href="/novidades" className={NAV_LINK}>
                Novidades
              </Link>
            </li>
            <li>
              <Link href="/contato" className={NAV_LINK}>
                Contato
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <Suspense fallback={null}>
        <CloseOnNavigate
          onNavigate={() => {
            setMenuOpen(false);
            setSearchOpen(false);
          }}
        />
      </Suspense>
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} side="left" title="Menu">
        <MobileMenu nav={nav} whatsappHref={whatsappHref} favoriteCount={favoriteCount} />
      </Sheet>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

/** Reads the pathname behind its own Suspense boundary so the header stays in the static shell. */
function CloseOnNavigate({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const callback = useRef(onNavigate);
  useEffect(() => {
    callback.current = onNavigate;
  });
  useEffect(() => {
    callback.current();
  }, [pathname]);
  return null;
}

function MenuColumn({ title, items, more }: { title: string; items: { href: string; label: string }[]; more?: { href: string; label: string } }) {
  return (
    <div>
      <p className="eyebrow mb-4">{title}</p>
      <ul className="space-y-2.5 text-[0.8125rem]">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="text-ink-soft hover:text-ink hover:underline hover:underline-offset-4">
              {i.label}
            </Link>
          </li>
        ))}
        {more ? (
          <li className="pt-1.5">
            <Link href={more.href} className="text-xs font-semibold underline underline-offset-4">
              {more.label}
            </Link>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function MobileMenu({ nav, whatsappHref, favoriteCount }: { nav: NavData; whatsappHref: string | null; favoriteCount: number }) {
  const row = "flex h-[3.25rem] items-center justify-between text-[0.9375rem] font-medium";
  const groups = [
    { title: "Marcas", items: nav.brands.map((b) => ({ href: `/marcas/${b.slug}`, label: b.name })), more: { href: "/marcas", label: "Todas as marcas" } },
    {
      title: "Cuidados com a pele",
      items: [...nav.concerns.map((c) => ({ href: `/categorias/${c.slug}`, label: c.name })), ...nav.productTypes.map((t) => ({ href: `/categorias/${t.slug}`, label: t.name }))],
      more: { href: "/categorias", label: "Todas as categorias" },
    },
  ];
  return (
    <nav aria-label="Menu" className="flex min-h-full flex-col px-5 pb-8 pt-1">
      <ul className="divide-y divide-line">
        <li>
          <Link href="/" className={row}>
            Início
          </Link>
        </li>
        <li>
          <Link href="/produtos" className={row}>
            Todos os produtos
          </Link>
        </li>
        {nav.skinAnalysis ? (
          <li>
            <Link href="/analise-de-pele" className={row}>
              <span className="flex items-center gap-2">
                Análise de pele com IA <AiBadge />
              </span>
            </Link>
          </li>
        ) : null}
        {groups.map((g) => (
          <li key={g.title}>
            <details className="group">
              <summary className={cn(row, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                {g.title}
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={1.5} />
              </summary>
              <ul className="pb-3">
                {g.items.map((i) => (
                  <li key={i.href}>
                    <Link href={i.href} className="flex min-h-10 items-center text-[0.875rem] text-ink-soft">
                      {i.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href={g.more.href} className="flex min-h-10 items-center text-xs font-semibold underline underline-offset-4">
                    {g.more.label}
                  </Link>
                </li>
              </ul>
            </details>
          </li>
        ))}
        {collections(nav.hasKits).map((l) => (
          <li key={l.href}>
            <Link href={l.href} className={row}>
              {l.label}
            </Link>
          </li>
        ))}
        <li>
          <Link href="/contato" className={row}>
            Contato
          </Link>
        </li>
      </ul>

      <ul className="mt-6 space-y-1 border-t border-line pt-5 text-[0.875rem]">
        <li>
          <Link href="/minha-conta" className="flex min-h-10 items-center gap-3">
            <User className="h-4 w-4" strokeWidth={1.5} /> Minha conta
          </Link>
        </li>
        <li>
          <Link href="/minha-conta#pedidos" className="flex min-h-10 items-center gap-3">
            <ShoppingBag className="h-4 w-4" strokeWidth={1.5} /> Meus pedidos
          </Link>
        </li>
        <li>
          <Link href="/favoritos" className="flex min-h-10 items-center gap-3">
            <Heart className="h-4 w-4" strokeWidth={1.5} /> Favoritos{favoriteCount ? ` (${favoriteCount})` : ""}
          </Link>
        </li>
      </ul>

      {whatsappHref ? (
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="mt-auto flex h-12 items-center justify-center gap-2 bg-ink text-xs font-semibold uppercase tracking-[0.14em] text-paper">
          <WhatsAppIcon className="h-4 w-4" /> WhatsApp
        </a>
      ) : null}
    </nav>
  );
}
