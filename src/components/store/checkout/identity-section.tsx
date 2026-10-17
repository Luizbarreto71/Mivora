"use client";

import { LogOut, Pencil, UserRound } from "lucide-react";
import { Checkbox, Field, Input } from "@/components/ui/form";
import type { Account } from "@/lib/store/account-actions";
import { formatCpf, formatPhoneInput, normalizeCpf, type CheckoutIdentity, type IdentityField } from "@/lib/store/checkout-data";
import { formatBrPhone, normalizeBrPhone } from "@/lib/store/customer";

const PROVIDER_LABEL: Record<string, string> = { google: "Google", apple: "Apple", email: "e-mail e senha" };

export function maskedCpf(cpf: string) {
  const d = normalizeCpf(cpf);
  return d.length === 11 ? `***.***.${d.slice(6, 9)}-${d.slice(9)}` : "";
}

type Props = {
  account: Account | null | undefined;
  identity: CheckoutIdentity;
  onChange: (patch: Partial<CheckoutIdentity>) => void;
  errors: Partial<Record<IdentityField, string>>;
  editing: boolean;
  complete: boolean;
  onEdit: () => void;
  onSignOut: () => void;
  signingOut: boolean;
  notice: { tone: "info" | "error"; text: string } | null;
};

/** "Seus dados" of the signed-in account (buying needs an account): only what is missing is asked. */
export function IdentitySection({ account, identity, onChange, errors, editing, complete, onEdit, onSignOut, signingOut, notice }: Props) {
  const signedIn = Boolean(account);
  return (
    <section aria-labelledby="seus-dados" className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="seus-dados" className="text-lg font-semibold">
          Seus dados
        </h2>
        {account ? <span className="text-xs text-muted">Conectada com {PROVIDER_LABEL[account.provider] ?? account.provider}</span> : null}
      </div>

      {notice ? (
        <p className={notice.tone === "error" ? "border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger" : "border border-rose-ink/20 bg-rose-soft px-4 py-3 text-sm text-ink"} role="status">
          {notice.text}
        </p>
      ) : null}

      {account === undefined ? <div className="h-40 animate-pulse bg-ivory" aria-busy="true" /> : null}

      {account && complete && !editing ? (
        <div className="flex flex-wrap items-start justify-between gap-4 border border-line p-5" role="region" aria-label="Dados da conta">
          <div className="flex min-w-0 gap-3">
            <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-rose-ink" strokeWidth={1.5} />
            <div className="min-w-0 text-sm">
              <p className="font-semibold">
                {identity.firstName} {identity.lastName}
              </p>
              <p className="mt-0.5 break-words text-muted">{account.email}</p>
              <p className="mt-0.5 text-muted">
                {normalizeBrPhone(identity.phone) ? formatBrPhone(normalizeBrPhone(identity.phone)!) : ""}
                {maskedCpf(identity.cpf) ? ` · CPF ${maskedCpf(identity.cpf)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 text-xs font-semibold underline underline-offset-4">
              <Pencil className="h-3.5 w-3.5" /> Editar dados
            </button>
            <button type="button" onClick={onSignOut} disabled={signingOut} className="inline-flex items-center gap-1.5 text-xs text-muted underline underline-offset-4 hover:text-ink">
              <LogOut className="h-3.5 w-3.5" /> Sair da conta
            </button>
          </div>
        </div>
      ) : null}

      {account && (editing || !complete) ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {account && !complete ? <p className="text-sm text-ink-soft sm:col-span-2">Complete os dados que faltam para finalizar a compra. Eles ficam salvos na sua conta.</p> : null}
          <Field label="E-mail" htmlFor="co-email" error={errors.email} className="sm:col-span-2" hint={signedIn ? "E-mail da sua conta" : undefined}>
            <Input
              id="co-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={identity.email}
              onChange={(e) => onChange({ email: e.target.value })}
              disabled={signedIn}
              aria-invalid={errors.email ? true : undefined}
              placeholder="nome@exemplo.com.br"
            />
          </Field>
          <Field label="Primeiro nome" htmlFor="co-first" error={errors.firstName}>
            <Input id="co-first" autoComplete="given-name" value={identity.firstName} onChange={(e) => onChange({ firstName: e.target.value })} aria-invalid={errors.firstName ? true : undefined} maxLength={60} />
          </Field>
          <Field label="Sobrenome" htmlFor="co-last" error={errors.lastName}>
            <Input id="co-last" autoComplete="family-name" value={identity.lastName} onChange={(e) => onChange({ lastName: e.target.value })} aria-invalid={errors.lastName ? true : undefined} maxLength={80} />
          </Field>
          <Field label="CPF" htmlFor="co-cpf" error={errors.cpf} hint="Necessário para emitir o pedido e processar o pagamento">
            <Input
              id="co-cpf"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              value={identity.cpf}
              onChange={(e) => onChange({ cpf: formatCpf(e.target.value) })}
              aria-invalid={errors.cpf ? true : undefined}
              maxLength={14}
            />
          </Field>
          <Field label="Telefone com DDD" htmlFor="co-phone" error={errors.phone}>
            <Input
              id="co-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(11) 91234-5678"
              value={identity.phone}
              onChange={(e) => onChange({ phone: formatPhoneInput(e.target.value) })}
              aria-invalid={errors.phone ? true : undefined}
              maxLength={15}
            />
          </Field>
          <Checkbox
            className="sm:col-span-2"
            label="Quero receber novidades e ofertas da MIVORA por e-mail e WhatsApp (opcional)"
            checked={identity.marketing}
            onChange={(e) => onChange({ marketing: e.target.checked })}
          />
        </div>
      ) : null}
    </section>
  );
}
