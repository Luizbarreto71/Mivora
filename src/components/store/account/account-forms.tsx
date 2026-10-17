"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { changePassword } from "@/lib/auth/actions";
import { passwordOk } from "@/lib/auth/password";
import { saveMyAccount, saveMyAddress, type Account, type AccountAddress } from "@/lib/store/account-actions";
import { EMPTY_ADDRESS, formatCep, formatCpf, formatPhoneInput, isValidCpf, normalizeCpf, UFS, validateAddress, type CheckoutAddress } from "@/lib/store/checkout-data";
import { normalizeBrPhone } from "@/lib/store/customer";
import { PasswordInput, PasswordRules } from "../auth/password-input";

export const GENDER_LABEL: Record<string, string> = {
  feminino: "Feminino",
  masculino: "Masculino",
  nao_binario: "Não binário",
  outro: "Outro",
  prefiro_nao_informar: "Prefiro não informar",
};

function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (error)
    return (
      <p className="text-sm text-danger" role="alert">
        {error}
      </p>
    );
  if (success)
    return (
      <p className="text-sm text-success" role="status">
        {success}
      </p>
    );
  return null;
}

/** Personal data of the account (saved through save_my_account; birth date and gender are optional). */
export function PersonalDataForm({ account, onSaved, onCancel }: { account: Account; onSaved: (patch: Partial<Account>) => void; onCancel: () => void }) {
  const [v, setV] = useState({
    firstName: account.firstName ?? "",
    lastName: account.lastName ?? "",
    phone: account.phone ? formatPhoneInput(account.phone) : "",
    cpf: account.cpf ? formatCpf(account.cpf) : "",
    birthDate: account.birthDate ?? "",
    gender: account.gender ?? "",
    marketing: account.marketing,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!v.firstName.trim()) local.firstName = "Informe seu nome.";
    if (!v.lastName.trim()) local.lastName = "Informe seu sobrenome.";
    if (!normalizeBrPhone(v.phone)) local.phone = "Digite um telefone com DDD, ex.: (11) 91234-5678.";
    if (normalizeCpf(v.cpf) && !isValidCpf(v.cpf)) local.cpf = "CPF inválido. Confira os números.";
    if (v.birthDate && (v.birthDate < "1900-01-01" || new Date(`${v.birthDate}T12:00:00Z`).getTime() > Date.now())) local.birthDate = "Data de nascimento inválida.";
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;
    setBusy(true);
    const r = await saveMyAccount({
      firstName: v.firstName,
      lastName: v.lastName,
      phone: v.phone,
      cpf: normalizeCpf(v.cpf),
      marketing: v.marketing,
      profile: { birthDate: v.birthDate || null, gender: v.gender || null },
    }).catch(() => ({ ok: false as const, error: "Não foi possível salvar agora. Tente de novo.", field: undefined }));
    setBusy(false);
    if (!r.ok) {
      if (r.field) setErrors({ [r.field]: r.error });
      setFormError(r.error);
      return;
    }
    onSaved({
      saved: true,
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      phone: normalizeBrPhone(v.phone),
      cpf: normalizeCpf(v.cpf) || null,
      birthDate: v.birthDate || null,
      gender: v.gender || null,
      marketing: v.marketing,
    });
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Dados pessoais" className="grid gap-4 sm:grid-cols-2">
      <Field label="Nome" htmlFor="pd-first" error={errors.firstName}>
        <Input id="pd-first" autoComplete="given-name" maxLength={60} value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} aria-invalid={errors.firstName ? true : undefined} />
      </Field>
      <Field label="Sobrenome" htmlFor="pd-last" error={errors.lastName}>
        <Input id="pd-last" autoComplete="family-name" maxLength={80} value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} aria-invalid={errors.lastName ? true : undefined} />
      </Field>
      <Field label="Telefone ou celular" htmlFor="pd-phone" error={errors.phone}>
        <Input id="pd-phone" type="tel" inputMode="tel" maxLength={15} placeholder="(11) 91234-5678" value={v.phone} onChange={(e) => setV({ ...v, phone: formatPhoneInput(e.target.value) })} aria-invalid={errors.phone ? true : undefined} />
      </Field>
      <Field label="CPF" htmlFor="pd-cpf" error={errors.cpf}>
        <Input id="pd-cpf" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" value={v.cpf} onChange={(e) => setV({ ...v, cpf: formatCpf(e.target.value) })} aria-invalid={errors.cpf ? true : undefined} />
      </Field>
      <Field label="Data de nascimento (opcional)" htmlFor="pd-birth" error={errors.birthDate}>
        <Input id="pd-birth" type="date" min="1900-01-01" value={v.birthDate} onChange={(e) => setV({ ...v, birthDate: e.target.value })} aria-invalid={errors.birthDate ? true : undefined} />
      </Field>
      <Field label="Gênero (opcional)" htmlFor="pd-gender">
        <Select id="pd-gender" value={v.gender} onChange={(e) => setV({ ...v, gender: e.target.value })}>
          <option value="">Não informado</option>
          {Object.entries(GENDER_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Checkbox className="sm:col-span-2" label="Quero receber novidades e ofertas da MIVORA por e-mail e WhatsApp" checked={v.marketing} onChange={(e) => setV({ ...v, marketing: e.target.checked })} />
      <div className="space-y-3 sm:col-span-2">
        <FormMessage error={formError} />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar dados
          </Button>
          <button type="button" onClick={onCancel} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}

/** Password change for e-mail accounts: the current password is checked on the server first. */
export function ChangePasswordForm() {
  const [v, setV] = useState({ current: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!v.current) local.current = "Digite a senha atual.";
    if (!passwordOk(v.password)) local.password = "A senha não cumpre todos os requisitos.";
    if (v.confirm !== v.password) local.confirm = "As senhas não são iguais.";
    setErrors(local);
    setMessage({});
    if (Object.keys(local).length) return;
    setBusy(true);
    const r = await changePassword(v).catch(() => ({ ok: false as const, error: "Não foi possível alterar agora. Tente de novo." }));
    setBusy(false);
    if (r.ok) {
      setV({ current: "", password: "", confirm: "" });
      setMessage({ success: "Senha alterada com sucesso." });
      return;
    }
    if ("fields" in r && r.fields) setErrors(r.fields);
    setMessage({ error: r.error });
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Alterar senha" className="grid gap-4 sm:grid-cols-2">
      <Field label="Senha atual" htmlFor="cp-current" error={errors.current} className="sm:col-span-2">
        <PasswordInput id="cp-current" autoComplete="current-password" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} aria-invalid={errors.current ? true : undefined} />
      </Field>
      <Field label="Nova senha" htmlFor="cp-new" error={errors.password}>
        <PasswordInput id="cp-new" autoComplete="new-password" maxLength={72} value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} aria-invalid={errors.password ? true : undefined} />
      </Field>
      <Field label="Confirmar nova senha" htmlFor="cp-confirm" error={errors.confirm}>
        <PasswordInput id="cp-confirm" autoComplete="new-password" maxLength={72} value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} aria-invalid={errors.confirm ? true : undefined} />
      </Field>
      <div className="sm:col-span-2">
        <PasswordRules password={v.password} />
      </div>
      <div className="space-y-3 sm:col-span-2">
        <FormMessage error={message.error} success={message.success} />
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Alterar senha
        </Button>
      </div>
    </form>
  );
}

/** New saved address (validated like the checkout's). */
export function AddressForm({ recipient, onSaved, onCancel }: { recipient: string; onSaved: (a: AccountAddress) => void; onCancel: () => void }) {
  const [v, setV] = useState<CheckoutAddress>({ ...EMPTY_ADDRESS, recipient });
  const [isDefault, setIsDefault] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof CheckoutAddress, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<CheckoutAddress>) => setV((old) => ({ ...old, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local = validateAddress(v);
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;
    setBusy(true);
    const r = await saveMyAddress({ ...v, isDefault }).catch(() => ({ ok: false as const, error: "Não foi possível salvar o endereço agora." }));
    setBusy(false);
    if (r.ok) onSaved(r.value);
    else setFormError(r.error);
  };
  const f = (key: keyof CheckoutAddress, label: string, props: React.ComponentProps<typeof Input> = {}, className = "") => (
    <Field label={label} htmlFor={`ad-${key}`} error={errors[key]} className={className}>
      <Input id={`ad-${key}`} value={v[key]} onChange={(e) => set({ [key]: key === "cep" ? formatCep(e.target.value) : e.target.value })} aria-invalid={errors[key] ? true : undefined} {...props} />
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate aria-label="Novo endereço" className="grid gap-4 sm:grid-cols-6">
      {f("recipient", "Nome de quem vai receber", { maxLength: 120 }, "sm:col-span-6")}
      {f("cep", "CEP", { inputMode: "numeric", maxLength: 9, placeholder: "00000-000" }, "sm:col-span-2")}
      {f("street", "Rua", { maxLength: 120 }, "sm:col-span-4")}
      {f("number", "Número", { maxLength: 20 }, "sm:col-span-2")}
      {f("complement", "Complemento (opcional)", { maxLength: 80 }, "sm:col-span-4")}
      {f("district", "Bairro", { maxLength: 80 }, "sm:col-span-3")}
      {f("city", "Cidade", { maxLength: 80 }, "sm:col-span-2")}
      <Field label="Estado" htmlFor="ad-uf" error={errors.uf} className="sm:col-span-1">
        <Select id="ad-uf" value={v.uf} onChange={(e) => set({ uf: e.target.value })} aria-invalid={errors.uf ? true : undefined}>
          <option value="">UF</option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </Select>
      </Field>
      {f("reference", "Referência (opcional)", { maxLength: 120 }, "sm:col-span-6")}
      <Checkbox className="sm:col-span-6" label="Usar como endereço principal" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
      <div className="space-y-3 sm:col-span-6">
        <FormMessage error={formError} />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar endereço
          </Button>
          <button type="button" onClick={onCancel} className="text-sm text-muted underline underline-offset-4 hover:text-ink">
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}
