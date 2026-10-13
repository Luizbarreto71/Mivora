"use client";

import { ChevronDown, Heart, Menu, Search, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useCart } from "./cart-context";
import { SearchDialog } from "./search-dialog";
import { useStoreConfig } from "./store-config";

export type NavData = {
  productTypes: { slug: string; name: string }[];
  concerns: { slug: string; name: string }[];
  brands: { slug: string; name: string }[];
  hasKits: boolean;
};

const MAIN_LINKS = [
  { href: "/novidades", label: "Novidades" },
  { href: "/mais-vendidos", label: "Mais vendidos" },
  { href: "/ritual", label: "Monte seu ritual" },
];

export function Header({ nav, registered }: { nav: NavData; registered: boolean }) {
  const { totals, hydrated, open: openCart, favorites } = useCart();
  const { whatsappNumber, whatsappGreeting } = useStoreConfig();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);


  const count = hydrated ? totals.itemCount : 0;
  const whatsappHref = whatsappNumber ? buildWhatsAppUrl(whatsappNumber, `${whatsappGreeting} Gostaria de atendimento.`) : null;

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 border-b bg-paper/95 backdrop-blur-md transition-[border-color,box-shadow] duration-300 supports-[backdrop-filter]:bg-paper/85",
          scrolled ? "border-line shadow-[0_1px_0_rgba(0,0,0,0.02)]" : "border-transparent",
        )}
      >
        <div className="container-page grid h-16 grid-cols-[1fr_auto_1fr] items-center lg:h-20">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="-ml-2.5 flex h-11 w-11 items-center justify-center rounded-full hover:bg-ivory lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-11 items-center gap-2.5 rounded-full px-2.5 text-sm text-muted hover:text-ink lg:-ml-2.5"
              aria-label="Buscar produtos"
            >
              <Search className="h-5 w-5 text-ink" strokeWidth={1.5} />
              <span className="hidden text-[0.8125rem] lg:inline">Buscar produtos, marcas ou ativos</span>
            </button>
          </div>

          <Link href="/" aria-label="MIVORA — página inicial" className="flex h-5 items-center sm:h-6 lg:h-[1.875rem]">
            <Logo registered={registered} className="h-full" />
          </Link>

          <div className="flex items-center justify-end gap-0.5">
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden h-11 w-11 items-center justify-center rounded-full hover:bg-ivory sm:flex"
                aria-label="Falar com a MIVORA no WhatsApp"
              >
                <WhatsAppIcon className="h-[18px] w-[18px]" />
              </a>
            ) : null}
            <Link
              href="/favoritos"
              className="relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-ivory"
              aria-label={`Favoritos${hydrated && favorites.length ? ` (${favorites.length})` : ""}`}
            >
              <Heart className="h-5 w-5" strokeWidth={1.5} />
              {hydrated && favorites.length > 0 ? <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-ink" /> : null}
            </Link>
            <button
              type="button"
              onClick={openCart}
              className="relative -mr-2.5 flex h-11 w-11 items-center justify-center rounded-full hover:bg-ivory"
              aria-label={`Abrir carrinho, ${count} ${count === 1 ? "item" : "itens"}`}
            >
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
          <ul className="container-page flex h-12 items-center justify-center gap-9 text-[0.6875rem] font-semibold uppercase tracking-[0.2em]">
            <li className="group">
              <Link href="/produtos" className="flex h-12 items-center gap-1.5 hover:opacity-70">
                Produtos <ChevronDown className="h-3 w-3 transition-transform group-hover:rotate-180" strokeWidth={2} />
              </Link>
              <MegaPanel nav={nav} />
            </li>
            <li className="group relative">
              <Link href="/marcas" className="flex h-12 items-center gap-1.5 hover:opacity-70">
                Marcas <ChevronDown className="h-3 w-3 transition-transform group-hover:rotate-180" strokeWidth={2} />
              </Link>
              <div className="invisible absolute left-1/2 top-full z-50 w-60 -translate-x-1/2 translate-y-1 border border-line bg-paper p-5 opacity-0 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.18)] transition-all duration-200 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                <ul className="space-y-2.5 text-[0.8125rem] font-normal normal-case tracking-normal">
                  {nav.brands.map((b) => (
                    <li key={b.slug}>
                      <Link href={`/marcas/${b.slug}`} className="text-ink-soft hover:text-ink hover:underline hover:underline-offset-4">
                        {b.name}
                      </Link>
                    </li>
                  ))}
                  <li className="pt-1">
                    <Link href="/marcas" className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] hover:opacity-70">
                      Todas as marcas
                    </Link>
                  </li>
                </ul>
              </div>
            </li>
            {MAIN_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="flex h-12 items-center hover:opacity-70">
                  {l.label}
                </Link>
              </li>
            ))}
            {nav.hasKits ? (
              <li>
                <Link href="/kits" className="flex h-12 items-center hover:opacity-70">
                  Kits
                </Link>
              </li>
            ) : null}
            <li>
              <Link href="/ofertas" className="flex h-12 items-center hover:opacity-70">
                Ofertas
              </Link>
            </li>
            <li>
              <Link href="/contato" className="flex h-12 items-center hover:opacity-70">
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
        <MobileMenu nav={nav} whatsappHref={whatsappHref} />
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

function MegaPanel({ nav }: { nav: NavData }) {
  return (
    <div className="invisible absolute left-0 right-0 top-full z-50 translate-y-1 border-y border-line bg-paper opacity-0 shadow-[0_32px_64px_-32px_rgba(0,0,0,0.2)] transition-all duration-200 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
      <div className="container-page grid grid-cols-4 gap-10 py-10 font-normal normal-case tracking-normal">
        <MenuColumn title="Tipo de produto" base="/categorias" items={nav.productTypes} />
        <MenuColumn title="Encontre seu cuidado" base="/categorias" items={nav.concerns} />
        <MenuColumn title="Marcas" base="/marcas" items={nav.brands} />
        <div className="flex flex-col justify-between bg-ivory p-7">
          <div>
            <p className="eyebrow">Ritual MIVORA</p>
            <p className="heading-display mt-3 text-[1.375rem]">Descubra a rotina ideal para o seu objetivo.</p>
          </div>
          <Link href="/ritual" className="mt-6 text-[0.6875rem] font-semibold uppercase tracking-[0.2em] underline underline-offset-4">
            Monte seu ritual
          </Link>
        </div>
      </div>
    </div>
  );
}

function MenuColumn({ title, base, items }: { title: string; base: string; items: { slug: string; name: string }[] }) {
  return (
    <div>
      <p className="eyebrow mb-4">{title}</p>
      <ul className="space-y-2.5 text-[0.875rem]">
        {items.map((i) => (
          <li key={i.slug}>
            <Link href={`${base}/${i.slug}`} className="text-ink-soft hover:text-ink hover:underline hover:underline-offset-4">
              {i.name}
            </Link>
          </li>
        ))}
        <li className="pt-1">
          <Link href="/produtos" className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] hover:opacity-70">
            Ver todos
          </Link>
        </li>
      </ul>
    </div>
  );
}

function MobileMenu({ nav, whatsappHref }: { nav: NavData; whatsappHref: string | null }) {
  const sections = [
    { title: "Tipo de produto", base: "/categorias", items: nav.productTypes },
    { title: "Encontre seu cuidado", base: "/categorias", items: nav.concerns },
    { title: "Marcas", base: "/marcas", items: nav.brands },
  ];
  return (
    <nav aria-label="Menu" className="px-5 pb-10 pt-2">
      <ul className="divide-y divide-line">
        <li>
          <Link href="/produtos" className="flex h-14 items-center text-sm font-semibold uppercase tracking-[0.16em]">
            Todos os produtos
          </Link>
        </li>
        {sections.map((s) => (
          <li key={s.title}>
            <details className="group">
              <summary className="flex h-14 cursor-pointer list-none items-center justify-between text-sm font-semibold uppercase tracking-[0.16em] [&::-webkit-details-marker]:hidden">
                {s.title}
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={1.5} />
              </summary>
              <ul className="space-y-1 pb-4">
                {s.items.map((i) => (
                  <li key={i.slug}>
                    <Link href={`${s.base}/${i.slug}`} className="flex min-h-11 items-center text-[0.9375rem] text-ink-soft">
                      {i.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
        {[...MAIN_LINKS, ...(nav.hasKits ? [{ href: "/kits", label: "Kits" }] : []), { href: "/ofertas", label: "Ofertas" }, { href: "/favoritos", label: "Favoritos" }].map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex h-14 items-center text-sm font-semibold uppercase tracking-[0.16em]">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-8 space-y-3 text-[0.9375rem] text-ink-soft">
        <Link href="/sobre" className="block">Sobre a MIVORA</Link>
        <Link href="/perguntas-frequentes" className="block">Perguntas frequentes</Link>
        <Link href="/contato" className="block">Contato</Link>
      </div>
      {whatsappHref ? (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 flex h-12 items-center justify-center gap-2 border border-ink text-xs font-semibold uppercase tracking-[0.16em]"
        >
          <WhatsAppIcon className="h-4 w-4" /> Atendimento pelo WhatsApp
        </a>
      ) : null}
    </nav>
  );
}
