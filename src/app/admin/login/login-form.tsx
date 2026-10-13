"use client";

import { ActionForm, SubmitButton } from "@/components/admin/form-kit";
import { Field, Input } from "@/components/ui/form";
import { signIn } from "@/lib/admin/actions/auth";

export function LoginForm() {
  return (
    <ActionForm action={signIn} className="space-y-5">
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Senha" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Entrando…">
        Entrar
      </SubmitButton>
    </ActionForm>
  );
}
