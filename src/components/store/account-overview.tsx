"use client";

import { ExternalLink, Headset, Heart, Package, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { buttonClasses } from "@/components/ui/button";
import { forgetDeviceCustomer, formatBrPhone, readDeviceCustomer, type CustomerProfile } from "@/lib/store/customer";
import { forgetDeviceOrders, readDeviceOrders, type DeviceOrder } from "@/lib/store/order-history";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useCart } from "./cart-context";
import { AccountSession } from "./account-session";
import { CustomerForm } from "./customer-form";
import { useStoreConfig } from "./store-config";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * "Minha conta": the customer's registration (required to buy, no password), the orders sent from
 * this device and the favourites. The registration is stored in the database; this device only
 * remembers it to fill the checkout.
 */
export function AccountOverview() {
  const { favorites, hydrated } = useCart();
  const { whatsappNumber, whatsappGreeting } = useStoreConfig();
  const [orders, setOrders] = useState<DeviceOrder[] | null>(null);
  const [customer, setCustomer] = useState<CustomerProfile | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrders(readDeviceOrders());
    setCustomer(readDeviceCustomer());
  }, []);

  const whatsappHref = whatsappNumber ? buildWhatsAppUrl(whatsappNumber, `${whatsappGreeting} Gostaria de ajuda com um pedido.`) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:gap-12">
      <div className="space-y-8">
        <AccountSession />
        <section id="cadastro" aria-labelledby="cadastro-titulo" className="scroll-mt-40 border border-line">
          <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
            <h2 id="cadastro-titulo" className="flex items-center gap-2.5 text-[0.9375rem] font-semibold">
              <UserRound className="h-4 w-4" strokeWidth={1.5} /> Meu cadastro
            </h2>
            {customer && !editing ? (
              <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold underline underline-offset-4">
                Alterar dados
              </button>
            ) : null}
          </header>
          <div className="px-5 py-5">
            {customer === undefined ? (
              <div className="h-24 animate-pulse bg-ivory" aria-busy="true" />
            ) : !customer || editing ? (
              <>
                {!customer ? <p className="mb-5 text-sm text-muted">O cadastro é necessário para comprar na MIVORA. Faça agora e finalize suas próximas compras mais rápido.</p> : null}
                <CustomerForm
                  initial={customer}
                  source="conta"
                  submitLabel={customer ? "Salvar alterações" : "Fazer cadastro"}
                  onDone={(c) => {
                    setCustomer(c);
                    setEditing(false);
                  }}
                  onCancel={customer ? () => setEditing(false) : undefined}
                />
              </>
            ) : (
              <div className="flex flex-wrap items-end justify-between gap-4 text-sm">
                <dl className="grid gap-1">
                  <dt className="sr-only">Nome</dt>
                  <dd className="font-semibold">{customer.name}</dd>
                  <dt className="sr-only">WhatsApp</dt>
                  <dd className="text-muted">{formatBrPhone(customer.phone)}</dd>
                  <dt className="sr-only">E-mail</dt>
                  <dd className="break-all text-muted">{customer.email}</dd>
                  <dd className="mt-1 text-xs text-muted">{customer.marketing ? "Recebe novidades e ofertas" : "Não recebe novidades e ofertas"}</dd>
                </dl>
                <button
                  type="button"
                  onClick={() => {
                    forgetDeviceCustomer();
                    setCustomer(null);
                  }}
                  className="text-xs text-muted underline underline-offset-2 hover:text-ink"
                >
                  Sair deste aparelho
                </button>
              </div>
            )}
          </div>
        </section>

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
          )}
          <p className="border-t border-line px-5 py-4 text-xs leading-relaxed text-muted">
            Pedidos pagos pelo site mostram a situação do pagamento na página do pedido. Os demais são acompanhados pela nossa equipe no WhatsApp. Este histórico fica salvo apenas neste navegador.
          </p>
        </section>
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
          <p className="mt-2 text-sm leading-relaxed text-muted">Monte o carrinho, finalize com seu cadastro e fale com uma pessoa da nossa equipe pelo WhatsApp. Para corrigir ou excluir seu cadastro, é só pedir.</p>
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
