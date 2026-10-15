"use client";

import { LogOut, MapPin, Package, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatBRL } from "@/lib/money";
import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/payments/payment-labels";
import { formatCep } from "@/lib/shipping/cep";
import { deleteMyAddress, getMyAccount, getMyOrders, signOutAccount, type Account, type MyOrder } from "@/lib/store/account-actions";
import { formatBrPhone } from "@/lib/store/customer";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types";
import { SocialSignIn } from "./auth/social-sign-in";
import { useStoreConfig } from "./store-config";
import { maskedCpf } from "./checkout/identity-section";

const PROVIDER_LABEL: Record<string, string> = { google: "Google", apple: "Apple", email: "e-mail e senha" };
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

/** Signed-in account (Google / Apple): data, saved addresses and the orders placed while signed in. */
export function AccountSession() {
  const { socialProviders } = useStoreConfig();
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyAccount().catch(() => null), getMyOrders().catch(() => null)]).then(([a, o]) => {
      if (cancelled) return;
      setAccount(a);
      setOrders(o);
    });
    const login = new URL(window.location.href).searchParams.get("login");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (login === "erro") setNotice("Não foi possível entrar agora. Tente de novo.");
    return () => {
      cancelled = true;
    };
  }, []);

  if (account === undefined) return <div className="h-28 animate-pulse bg-ivory" aria-busy="true" />;

  if (!account) {
    if (!socialProviders.google && !socialProviders.apple) return null;
    return (
      <section aria-labelledby="entrar-titulo" className="border border-line px-5 py-5">
        <h2 id="entrar-titulo" className="text-[0.9375rem] font-semibold">
          Entrar na sua conta
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted">Entre para salvar seus dados e endereços e acompanhar seus pedidos em qualquer aparelho.</p>
        {notice ? (
          <p className="mb-3 text-sm text-danger" role="alert">
            {notice}
          </p>
        ) : null}
        <SocialSignIn providers={socialProviders} next="/minha-conta" className="max-w-sm" />
      </section>
    );
  }

  const name = [account.firstName, account.lastName].filter(Boolean).join(" ") || account.providerName || account.email;

  return (
    <section aria-labelledby="conta-titulo" className="border border-line">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 id="conta-titulo" className="flex items-center gap-2.5 text-[0.9375rem] font-semibold">
          <UserRound className="h-4 w-4 text-rose-ink" strokeWidth={1.5} /> Sua conta
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await signOutAccount().catch(() => null);
            setAccount(null);
            setOrders(null);
            setBusy(false);
          }}
          className="inline-flex items-center gap-1.5 text-xs text-muted underline underline-offset-4 hover:text-ink"
        >
          <LogOut className="h-3.5 w-3.5" /> Sair da conta
        </button>
      </header>
      <div className="space-y-6 px-5 py-5 text-sm">
        <div>
          <p className="font-semibold">{name}</p>
          <p className="break-all text-muted">{account.email}</p>
          {account.phone ? <p className="text-muted">{formatBrPhone(account.phone)}{account.cpf ? ` · CPF ${maskedCpf(account.cpf)}` : ""}</p> : null}
          <p className="mt-1 text-xs text-muted">Conectada com {PROVIDER_LABEL[account.provider] ?? account.provider}. {account.saved ? "Seus dados são usados para preencher a finalização." : "Complete seus dados na próxima compra."}</p>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-2 font-semibold">
            <MapPin className="h-4 w-4" strokeWidth={1.5} /> Endereços salvos
          </p>
          {account.addresses.length === 0 ? (
            <p className="text-muted">Nenhum endereço salvo. Você pode salvar um na finalização da compra.</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {account.addresses.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="font-medium">{a.recipient}</span>
                    {a.isDefault ? <span className="ml-2 rounded-full bg-rose px-2 py-0.5 text-[0.6875rem] text-rose-ink">Principal</span> : null}
                    <span className="block text-xs text-muted">
                      {a.street}, {a.number}
                      {a.complement ? ` · ${a.complement}` : ""} · {a.district} · {a.city}/{a.uf} · CEP {formatCep(a.cep)}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Excluir o endereço de ${a.recipient}`}
                    onClick={async () => {
                      const r = await deleteMyAddress(a.id).catch(() => null);
                      if (r?.ok) setAccount((acc) => (acc ? { ...acc, addresses: acc.addresses.filter((x) => x.id !== a.id) } : acc));
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-ivory hover:text-ink"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-2 flex items-center gap-2 font-semibold">
            <Package className="h-4 w-4" strokeWidth={1.5} /> Pedidos da conta
          </p>
          {!orders || orders.length === 0 ? (
            <p className="text-muted">Os pedidos feitos com a conta conectada aparecem aqui.</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span>
                    <Link href={`/pedido/${o.id}`} className="font-semibold tabular-nums underline-offset-4 hover:underline">
                      {o.code}
                    </Link>
                    <span className="block text-xs text-muted">
                      {dateFormat.format(new Date(o.createdAt))} · {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}
                      {o.paymentMethod === "mercadopago" ? ` · ${PAYMENT_STATUS_LABEL[o.paymentStatus as PaymentStatus] ?? o.paymentStatus}` : ""}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatBRL(o.totalCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
