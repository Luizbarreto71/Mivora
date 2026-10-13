import type { z } from "zod";

export type ActionState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** Changes on every submission so forms can react (e.g. reset) */
  at?: number;
};

export const initialActionState: ActionState = { ok: false };

export function fail(message: string, errors?: Record<string, string>): ActionState {
  return { ok: false, message, errors, at: Date.now() };
}

export function success(message = "Alterações salvas."): ActionState {
  return { ok: true, message, at: Date.now() };
}

export function zodErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Translates common Postgres/PostgREST errors into friendly Portuguese. */
export function dbErrorMessage(error: { message: string; code?: string }) {
  if (error.code === "23505" || /duplicate key/i.test(error.message)) {
    if (/slug/.test(error.message)) return "Já existe um registro com esta URL (slug). Escolha outra.";
    if (/sku/.test(error.message)) return "Este SKU já está em uso.";
    return "Já existe um registro com estes dados.";
  }
  if (error.code === "23503" || /foreign key/i.test(error.message)) return "Este registro está vinculado a outros dados e não pode ser removido. Arquive-o ou despublique-o.";
  if (/row-level security|not_authorized|permission denied/i.test(error.message)) return "Você não tem permissão para esta ação.";
  if (/insufficient_stock/.test(error.message)) return "Estoque insuficiente para esta operação.";
  if (/compliance_required/.test(error.message))
    return "Venda bloqueada: registre a verificação de documentação e regularização (seção “Fornecedor e regularização”) antes de marcar este produto como disponível.";
  if (/check constraint/i.test(error.message)) {
    if (/compare/.test(error.message)) return "O preço anterior deve ser maior que o preço atual.";
    if (/tracked_requires_qty/.test(error.message)) return "Informe a quantidade para controlar o estoque numericamente.";
    return "Algum valor informado é inválido.";
  }
  return "Não foi possível salvar. Tente novamente.";
}

export function formString(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function formNullable(fd: FormData, key: string) {
  const v = formString(fd, key);
  return v === "" ? null : v;
}

export function formBool(fd: FormData, key: string) {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function formInt(fd: FormData, key: string, fallback = 0) {
  const n = Number.parseInt(formString(fd, key), 10);
  return Number.isFinite(n) ? n : fallback;
}
