"use client";

import { ExternalLink, Headset, Heart, History } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { buttonClasses } from "@/components/ui/button";
import { forgetDeviceCustomer } from "@/lib/store/customer";
import { forgetDeviceOrders, readDeviceOrders, type DeviceOrder } from "@/lib/store/order-history";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useCart } from "./cart-context";
import { AccountSession } from "./account-session";
import { useStoreConfig } from "./store-config";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * "Minha conta": the signed-in account (data, password, addresses, orders), or the sign-in when signed out.
 * Orders sent from this browser before accounts were required are still listed, only when there are any.
 */
export function AccountOverview() {
  const { favorites, hydrated } = useCart();
  const { whatsappNumber, whatsappGreeting } = useStoreConfig();
  const [deviceOrders, setDeviceOrders] = useState<DeviceOrder[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeviceOrders(readDeviceOrders());
    forgetDeviceCustomer();
  }, []);

  const whatsappHref = whatsappNumber ? buildWhatsAppUrl(whatsappNumber, `${whatsappGreeting} Gostaria de ajuda com um pedido.`) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
      <div className="min-w-0 space-y-8">
        <AccountSession />

        {deviceOrders.length > 0 ? (
          <section id="pedidos-aparelho" aria-labelledby="pedidos-aparelho-titulo" className="scroll-mt-40 border border-line">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4">
              <h2 id="pedidos-aparelho-titulo" className="flex items-center gap-2.5 text-[0.9375rem] font-semibold">
                <History className="h-4 w-4" strokeWidth={1.5} /> Pedidos feitos neste aparelho
              </h2>
              <button
                type="button"
                onClick={() => {
                  forgetDeviceOrders();
                  setDeviceOrders([]);
                }}
                className="text-xs text-muted underline underline-offset-2 hover:text-ink"
              >
                Limpar histórico deste aparelho
              </button>
            </header>
            <ul className="divide-y divide-line">
              {deviceOrders.map((o) => (
                <li key={o.code} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="font-semibold tabular-nums">{o.code}</p>
                    <p className="text-xs text-muted">{dateFormat.format(new Date(o.at))}</p>
                  </div>
                  {o.url.startsWith("/") ? (
                    <Link href={o.url} className="inline-flex items-center gap-2 text-xs font-semibold underline underline-offset-4">
                      Ver pedido e pagamento
                    </Link>
                  ) : (
                    <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs font-semibold underline underline-offset-4">
                      <WhatsAppIcon className="h-3.5 w-3.5" /> Abrir conversa do pedido <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-5 py-4 text-xs leading-relaxed text-muted">Pedidos feitos antes da conta ficam salvos apenas neste navegador.</p>
          </section>
        ) : null}
      </div>

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
            <Headset className="h-4 w-4" strokeWidth={1.5} /> Atendimento
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">Dúvidas sobre um pedido ou sobre seus dados? Fale com uma pessoa da nossa equipe. Para excluir sua conta ou seus dados, é só pedir.</p>
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
