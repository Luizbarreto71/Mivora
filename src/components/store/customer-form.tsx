"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { formatBrPhone, saveDeviceCustomer, type CustomerProfile } from "@/lib/store/customer";
import { registerCustomer, type RegisterResult } from "@/lib/store/customer-actions";

/** Registration form (name, WhatsApp, e-mail, optional marketing opt-in). Remembered on this device after saving. */
export function CustomerForm({
  initial,
  source,
  submitLabel,
  onDone,
  onCancel,
}: {
  initial?: CustomerProfile | null;
  source: "checkout" | "conta";
  submitLabel: string;
  onDone: (customer: CustomerProfile) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial ? formatBrPhone(initial.phone) : "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [marketing, setMarketing] = useState(initial?.marketing ?? false);
  const [result, setResult] = useState<Extract<RegisterResult, { ok: false }> | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setResult(null);
    startTransition(async () => {
      const r = await registerCustomer({ name, email, phone, marketing, source }).catch(() => ({ ok: false as const, error: "Não foi possível salvar o cadastro agora. Tente novamente." }));
      if (!r.ok) {
        setResult(r);
        return;
      }
      saveDeviceCustomer(r.customer);
      onDone(r.customer);
    });
  };
  const fieldError = (f: "name" | "email" | "phone") => (result?.field === f ? result.error : null);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-5 sm:grid-cols-2"
    >
      <Field label="Nome completo" htmlFor={`${id}-name`} error={fieldError("name")} className="sm:col-span-2">
        <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} required aria-invalid={fieldError("name") ? true : undefined} />
      </Field>
      <Field label="WhatsApp com DDD" htmlFor={`${id}-phone`} error={fieldError("phone")}>
        <Input
          id={`${id}-phone`}
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^0-9+() -]/g, ""))}
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 91234-5678"
          maxLength={20}
          required
          aria-invalid={fieldError("phone") ? true : undefined}
        />
      </Field>
      <Field label="E-mail" htmlFor={`${id}-email`} error={fieldError("email")}>
        <Input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required aria-invalid={fieldError("email") ? true : undefined} />
      </Field>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink sm:col-span-2">
        <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-ink" />
        <span>Quero receber novidades, lançamentos e ofertas da MIVORA por e-mail e WhatsApp (opcional).</span>
      </label>
      {result && !result.field ? (
        <p className="text-sm text-danger sm:col-span-2" role="alert">
          {result.error}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" disabled={pending} className="sm:min-w-56">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Salvando…" : submitLabel}
        </Button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="text-xs text-muted underline underline-offset-4 hover:text-ink">
            Cancelar
          </button>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-muted sm:col-span-2">
        Usamos seus dados para registrar e atender seus pedidos. Não é preciso criar senha. Saiba mais na{" "}
        <Link href="/politica-de-privacidade" className="underline">
          Política de Privacidade
        </Link>
        .
      </p>
    </form>
  );
}
