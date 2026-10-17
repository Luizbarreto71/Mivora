/** Password rules for e-mail accounts, shown live in the forms and checked again on the server. */
export const PASSWORD_RULES = [
  { id: "length", label: "Pelo menos 8 caracteres", test: (p: string) => p.length >= 8 },
  { id: "upper", label: "Uma letra maiúscula", test: (p: string) => /[A-ZÀ-Ý]/.test(p) },
  { id: "lower", label: "Uma letra minúscula", test: (p: string) => /[a-zß-ÿ]/.test(p) },
  { id: "number", label: "Um número", test: (p: string) => /\d/.test(p) },
  { id: "special", label: "Um caractere especial (ex.: ! @ # $ %)", test: (p: string) => /[^A-Za-zÀ-ÿ0-9\s]/.test(p) },
] as const;

export const passwordOk = (p: string) => p.length <= 72 && PASSWORD_RULES.every((r) => r.test(p));

/** Only relative paths inside the store (never another site) */
export function safeNext(value: string | null | undefined, fallback = "/minha-conta") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
