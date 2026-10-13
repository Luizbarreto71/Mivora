"use client";

import {
  Boxes,
  ClipboardList,
  FileText,
  HelpCircle,
  History,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  Package,
  Palette,
  Settings,
  ShoppingBag,
  Tags,
  Warehouse,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Painel", Icon: LayoutDashboard, exact: true },
  { href: "/admin/pedidos", label: "Pedidos", Icon: ClipboardList },
  { href: "/admin/produtos", label: "Produtos", Icon: Package },
  { href: "/admin/estoque", label: "Estoque", Icon: Warehouse },
  { href: "/admin/kits", label: "Kits", Icon: Boxes },
  { href: "/admin/marcas", label: "Marcas", Icon: ShoppingBag },
  { href: "/admin/categorias", label: "Categorias", Icon: Tags },
  { href: "/admin/conteudo", label: "Conteúdo da home", Icon: Palette },
  { href: "/admin/faq", label: "Perguntas frequentes", Icon: HelpCircle },
  { href: "/admin/paginas", label: "Páginas", Icon: FileText },
  { href: "/admin/sugestoes", label: "Sugestões de produtos", Icon: Lightbulb },
  { href: "/admin/configuracoes", label: "Configurações", Icon: Settings },
  { href: "/admin/auditoria", label: "Auditoria", Icon: History },
];

export function AdminSidebar({ email, signOut }: { email: string | null; signOut: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Administração">
      {NAV.map(({ href, label, Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm transition", active ? "bg-ink text-paper" : "text-ink-soft hover:bg-ivory")}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} /> {label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-line p-4">
      <p className="truncate text-xs text-muted" title={email ?? undefined}>
        {email}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Link href="/" target="_blank" className="text-xs underline underline-offset-2">
          Ver loja
        </Link>
        <form action={signOut}>
          <button type="submit" className="flex items-center gap-1.5 text-xs text-muted hover:text-ink">
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-paper px-4 lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menu" className="-ml-2 flex h-10 w-10 items-center justify-center">
          <Menu className="h-5 w-5" />
        </button>
        <span className="flex h-4 items-center gap-2">
          <Logo className="h-full" />
          <span className="text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-muted">Admin</span>
        </span>
        <span className="w-10" />
      </div>

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-paper lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-line px-6">
          <span className="h-4">
            <Logo className="h-full" />
          </span>
          <span className="text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-muted">Admin</span>
        </div>
        {nav}
        {footer}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-dvh w-72 flex-col bg-paper">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <span className="h-4">
                <Logo className="h-full" />
              </span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="flex h-10 w-10 items-center justify-center">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      ) : null}
    </>
  );
}
