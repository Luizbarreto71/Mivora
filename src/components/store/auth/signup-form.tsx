"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { signUpWithEmail } from "@/lib/auth/actions";
import { passwordOk } from "@/lib/auth/password";
import { formatCpf, formatPhoneInput, isValidCpf, isValidEmail, normalizeBrPhone, normalizeCpf } from "@/lib/store/checkout-data";
import { useStoreConfig } from "../store-config";
import { PasswordInput, PasswordRules } from "./password-input";
import { SocialSignIn } from "./social-sign-in";

const GENDER_OPTIONS = [
  { value: "", label: "Prefiro não responder agora" },
  { value: "feminino", label: "Feminino" },
  { value: "masculino", label: "Masculino" },
  { value: "nao_binario", label: "Não binário" },
  { value: "outro", label: "Outro" },
  { value: "prefiro_nao_informar", label: "Prefiro não informar" },
];

type Values = { firstName: string; lastName: string; email: string; password: string; confirm: string; cpf: string; phone: string; birthDate: string; gender: string };

function validate(v: Values) {
  const e: Partial<Record<keyof Values, string>> = {};
  if (!v.firstName.trim()) e.firstName = "Informe seu nome.";
  if (!v.lastName.trim()) e.lastName = "Informe seu sobrenome.";
  if (!isValidEmail(v.email)) e.email = "Digite um e-mail válido, ex.: nome@exemplo.com.br.";
  if (!passwordOk(v.password)) e.password = "A senha não cumpre todos os requisitos.";
  if (v.confirm !== v.password) e.confirm = "As senhas não são iguais.";
  if (normalizeCpf(v.cpf) && !isValidCpf(v.cpf)) e.cpf = normalizeCpf(v.cpf).length === 11 ? "CPF inválido. Confira os números." : "Informe o CPF com 11 números.";
  if (v.phone.replace(/\D/g, "") && !normalizeBrPhone(v.phone)) e.phone = "Digite um telefone com DDD, ex.: (11) 91234-5678.";
  if (v.birthDate && (v.birthDate < "1900-01-01" || new Date(`${v.birthDate}T12:00:00Z`).getTime() > Date.now())) e.birthDate = "Data de nascimento inválida.";
  return e;
}

/** "CRIE SUA CONTA MIVORA": real sign-up in Supabase Auth, followed by the e-mail confirmation. */
export function SignUpForm({ next, initialEmail = "" }: { next: string; initialEmail?: string }) {
  const router = useRouter();
  const { socialProviders } = useStoreConfig();
  const [v, setV] = useState<Values>({ firstName: "", lastName: "", email: initialEmail, password: "", confirm: "", cpf: "", phone: "", birthDate: "", gender: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Values>) => {
    setV((old) => ({ ...old, ...patch }));
    setErrors((old) => {
      const copy = { ...old };
      for (const k of Object.keys(patch)) delete copy[k as keyof Values];
      return copy;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local = validate(v);
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) {
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setBusy(true);
    const result = await signUpWithEmail({ ...v, next }).catch(() => ({ ok: false as const, error: "Não foi possível criar a conta agora. Tente de novo em instantes." }));
    if (result.ok) {
      router.push(`/confirmar-email?email=${encodeURIComponent(result.email)}&next=${encodeURIComponent(result.next)}&enviado=1`);
      return;
    }
    setBusy(false);
    if ("fields" in result && result.fields) setErrors(result.fields as Partial<Record<keyof Values, string>>);
    setFormError(result.error);
  };

  const invalid = (k: keyof Values) => (errors[k] ? true : undefined);

  return (
    <div className="space-y-8">
      <form onSubmit={submit} noValidate aria-label="Criar conta" className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field label="Nome" htmlFor="su-first" error={errors.firstName}>
          <Input id="su-first" autoComplete="given-name" maxLength={60} value={v.firstName} onChange={(e) => set({ firstName: e.target.value })} aria-invalid={invalid("firstName")} />
        </Field>
        <Field label="Sobrenome" htmlFor="su-last" error={errors.lastName}>
          <Input id="su-last" autoComplete="family-name" maxLength={80} value={v.lastName} onChange={(e) => set({ lastName: e.target.value })} aria-invalid={invalid("lastName")} />
        </Field>
        <Field label="E-mail" htmlFor="su-email" error={errors.email} className="sm:col-span-2">
          <Input id="su-email" type="email" inputMode="email" autoComplete="email" maxLength={254} value={v.email} onChange={(e) => set({ email: e.target.value })} aria-invalid={invalid("email")} placeholder="nome@exemplo.com.br" />
        </Field>
        <Field label="Senha" htmlFor="su-password" error={errors.password}>
          <PasswordInput id="su-password" autoComplete="new-password" maxLength={72} value={v.password} onChange={(e) => set({ password: e.target.value })} aria-invalid={invalid("password")} aria-describedby="su-rules" />
        </Field>
        <Field label="Confirmar senha" htmlFor="su-confirm" error={errors.confirm}>
          <PasswordInput id="su-confirm" autoComplete="new-password" maxLength={72} value={v.confirm} onChange={(e) => set({ confirm: e.target.value })} aria-invalid={invalid("confirm")} />
        </Field>
        <div className="-mt-1 sm:col-span-2">
          <PasswordRules id="su-rules" password={v.password} />
        </div>
        <Field label="CPF (opcional)" htmlFor="su-cpf" error={errors.cpf} hint="Se preferir, informe na finalização da compra.">
          <Input id="su-cpf" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" maxLength={14} value={v.cpf} onChange={(e) => set({ cpf: formatCpf(e.target.value) })} aria-invalid={invalid("cpf")} />
        </Field>
        <Field label="Telefone ou celular (opcional)" htmlFor="su-phone" error={errors.phone} hint="Usado só para falar sobre seus pedidos.">
          <Input id="su-phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(11) 91234-5678" maxLength={15} value={v.phone} onChange={(e) => set({ phone: formatPhoneInput(e.target.value) })} aria-invalid={invalid("phone")} />
        </Field>
        <Field label="Data de nascimento (opcional)" htmlFor="su-birth" error={errors.birthDate}>
          <Input id="su-birth" type="date" autoComplete="bday" min="1900-01-01" value={v.birthDate} onChange={(e) => set({ birthDate: e.target.value })} aria-invalid={invalid("birthDate")} />
        </Field>
        <Field label="Gênero (opcional)" htmlFor="su-gender">
          <Select id="su-gender" value={v.gender} onChange={(e) => set({ gender: e.target.value })}>
            {GENDER_OPTIONS.map((g) => (
              <option key={g.value || "none"} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
        {formError ? (
          <p className="border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm text-danger sm:col-span-2" role="alert">
            {formError}
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <p className="mb-4 text-xs leading-relaxed text-muted">
            Ao criar sua conta, você concorda com os{" "}
            <Link href="/termos-de-uso" className="underline underline-offset-2">
              Termos de uso
            </Link>{" "}
            e com a{" "}
            <Link href="/politica-de-privacidade" className="underline underline-offset-2">
              Política de privacidade
            </Link>
            . Data de nascimento e gênero são opcionais e só servem para personalizar o atendimento.
          </p>
          <Button type="submit" size="lg" className="w-full sm:w-auto sm:min-w-[18rem]" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Criando sua conta…" : "Criar minha conta"}
          </Button>
        </div>
      </form>
      <p className="text-sm text-muted">
        Já tem uma conta?{" "}
        <Link href={`/entrar?next=${encodeURIComponent(next)}`} className="font-semibold text-ink underline underline-offset-4">
          Entrar
        </Link>
      </p>
      {socialProviders.google || socialProviders.apple ? (
        <div className="max-w-sm space-y-3">
          <div className="flex items-center gap-3 text-xs text-muted" role="separator">
            <span className="h-px flex-1 bg-line" />
            ou crie sua conta com
            <span className="h-px flex-1 bg-line" />
          </div>
          <SocialSignIn providers={socialProviders} next={next} />
        </div>
      ) : null}
    </div>
  );
}
