"use client";

import { CheckCircle2, KeyRound, LogOut, MailWarning, MapPin, Package, Plus, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { formatBRL } from "@/lib/money";
import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/payments/payment-labels";
import { formatCep } from "@/lib/shipping/cep";
import { deleteMyAddress, getMyAccount, getMyOrders, signOutAccount, type Account, type MyOrder } from "@/lib/store/account-actions";
import { formatBrPhone } from "@/lib/store/customer";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types";
import { AddressForm, ChangePasswordForm, GENDER_LABEL, PersonalDataForm } from "./account/account-forms";
import { LoginForm } from "./auth/login-form";
import { maskedCpf } from "./checkout/identity-section";
import { SavedSkinReports } from "./skin/saved-skin-reports";

const PROVIDER_LABEL: Record<string, string> = { google: "Google", apple: "Apple", email: "e-mail e senha" };
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const NOTICES: Record<string, { tone: "info" | "error"; text: string }> = {
  confirmado: { tone: "info", text: "E-mail confirmado! Sua conta está ativa." },
  ok: { tone: "info", text: "Pronto, você entrou na sua conta." },
  erro: { tone: "error", text: "Não foi possível entrar agora. Tente de novo." },
  cancelado: { tone: "info", text: "O login foi cancelado." },
};

function Card({ id, title, icon: Icon, action, children }: { id: string; title: string; icon: typeof UserRound; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-40 border border-line">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h3 id={`${id}-titulo`} className="flex items-center gap-2.5 text-[0.9375rem] font-semibold">
          <Icon className="h-4 w-4 text-rose-ink" strokeWidth={1.5} /> {title}
        </h3>
        {action}
      </header>
      <div className="px-5 py-5 text-sm">{children}</div>
    </section>
  );
}

/** Minha conta: the sign-in when signed out; the account's data, security, addresses and orders when signed in. */
export function AccountSession() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addingAddress, setAddingAddress] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyAccount().catch(() => null), getMyOrders().catch(() => null)]).then(([a, o]) => {
      if (cancelled) return;
      setAccount(a);
      setOrders(o);
    });
    const login = new URL(window.location.href).searchParams.get("login");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (login && NOTICES[login]) setNotice(NOTICES[login]);
    return () => {
      cancelled = true;
    };
  }, []);

  if (account === undefined) return <div className="h-40 animate-pulse bg-ivory" aria-busy="true" />;

  if (!account) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="entrar-titulo" className="border border-line px-5 py-6 sm:px-7">
          <h2 id="entrar-titulo" className="text-[1rem] font-semibold uppercase tracking-[0.12em]">
            Já tem uma conta?
          </h2>
          {notice ? (
            <p className={notice.tone === "error" ? "mt-3 text-sm text-danger" : "mt-3 text-sm text-ink-soft"} role="status">
              {notice.text}
            </p>
          ) : null}
          <div className="mt-5">
            <LoginForm next="/minha-conta" idPrefix="conta" />
          </div>
        </section>
        <section aria-labelledby="criar-titulo" className="flex flex-col border border-line bg-rose-soft px-5 py-6 sm:px-7">
          <h2 id="criar-titulo" className="text-[1rem] font-semibold uppercase tracking-[0.12em]">
            Crie sua conta MIVORA
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">A conta é necessária para comprar. Com ela você acompanha seus pedidos, salva endereços e dados e guarda os relatórios da análise de pele.</p>
          <Link href="/criar-conta?next=%2Fminha-conta" className={buttonClasses("primary", "lg", "mt-6 w-full md:mt-auto")}>
            Criar minha conta
          </Link>
        </section>
      </div>
    );
  }

  const name = [account.firstName, account.lastName].filter(Boolean).join(" ") || account.providerName || account.email;
  const provider = PROVIDER_LABEL[account.provider] ?? account.provider;

  return (
    <section aria-labelledby="conta-titulo" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="conta-titulo" className="text-lg font-semibold">
            Sua conta
          </h2>
          <p className="mt-1 break-all text-sm text-muted">
            {name !== account.email ? `${name} · ` : ""}
            {account.email}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await signOutAccount().catch(() => null);
            window.location.reload();
          }}
          className="inline-flex items-center gap-1.5 text-xs text-muted underline underline-offset-4 hover:text-ink"
        >
          <LogOut className="h-3.5 w-3.5" /> Sair da conta
        </button>
      </header>

      {notice ? (
        <p className={notice.tone === "error" ? "border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger" : "border border-rose-ink/20 bg-rose-soft px-4 py-3 text-sm"} role="status">
          {notice.text}
        </p>
      ) : null}

      <Card
        id="dados"
        title="Dados pessoais"
        icon={UserRound}
        action={
          !editing ? (
            <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold underline underline-offset-4">
              Editar dados
            </button>
          ) : null
        }
      >
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          {account.emailVerified ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-success" strokeWidth={2} /> <span className="text-success">E-mail confirmado</span>
            </>
          ) : (
            <>
              <MailWarning className="h-3.5 w-3.5 text-warning" strokeWidth={2} />
              <Link href={`/confirmar-email?email=${encodeURIComponent(account.email)}&next=%2Fminha-conta`} className="text-warning underline underline-offset-2">
                E-mail aguardando confirmação
              </Link>
            </>
          )}
          <span className="text-muted">· Conectada com {provider}</span>
        </p>
        <div className="mt-4">
          {editing ? (
            <PersonalDataForm
              account={account}
              onCancel={() => setEditing(false)}
              onSaved={(patch) => {
                setAccount({ ...account, ...patch });
                setEditing(false);
                setNotice({ tone: "info", text: "Dados salvos." });
              }}
            />
          ) : (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Nome</dt>
                <dd>{[account.firstName, account.lastName].filter(Boolean).join(" ") || "Não informado"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Telefone</dt>
                <dd>{account.phone ? formatBrPhone(account.phone) : "Não informado"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">CPF</dt>
                <dd>{account.cpf ? maskedCpf(account.cpf) : "Não informado"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Data de nascimento</dt>
                <dd>{account.birthDate ? new Date(`${account.birthDate}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "Não informada"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Gênero</dt>
                <dd>{account.gender ? (GENDER_LABEL[account.gender] ?? account.gender) : "Não informado"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Novidades e ofertas</dt>
                <dd>{account.marketing ? "Recebe" : "Não recebe"}</dd>
              </div>
            </dl>
          )}
        </div>
      </Card>

      <Card id="seguranca" title="Senha e segurança" icon={KeyRound}>
        {account.provider === "email" ? (
          <ChangePasswordForm />
        ) : (
          <p className="text-muted">
            Você entra com {provider}: a senha é a da sua conta {provider}, e a MIVORA não tem acesso a ela.
          </p>
        )}
      </Card>

      <Card
        id="enderecos"
        title="Endereços salvos"
        icon={MapPin}
        action={
          !addingAddress ? (
            <button type="button" onClick={() => setAddingAddress(true)} className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-4">
              <Plus className="h-3.5 w-3.5" /> Adicionar endereço
            </button>
          ) : null
        }
      >
        {addingAddress ? (
          <div className="mb-5">
            <AddressForm
              recipient={[account.firstName, account.lastName].filter(Boolean).join(" ") || account.providerName || ""}
              onCancel={() => setAddingAddress(false)}
              onSaved={(a) => {
                setAccount((acc) => (acc ? { ...acc, addresses: [a, ...acc.addresses.filter((x) => x.id !== a.id).map((x) => (a.isDefault ? { ...x, isDefault: false } : x))] } : acc));
                setAddingAddress(false);
              }}
            />
          </div>
        ) : null}
        {account.addresses.length === 0 ? (
          <p className="text-muted">Nenhum endereço salvo. Você também pode salvar um na finalização da compra.</p>
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
      </Card>

      <Card id="pedidos" title="Meus pedidos" icon={Package}>
        {!orders || orders.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-muted">Você ainda não fez pedidos com esta conta.</p>
            <Link href="/produtos" className={buttonClasses("primary", "md", "mt-4")}>
              Explorar produtos
            </Link>
          </div>
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
                    {o.paymentMethod === "mercadopago" ? ` · ${PAYMENT_STATUS_LABEL[o.paymentStatus as PaymentStatus] ?? o.paymentStatus}` : " · combinado pelo WhatsApp"}
                  </span>
                </span>
                <span className="flex items-center gap-4">
                  {o.totalCents != null ? <span className="tabular-nums">{formatBRL(o.totalCents)}</span> : null}
                  <Link href={`/pedido/${o.id}`} className="text-xs font-semibold underline underline-offset-4" aria-label={`Ver detalhes do pedido ${o.code}`}>
                    Ver detalhes
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="border border-line px-5 py-5 text-sm">
        <SavedSkinReports />
      </div>
    </section>
  );
}
