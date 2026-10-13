"use client";

import { ExternalLink, Heart, Package, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { buttonClasses } from "@/components/ui/button";
import { forgetDeviceOrders, readDeviceOrders, type DeviceOrder } from "@/lib/store/order-history";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useCart } from "./cart-context";
import { useStoreConfig } from "./store-config";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * "Minha conta" without sign-up: MIVORA sells through WhatsApp, so this page gathers what this
 * device remembers (orders sent from here and favourites) and the ways to reach the store.
 */
export function AccountOverview() {
  const { favorites, hydrated } = useCart();
  const { whatsappNumber, whatsappGreeting } = useStoreConfig();
  const [orders, setOrders] = useState<DeviceOrder[] | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrders(readDeviceOrders());
  }, []);

  const whatsappHref = whatsappNumber ? buildWhatsAppUrl(whatsappNumber, `${whatsappGreeting} Gostaria de ajuda com um pedido.`) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:gap-12">
      <section id="pedidos" aria-labelledby="pedidos-titulo" className="scroll-mt-40 border border-line">
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id="pedidos-titulo" className="flex items-center gap-2.5 text-[0.9375rem] font-semibold">
            <Package className="h-4 w-4" strokeWidth={1.5} /> Meus pedidos
          </h2>
          {orders && orders.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                forgetDeviceOrders();
                setOrders([]);
              }}
              className="text-xs text-muted underline underline-offset-2 hover:text-ink"
            >
              Limpar histórico deste aparelho
            </button>
          ) : null}
        </header>
        {orders === null ? (
          <div className="h-32 animate-pulse bg-ivory" aria-busy="true" />
        ) : orders.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-muted">Nenhum pedido feito neste aparelho ainda.</p>
            <Link href="/produtos" className={buttonClasses("primary", "md", "mt-5")}>
              Explorar produtos
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {orders.map((o) => (
              <li key={o.code} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-semibold tabular-nums">{o.code}</p>
                  <p className="text-xs text-muted">{dateFormat.format(new Date(o.at))}</p>
                </div>
                <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs font-semibold underline underline-offset-4">
                  <WhatsAppIcon className="h-3.5 w-3.5" /> Abrir conversa do pedido <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-line px-5 py-4 text-xs leading-relaxed text-muted">
          A situação de cada pedido (confirmação, pagamento e entrega) é informada pela nossa equipe no WhatsApp. Este histórico fica salvo apenas neste navegador.
        </p>
      </section>

      <aside className="space-y-6">
        <div className="border border-line p-5">
          <h2 className="flex items-center gap-2.5 text-[0.9375rem] font-semibold">
            <Heart className="h-4 w-4" strokeWidth={1.5} /> Favoritos
          </h2>
          <p className="mt-2 text-sm text-muted">{hydrated ? (favorites.length === 0 ? "Você ainda não salvou produtos." : `${favorites.length} ${favorites.length === 1 ? "produto salvo" : "produtos salvos"} neste aparelho.`) : " "}</p>
          <Link href="/favoritos" className={buttonClasses("outline", "md", "mt-4 w-full")}>
            Ver favoritos
          </Link>
        </div>
        <div className="border border-line p-5">
          <h2 className="flex items-center gap-2.5 text-[0.9375rem] font-semibold">
            <ShieldCheck className="h-4 w-4" strokeWidth={1.5} /> Compra sem cadastro
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">Na MIVORA você não precisa criar conta nem senha: monte o carrinho, finalize pelo WhatsApp e fale com uma pessoa da nossa equipe.</p>
          {whatsappHref ? (
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "md", "mt-4 w-full")}>
              <WhatsAppIcon className="h-4 w-4" /> Falar com a MIVORA
            </a>
          ) : null}
          <Link href="/politica-de-privacidade" className="mt-4 inline-block text-xs underline underline-offset-2">
            Como usamos seus dados
          </Link>
        </div>
      </aside>
    </div>
  );
}
